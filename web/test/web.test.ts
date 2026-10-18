import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';

process.env.DATABASE_URL ||= 'postgresql://lg@localhost:55432/loopguard';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_y';
process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_team_m';
delete process.env.RESEND_API_KEY;

import { db } from '../lib/db';
import { requestLogin, verifyLogin, userFromSessionToken } from '../lib/auth';
import { validate, ingest } from '../lib/sync';
import { dispatch, slackChannel, discordChannel, allowedWebhook, tripAlert, channelsFor } from '../lib/alerts';
import { getStripe, handleWebhook, createCheckout, WebhookProcessingError } from '../lib/stripe';
import { hasPro, hasActiveSubscription } from '../lib/plans';
import { dailySeries } from '../lib/chart';
import { POST as syncPOST } from '../app/api/sync/route';
import { randomToken, sha256 } from '../lib/crypto';

before(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","LoginToken","Session","ApiKey","UsageRow","Trip","StripeEvent" CASCADE');
});

const email = () => `u${Math.random().toString(36).slice(2)}@example.com`;

test('magic link login: one-time, creates user + session', async () => {
  const e = email();
  const link = await requestLogin(e);
  const token = new URL(link).searchParams.get('token')!;
  const r = await verifyLogin(token);
  assert.ok(r);
  assert.equal((await userFromSessionToken(r!.sessionToken))!.email, e);
  assert.equal(await verifyLogin(token), null); // reused link rejected
  await assert.rejects(requestLogin('not-an-email'));
});

test('validate drops unknown fields and bad rows', () => {
  const v = validate({ version: 1, machine: 'm1', rows: [
    { agent: 'claude', session: 's', day: '2026-10-16', model: 'sonnet', inputTokens: 5, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0.5, events: 1, prompt: 'SECRET', path: '/home/x' },
    { agent: 'evil', session: 's', day: '2026-10-16', model: 'x' },
    { agent: 'codex', session: 's', day: 'bad', model: 'x' }],
    trips: [{ t: '2026-10-16T10:00:00Z', agent: 'codex', session: 's', kind: 'loop', halt: false, sessionCost: 1, dailyCost: 2, reason: 'SECRET' }] });
  assert.equal(v.rows.length, 1);
  assert.ok(!JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? Number(x) : x).includes('SECRET'));
  assert.equal(v.trips.length, 1);
  assert.throws(() => validate({ version: 2 }));
});

test('alerts: slack/discord payloads, failure isolation, webhook allow-list', async () => {
  const calls: any[] = [];
  const ok: any = async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const bad: any = async () => ({ ok: false, status: 500 });
  const a = tripAlert([{ agent: 'claude', kind: 'session_cap', halt: true, sessionCost: 25.5, dailyCost: 40 }], 'http://x/dashboard');
  const res = await dispatch([slackChannel('https://hooks.slack.com/services/A/B/C', ok), discordChannel('https://discord.com/api/webhooks/1/x', bad)], a);
  assert.deepEqual(res.map(r => r.ok), [true, false]);
  assert.match(calls[0].body.text, /session cap — session halted/);
  assert.equal(allowedWebhook('https://hooks.slack.com/services/T0/B0/xyz', 'slack'), true);
  assert.equal(allowedWebhook('http://169.254.169.254/latest', 'slack'), false);
  assert.equal(allowedWebhook('https://discord.com/api/webhooks/123/abc-DEF', 'discord'), true);
  assert.equal(channelsFor({ email: 'a@b.c', alertEmail: true, slackWebhook: null, discordWebhook: 'https://discord.com/api/webhooks/1/x' }).length, 2);
});

async function userWithKey(extra: any = {}) {
  const u = await db.user.create({ data: { email: email(), ...extra } });
  const key = `lg_${randomToken(24)}`;
  await db.apiKey.create({ data: { userId: u.id, hash: sha256(key), prefix: key.slice(0, 9) } });
  return { u, key };
}
const payload = (cost: number) => ({ version: 1, machine: 'mach1', rows: [
  { agent: 'claude', session: 'abc', day: '2026-10-16', model: 'claude-sonnet-4-5', inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, cost, events: 3, estimated: false }],
  trips: [{ t: '2026-10-16T12:00:00.000Z', agent: 'claude', session: 'abc', kind: 'session_cap', halt: true, tool: 'Bash', sessionCost: cost, dailyCost: cost }] });

test('sync route: auth by API key, upserts rows idempotently, trips deduped, returns remote pause', async () => {
  const { u, key } = await userWithKey({ pausedUntil: new Date(Date.now() + 3600e3), alertEmail: false });
  const call = (body: any, k = key) => syncPOST(new Request('http://localhost/api/sync', { method: 'POST', headers: { authorization: `Bearer ${k}` }, body: JSON.stringify(body) }));
  assert.equal((await call(payload(1), 'lg_wrong')).status, 401);
  const r1 = await call(payload(1)); assert.equal(r1.status, 200);
  const j1: any = await r1.json(); assert.equal(j1.newTrips, 1); assert.ok(j1.pausedUntil);
  const j2: any = await (await call(payload(2.5))).json(); assert.equal(j2.newTrips, 0);
  const rows = await db.usageRow.findMany({ where: { userId: u.id } });
  assert.equal(rows.length, 1); assert.equal(rows[0].cost, 2.5);
});

