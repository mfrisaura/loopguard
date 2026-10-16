import fs from 'fs';
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
