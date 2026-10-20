import fs from 'fs';
import path from 'path';
import { UsageEvent } from '../types';
import { cursorDbPath } from '../paths';

/**
 * Cursor stores chat "bubbles" in state.vscdb table cursorDiskKV, keys `bubbleId:<composerId>:<bubbleId>`.
 * Bubbles may carry tokenCount {inputTokens, outputTokens}. When absent for AI bubbles (type 2) we
 * estimate output as chars/4 and flag `estimated`. Cursor subscription billing != token cost; treat as estimate.
 */
export async function parseCursorDb(file = cursorDbPath()): Promise<UsageEvent[]> {
  if (!fs.existsSync(file)) return [];
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  let db: any;
  try { db = new SQL.Database(fs.readFileSync(file)); } catch { return []; }
  const out: UsageEvent[] = [];
  try {
    const hasTable = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'");
    if (!hasTable.length) return [];
    const stmt = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'");
    while (stmt.step()) {
      const [key, value] = stmt.get() as [string, any];
      let j: any;
      try { j = JSON.parse(typeof value === 'string' ? value : Buffer.from(value).toString('utf8')); } catch { continue; }
      if (!j) continue;
      const composer = key.split(':')[1] || 'unknown';
      const tc = j.tokenCount || {};
      let input = tc.inputTokens || 0, output = tc.outputTokens || 0, estimated = false;
      if (!input && !output && j.type === 2 && typeof j.text === 'string' && j.text.length) {
        output = Math.ceil(j.text.length / 4); estimated = true;
      }
      if (!input && !output) continue;
      const ts = j.createdAt ? new Date(j.createdAt).toISOString() : new Date(0).toISOString();
      out.push({
        agent: 'cursor', sessionId: composer, timestamp: ts,
        model: j.modelInfo?.modelName || j.model || 'cursor-default',
        inputTokens: input, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: output, estimated,
      });
    }
    stmt.free();
  } finally { db.close(); }
  return out;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Cursor (IDE 3.x and the `cursor-agent` CLI) sends the turn's token usage to `stop` and `afterAgentResponse`
 * hooks: input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, plus conversation_id (= the
 * composerId used as the state.vscdb key) and generation_id. input_tokens INCLUDES cache reads/writes
 * (Cursor's own UI subtracts them), so we split them out here. Returns the ledger line, or null.
 */
export function cursorUsageFromHook(raw: any, now = Date.now()): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const total = num(raw.input_tokens), out = num(raw.output_tokens), cr = num(raw.cache_read_tokens), cw = num(raw.cache_write_tokens);
  if (!total && !out && !cr && !cw) return null;
  const conv = raw.conversation_id || raw.session_id;
  if (!conv) return null;
  return {
    t: new Date(now).toISOString(), conv: String(conv), gen: raw.generation_id ? String(raw.generation_id) : '',
    model: String(raw.model_id || raw.model || 'cursor-default'),
    in: Math.max(total - cr - cw, 0), out, cr, cw,
  };
}

export function recordCursorUsage(file: string, raw: any, now = Date.now()): boolean {
  const line = cursorUsageFromHook(raw, now);
  if (!line) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
  return true;
}

/** Parse LoopGuard's Cursor ledger. `stop` and `afterAgentResponse` may both report a turn: one entry per generation. */
export function parseCursorLedger(file: string): UsageEvent[] {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const byKey = new Map<string, UsageEvent>();
  let i = 0;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    let j: any;
    try { j = JSON.parse(l); } catch { continue; }
    if (!j?.conv) continue;
    const e: UsageEvent = {
      agent: 'cursor', sessionId: String(j.conv), timestamp: j.t || new Date(0).toISOString(), model: j.model || 'cursor-default',
      inputTokens: num(j.in), outputTokens: num(j.out), cacheReadTokens: num(j.cr), cacheWriteTokens: num(j.cw),
    };
    const key = j.gen ? `${j.conv}|${j.gen}` : `#${i++}`;
    const prev = byKey.get(key);
    const size = (x: UsageEvent) => x.inputTokens + x.outputTokens + x.cacheReadTokens + x.cacheWriteTokens;
    if (!prev || size(e) >= size(prev)) byKey.set(key, prev ? { ...e, timestamp: prev.timestamp } : e);
  }
  return [...byKey.values()];
}
