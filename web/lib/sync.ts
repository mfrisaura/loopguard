import { db } from './db';
import { hasPro } from './plans';
import { channelsFor, dispatch, tripAlert } from './alerts';
import { appUrl } from './auth';

const AGENTS = new Set(['claude', 'codex', 'cursor']);
const KINDS = new Set(['session_cap', 'daily_cap', 'loop', 'spiral']);
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** Strict allow-list validation: only aggregate fields are accepted; anything else is dropped. */
export function validate(body: any) {
  if (!body || typeof body !== 'object' || body.version !== 1) throw new HttpError(400, 'bad payload');
  const machine = str(body.machine, 64); if (!machine) throw new HttpError(400, 'machine required');
  const rowsIn = Array.isArray(body.rows) ? body.rows : [];
  const tripsIn = Array.isArray(body.trips) ? body.trips : [];
  if (rowsIn.length > 20000 || tripsIn.length > 5000) throw new HttpError(413, 'too many rows');
  const rows = rowsIn.flatMap((r: any) => {
    const agent = str(r?.agent, 16), session = str(r?.session, 64), model = str(r?.model, 128);
    const day = typeof r?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : null;
    if (!agent || !AGENTS.has(agent) || !session || !model || !day) return [];
    return [{ agent, session, model, day, inputTokens: BigInt(int(r.inputTokens)), outputTokens: BigInt(int(r.outputTokens)),
      cacheReadTokens: BigInt(int(r.cacheReadTokens)), cacheWriteTokens: BigInt(int(r.cacheWriteTokens)),
      cost: typeof r.cost === 'number' && r.cost >= 0 && r.cost < 1e6 ? r.cost : 0, events: int(r.events), estimated: !!r.estimated }];
  });
  const trips = tripsIn.flatMap((t: any) => {
    const agent = str(t?.agent, 16), session = str(t?.session, 64), kind = str(t?.kind, 32);
    const ts = typeof t?.t === 'string' ? new Date(t.t) : null;
    if (!agent || !AGENTS.has(agent) || !session || !kind || !KINDS.has(kind) || !ts || isNaN(+ts)) return [];
    return [{ agent, session, kind, t: ts, halt: !!t.halt, tool: str(t.tool, 64),
      sessionCost: Number(t.sessionCost) || 0, dailyCost: Number(t.dailyCost) || 0 }];
  });
  return { machine, rows, trips };
}

export async function ingest(user: { id: string; email: string; plan: string; createdAt: Date; pausedUntil: Date | null; alertEmail: boolean; slackWebhook: string | null; discordWebhook: string | null }, body: unknown, f: typeof fetch = fetch) {
  if (!hasPro(user)) throw new HttpError(402, 'sync requires Pro (trial expired)');
  const { machine, rows, trips } = validate(body);
  for (const r of rows) {
    const { agent, session, day, model, ...vals } = r;
    await db.usageRow.upsert({
      where: { userId_machine_agent_session_day_model: { userId: user.id, machine, agent, session, day, model } },
      update: vals, create: { userId: user.id, machine, agent, session, day, model, ...vals },
    });
  }
  const created = await db.trip.createManyAndReturn({ data: trips.map((t: any) => ({ ...t, userId: user.id, machine })), skipDuplicates: true });
  let alerts: unknown[] = [];
  if (created.length) {
    alerts = await dispatch(channelsFor(user, f), tripAlert(created, `${appUrl()}/dashboard`));
    await db.trip.updateMany({ where: { id: { in: created.map(t => t.id) } }, data: { alertedAt: new Date() } });
  }
  const pausedUntil = user.pausedUntil && user.pausedUntil > new Date() ? user.pausedUntil.toISOString() : null;
  return { ok: true, rows: rows.length, newTrips: created.length, alerts, pausedUntil, plan: user.plan };
}
