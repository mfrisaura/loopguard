import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectRows } from './usage';
import { lgDir } from './paths';
import { readJson, writeJson } from './util';

export interface Cloud { apiUrl: string; apiKey: string; lastTripSync?: string }
export const cloudFile = () => path.join(lgDir(), 'cloud.json');
const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Build the ONLY data that ever leaves the machine: aggregates. No prompts, code, paths or tool inputs. */
export async function buildPayload(since?: string) {
  const rows = await collectRows();
  const c = readJson<Partial<Cloud>>(cloudFile(), {});
  const tripsSince = since ?? c.lastTripSync ?? '';
  let trips: any[] = [];
  try {
    trips = fs.readFileSync(path.join(lgDir(), 'trips.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map(l => JSON.parse(l)).filter(t => t.t > tripsSince)
      .map(t => ({ t: t.t, agent: t.agent, session: h(String(t.session)), kind: t.kind, halt: !!t.halt,
        tool: t.tool ? String(t.tool).slice(0, 64) : null, sessionCost: t.sessionCost, dailyCost: t.dailyCost }));
  } catch { /* none */ }
  return {
    version: 1,
    machine: h(os.hostname()),
    rows: rows.map(r => ({ agent: r.agent, session: h(`${r.agent}:${r.sessionId}`), day: r.day, model: r.model,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens,
      cacheWriteTokens: r.cacheWriteTokens, cost: +r.cost.toFixed(6), events: r.events, estimated: r.estimated })),
    trips,
  };
}

export async function sync(fetchImpl: typeof fetch = fetch) {
  const c = readJson<Partial<Cloud>>(cloudFile(), {});
  if (!c.apiUrl || !c.apiKey) throw new Error('not logged in: run `loopguard login --key <key> [--url <dashboard url>]`');
  const payload = await buildPayload();
  const res = await fetchImpl(new URL('/api/sync', c.apiUrl).toString(), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`sync failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  const body: any = await res.json();
  // Remote control: dashboard can pause enforcement (e.g. "let it finish") from your phone.
  const pausePath = path.join(lgDir(), 'pause.json');
  if (body.pausedUntil && Date.parse(body.pausedUntil) > Date.now()) writeJson(pausePath, { until: Date.parse(body.pausedUntil), remote: true });
  else if (readJson<any>(pausePath, {}).remote) writeJson(pausePath, {});
  const lastTrip = payload.trips.map(t => t.t).sort().pop();
  writeJson(cloudFile(), { ...c, lastTripSync: lastTrip ?? c.lastTripSync });
  return { rows: payload.rows.length, trips: payload.trips.length, pausedUntil: body.pausedUntil ?? null, plan: body.plan };
}
