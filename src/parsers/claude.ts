import fs from 'fs';
import path from 'path';
import { UsageEvent } from '../types';
import { claudeProjectsDir } from '../paths';
import { walk } from '../util';

/** Parse one Claude Code transcript JSONL. Dedupes repeated assistant chunks by message.id+requestId. */
export function parseClaudeText(text: string, fallbackSession = 'unknown', seen = new Set<string>()): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let j: any;
    try { j = JSON.parse(line); } catch { continue; }
    const u = j?.message?.usage;
    if (!u || j.type !== 'assistant') continue;
    const key = `${j.message.id ?? ''}:${j.requestId ?? ''}`;
    if (key !== ':' && seen.has(key)) continue;
    seen.add(key);
    out.push({
      agent: 'claude',
      sessionId: j.sessionId || fallbackSession,
      timestamp: j.timestamp || new Date(0).toISOString(),
      model: j.message.model || 'unknown',
      inputTokens: u.input_tokens || 0,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      cacheWriteTokens: u.cache_creation_input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      project: j.cwd,
    });
  }
  return out;
}

export function parseClaudeFile(file: string, seen?: Set<string>): UsageEvent[] {
  try { return parseClaudeText(fs.readFileSync(file, 'utf8'), path.basename(file, '.jsonl'), seen); }
  catch { return []; }
}

export function claudeFiles(): string[] { return walk(claudeProjectsDir(), f => f.endsWith('.jsonl')); }
