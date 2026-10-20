import fs from 'fs';
import path from 'path';
import { Agent, UsageEvent } from './types';
import { costOf } from './pricing';
import { claudeFiles, parseClaudeFile } from './parsers/claude';
import { codexFiles, parseCodexFile } from './parsers/codex';
import { parseCursorDb, parseCursorLedger } from './parsers/cursor';
import { cursorDbPath, cursorLedgerPath, lgDir } from './paths';
import { localDay, readJson, writeJson } from './util';

export interface Row {
  agent: Agent; sessionId: string; day: string; model: string; project?: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  cost: number; events: number; estimated: boolean; lastTs: string;
}
interface FileEntry { mtimeMs: number; size: number; rows: Row[] }
interface Index { version: 1; files: Record<string, FileEntry> }

export function aggregate(events: UsageEvent[]): Row[] {
  const m = new Map<string, Row>();
  for (const e of events) {
    const day = localDay(e.timestamp);
    const k = [e.agent, e.sessionId, day, e.model].join('|');
    let r = m.get(k);
    if (!r) {
      r = { agent: e.agent, sessionId: e.sessionId, day, model: e.model, project: e.project,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0, events: 0,
        estimated: false, lastTs: e.timestamp };
      m.set(k, r);
    }
    r.inputTokens += e.inputTokens; r.outputTokens += e.outputTokens;
    r.cacheReadTokens += e.cacheReadTokens; r.cacheWriteTokens += e.cacheWriteTokens;
    r.cost += costOf(e); r.events++; r.estimated ||= !!e.estimated;
    if (e.timestamp > r.lastTs) r.lastTs = e.timestamp;
  }
  return [...m.values()];
}

const indexFile = () => path.join(lgDir(), 'index.json');

/** Incremental scan: only re-parse files whose mtime/size changed. */
export async function collectRows(opts: { agents?: Agent[]; noCache?: boolean } = {}): Promise<Row[]> {
  const agents = opts.agents || ['claude', 'codex', 'cursor'];
  const idx: Index = opts.noCache ? { version: 1, files: {} } : readJson<Index>(indexFile(), { version: 1, files: {} });
  const next: Index = { version: 1, files: {} };
  // Partial scans (e.g. one agent from a hook) must not evict other agents' cached files from the index.
  if (opts.agents) for (const [f, e] of Object.entries(idx.files))
    if (e.rows.length && !e.rows.some(r => agents.includes(r.agent))) next.files[f] = e;
  const handle = async (file: string, parse: () => UsageEvent[] | Promise<UsageEvent[]>) => {
    let st: fs.Stats;
    try { st = fs.statSync(file); } catch { return; }
    const old = idx.files[file];
    if (old && old.mtimeMs === st.mtimeMs && old.size === st.size) { next.files[file] = old; return; }
    next.files[file] = { mtimeMs: st.mtimeMs, size: st.size, rows: aggregate(await parse()) };
  };
  if (agents.includes('claude')) for (const f of claudeFiles()) await handle(f, () => parseClaudeFile(f));
  if (agents.includes('codex')) for (const f of codexFiles()) await handle(f, () => parseCodexFile(f));
  const db = cursorDbPath(), ledger = cursorLedgerPath();
  if (agents.includes('cursor')) {
    await handle(db, () => parseCursorDb(db));
    await handle(ledger, () => parseCursorLedger(ledger));
  }
  if (!opts.noCache) { try { writeJson(indexFile(), next); } catch { /* read-only ok */ } }
  const rows: Row[] = [];
  for (const [f, e] of Object.entries(next.files)) if (f !== db && f !== ledger) rows.push(...e.rows);
  rows.push(...mergeCursor(next.files[db]?.rows || [], next.files[ledger]?.rows || []));
  return rows.filter(r => agents.includes(r.agent));
}

/**
 * Cursor spend has two sources: hook-reported turn usage (exact token counts, lands when a turn ends) and
 * state.vscdb bubbles (often chars/4 estimates, but can update mid-turn). Per conversation, keep whichever
 * source shows more spend, so neither double-counts nor under-reports.
 */
export function mergeCursor(dbRows: Row[], ledgerRows: Row[]): Row[] {
  const by = (rows: Row[]) => { const m = new Map<string, Row[]>(); for (const r of rows) m.set(r.sessionId, [...(m.get(r.sessionId) || []), r]); return m; };
  const a = by(dbRows), b = by(ledgerRows);
  const out: Row[] = [];
  for (const s of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(s) || [], y = b.get(s) || [];
    out.push(...(sum(y) >= sum(x) && y.length ? y : x));
  }
  return out;
}

export const sum = (rows: Row[]) => rows.reduce((a, r) => a + r.cost, 0);