test('sync requires Pro after trial', async () => {
  const { u } = await userWithKey({ createdAt: new Date(Date.now() - 30 * 864e5) });
  await assert.rejects(ingest(u, payload(1)), /requires Pro/);
  assert.equal(hasPro({ plan: 'pro', createdAt: new Date(0) }), true);
});

test('stripe: refuses live keys; checkout builds subscription session (fake client)', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_x';
  assert.throws(() => getStripe(), /Refusing non-test/);
  process.env.STRIPE_SECRET_KEY = 'rk_live_x';
  assert.throws(() => getStripe(), /Refusing non-test/);
  process.env.ALLOW_LIVE_STRIPE = '1';
  assert.ok(getStripe()); // restricted live keys are accepted once live mode is deliberately enabled
  delete process.env.ALLOW_LIVE_STRIPE;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  let args: any;
  const fake: any = { checkout: { sessions: { create: async (a: any) => { args = a; return { url: 'https://checkout.stripe.test/x' }; } } } };
  await createCheckout({ id: 'u1', email: 'a@b.c', stripeCustomerId: null }, 'team_monthly', 1, fake);
  assert.equal(args.mode, 'subscription');
  assert.deepEqual(args.line_items, [{ price: 'price_team_m', quantity: 3 }]); // min 3 seats
  await createCheckout({ id: 'u1', email: 'a@b.c', stripeCustomerId: 'cus_1' }, 'pro_yearly', 9, fake);
  assert.deepEqual(args.line_items, [{ price: 'price_pro_y', quantity: 1 }]);
  assert.equal(args.customer, 'cus_1');
});

test('stripe webhook: signature verified, plan applied, duplicate ignored, cancel downgrades', async () => {
  const u = await db.user.create({ data: { email: email() } });
  const stripe = new Stripe('sk_test_dummy');
  const ev = (id: string, type: string, status: string) => JSON.stringify({ id, object: 'event', type, data: { object: {
    id: 'sub_1', object: 'subscription', customer: 'cus_9', status, metadata: { userId: u.id },
    items: { data: [{ price: { id: 'price_pro_y' }, quantity: 1 }] } } } });
  const sign = (p: string) => stripe.webhooks.generateTestHeaderString({ payload: p, secret: 'whsec_test_secret' });
  const p1 = ev('evt_1', 'customer.subscription.created', 'active');
  await assert.rejects(handleWebhook(p1, 't=1,v1=bad', stripe));
  assert.equal((await handleWebhook(p1, sign(p1), stripe)).duplicate, false);
  let x = await db.user.findUnique({ where: { id: u.id } });
  assert.equal(x!.plan, 'pro'); assert.equal(x!.planInterval, 'year'); assert.equal(x!.stripeCustomerId, 'cus_9');
  assert.equal((await handleWebhook(p1, sign(p1), stripe)).duplicate, true);
  const p2 = ev('evt_2', 'customer.subscription.deleted', 'canceled');
  await handleWebhook(p2, sign(p2), stripe);
  x = await db.user.findUnique({ where: { id: u.id } });
  assert.equal(x!.plan, 'free');
});

test('chart series fills 30 days and stacks agents', () => {
  const now = new Date(2026, 9, 16);
  const s = dailySeries([{ day: '2026-10-16', agent: 'claude', cost: 1 }, { day: '2026-10-16', agent: 'codex', cost: 2 }, { day: '2025-01-01', agent: 'x', cost: 9 }], 30, now);
  assert.equal(s.length, 30); assert.equal(s[29].total, 3); assert.equal(s[0].day, '2026-09-17');
});

test('stripe webhook: stale subscription cancel does not downgrade; failures are retryable', async () => {
  const u = await db.user.create({ data: { email: email(), plan: 'pro', stripeCustomerId: 'cus_s', stripeSubscriptionId: 'sub_new', subscriptionStatus: 'active' } });
  const stripe = new Stripe('sk_test_dummy');
  const sign = (p: string) => stripe.webhooks.generateTestHeaderString({ payload: p, secret: 'whsec_test_secret' });
  const old = JSON.stringify({ id: 'evt_old', object: 'event', type: 'customer.subscription.deleted', data: { object: {
    id: 'sub_old', object: 'subscription', customer: 'cus_s', status: 'canceled', metadata: { userId: u.id },
    items: { data: [{ price: { id: 'price_pro_m' }, quantity: 1 }] } } } });
  await handleWebhook(old, sign(old), stripe);
  assert.equal((await db.user.findUnique({ where: { id: u.id } }))!.plan, 'pro');
  // Processing error: event must not be recorded, so Stripe's retry gets processed.
  const bad = JSON.stringify({ id: 'evt_bad', object: 'event', type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', object: 'checkout.session', customer: 'cus_s', subscription: 'sub_x', metadata: { userId: u.id } } } });
  const failing: any = Object.assign(Object.create(stripe), { subscriptions: { retrieve: async () => { throw new Error('stripe down'); } } });
  await assert.rejects(handleWebhook(bad, sign(bad), failing), WebhookProcessingError);
  assert.equal(await db.stripeEvent.findUnique({ where: { id: 'evt_bad' } }), null);
});

test('hasActiveSubscription', () => {
  assert.equal(hasActiveSubscription({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }), true);
  assert.equal(hasActiveSubscription({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'canceled' }), false);
  assert.equal(hasActiveSubscription({ stripeSubscriptionId: null, subscriptionStatus: null }), false);
});
