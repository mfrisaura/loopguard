import fs from 'fs';
import path from 'path';
import { UsageEvent } from '../types';
import { codexSessionsDir } from '../paths';
import { walk } from '../util';

/**
 * Codex rollout JSONL: event_msg/token_count with info.last_token_usage = per-turn delta.
 * total_token_usage is cumulative and ignored. Model comes from latest turn_context/session_meta.
 * input_tokens includes cached_input_tokens -> split.
 */
export function parseCodexText(text: string, fallbackSession = 'unknown'): UsageEvent[] {
  const out: UsageEvent[] = [];
  let model = 'gpt-5-codex';
  let session = fallbackSession;
  let cwd: string | undefined;
  let lastTotal = -1;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let j: any;
    try { j = JSON.parse(line); } catch { continue; }
    const pl = j.payload || {};
    if (j.type === 'session_meta') {
      session = pl.id || session; cwd = pl.cwd || cwd; if (pl.model) model = pl.model;
    } else if (j.type === 'turn_context') {
      if (pl.model) model = pl.model; cwd = pl.cwd || cwd;
    } else if (j.type === 'event_msg' && pl.type === 'token_count') {
      const last = pl.info?.last_token_usage;
      if (!last) continue;
      // Skip rate-limit-only re-emits: cumulative total unchanged.
      const tot = pl.info?.total_token_usage?.total_tokens;
      if (typeof tot === 'number') { if (tot === lastTotal) continue; lastTotal = tot; }
      const cached = last.cached_input_tokens || 0;
      const ev: UsageEvent = {
        agent: 'codex', sessionId: session, timestamp: j.timestamp || new Date(0).toISOString(), model,
        inputTokens: Math.max(0, (last.input_tokens || 0) - cached),
        cacheReadTokens: cached,
        cacheWriteTokens: last.cache_write_input_tokens || 0,
        outputTokens: last.output_tokens || 0, // reasoning_output_tokens is a subset of output in OpenAI usage
        project: cwd,
      };
      if (ev.inputTokens + ev.outputTokens + ev.cacheReadTokens === 0) continue;
      out.push(ev);
    }
  }
  return out;
}

export function parseCodexFile(file: string): UsageEvent[] {
  const m = path.basename(file).match(/rollout-.*?([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i);
  try { return parseCodexText(fs.readFileSync(file, 'utf8'), m ? m[1] : path.basename(file, '.jsonl')); }
  catch { return []; }
}

export function codexFiles(): string[] { return walk(codexSessionsDir(), f => /rollout-.*\.jsonl$/.test(f)); }
