import Stripe from 'stripe';
import { db } from './db';
import { PLANS, PlanKey, TEAM_MIN_SEATS, priceId, planForPrice, ACTIVE_SUB_STATUSES } from './plans';
export { hasActiveSubscription } from './plans';
import { appUrl } from './auth';

/** Test mode only (sk_test_/rk_test_) unless ALLOW_LIVE_STRIPE=1 is set deliberately at launch; then sk_live_ or restricted rk_live_ keys work. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_') && process.env.ALLOW_LIVE_STRIPE !== '1')
    throw new Error('Refusing non-test Stripe key (set ALLOW_LIVE_STRIPE=1 only after owner approval)');
  return new Stripe(key);
}

export async function createCheckout(user: { id: string; email: string; stripeCustomerId: string | null }, key: PlanKey, seats = 1, stripe = getStripe()) {
  const p = PLANS[key];
  if (!p) throw new Error('unknown plan');
  const quantity = p.perSeat ? Math.max(TEAM_MIN_SEATS, Math.min(500, Math.floor(seats) || TEAM_MIN_SEATS)) : 1;
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId(key), quantity }],
    ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
    client_reference_id: user.id,
    metadata: { userId: user.id, planKey: key },
    subscription_data: { metadata: { userId: user.id, planKey: key } },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/dashboard?checkout=success`,
    cancel_url: `${appUrl()}/dashboard?checkout=cancel`,
  });
}

async function applySubscription(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const mapped = item ? planForPrice(item.price.id) : null;
  const active = ACTIVE_SUB_STATUSES.includes(sub.status);
  const userId = sub.metadata?.userId;
  const where = userId ? { id: userId } : { stripeCustomerId: String(sub.customer) };
  // An inactive/ended subscription that is not the user's current one must not downgrade them.
  if (!active) {
    const cur = await db.user.findFirst({ where, select: { stripeSubscriptionId: true } });
    if (cur?.stripeSubscriptionId && cur.stripeSubscriptionId !== sub.id) return;
  }
  await db.user.updateMany({ where, data: {
    stripeCustomerId: String(sub.customer), stripeSubscriptionId: sub.id, subscriptionStatus: sub.status,
    plan: active && mapped ? mapped.plan : 'free', planInterval: active && mapped ? mapped.interval : null,
    seats: item?.quantity ?? 1,
  } });
}

/** Verifies signature on the RAW body, dedupes by event id, updates the user's plan. */
export async function handleWebhook(rawBody: string, signature: string | null, stripe = getStripe()) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  const event = stripe.webhooks.constructEvent(rawBody, signature || '', secret);
  try { await db.stripeEvent.create({ data: { id: event.id } }); }
  catch { return { duplicate: true, type: event.type }; }
  try { await processEvent(event, stripe); }
  catch (e) {
    // Forget the event so Stripe's retry is processed instead of being dropped as a duplicate.
    await db.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw new WebhookProcessingError((e as Error).message);
  }
  return { duplicate: false, type: event.type };
}

export class WebhookProcessingError extends Error {}

async function processEvent(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId || s.client_reference_id;
      if (userId && s.customer) await db.user.updateMany({ where: { id: userId }, data: { stripeCustomerId: String(s.customer), stripeSubscriptionId: s.subscription ? String(s.subscription) : undefined } });
      if (s.subscription && typeof s.subscription !== 'string') await applySubscription(s.subscription);
      else if (s.subscription) await applySubscription(await stripe.subscriptions.retrieve(String(s.subscription)));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
  }
}

export async function portalUrl(customer: string, stripe = getStripe()) {
  const s = await stripe.billingPortal.sessions.create({ customer, return_url: `${appUrl()}/dashboard` });
  return s.url;
}
