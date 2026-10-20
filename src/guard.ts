import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Agent } from './types';
import { Config, loadConfig } from './config';
import { lgDir } from './paths';
import { parseClaudeFile } from './parsers/claude';
import { parseCodexFile } from './parsers/codex';
import { aggregate, collectRows, sum } from './usage';
import { localDay, readJson, writeJson } from './util';

export interface HookInput {
  agent: Agent; event: string; sessionId: string; toolName?: string; toolInput?: unknown; transcriptPath?: string;
}
export type Verdict =
  | { action: 'allow'; warn?: string }
  | { action: 'deny'; reason: string; halt: boolean; kind: 'session_cap' | 'daily_cap' | 'loop' | 'spiral' };

interface SessionState { calls: { h: string; t: number }[]; costs: { c: number; t: number }[]; denies: number }

export function normalizeInput(agent: Agent, raw: any, eventArg?: string): HookInput {
  return {
    agent,
    event: eventArg || raw?.hook_event_name || 'PreToolUse',
    // Cursor: conversation_id is the composerId that keys state.vscdb and the stop-hook usage ledger.
    sessionId: String((agent === 'cursor' ? raw?.conversation_id || raw?.session_id : raw?.session_id || raw?.conversation_id)
      || raw?.sessionId || 'unknown'),
    toolName: raw?.tool_name ?? raw?.toolName,
    toolInput: raw?.tool_input ?? raw?.toolInput ?? raw?.command,
    transcriptPath: raw?.transcript_path || undefined,
  };
}

const stateFile = (a: Agent, s: string) =>
  path.join(lgDir(), 'state', `${a}-${s.replace(/[^\w.-]/g, '_').slice(0, 120)}.json`);

export function isPaused(now = Date.now()): boolean {
  const p = readJson<{ until?: number }>(path.join(lgDir(), 'pause.json'), {});
  return !!p.until && p.until > now;
}

/** Claude Code writes subagent usage to `<session>/subagents/agent-*.jsonl` next to the main transcript. */
export function claudeSessionFiles(transcript: string): string[] {
  const sub = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  let extra: string[] = [];
  try { extra = fs.readdirSync(sub).filter(f => f.endsWith('.jsonl')).map(f => path.join(sub, f)); } catch { /* none */ }
  return [transcript, ...extra];
}

export async function sessionCost(inp: HookInput): Promise<number> {
  // Only Claude Code and Codex transcripts carry token usage. Cursor's transcript is plain chat text,
  // so Cursor spend always comes from state.vscdb (keyed by conversation/composer id).
  if (inp.agent !== 'cursor' && inp.transcriptPath && fs.existsSync(inp.transcriptPath)) {
    if (inp.agent === 'codex') return sum(aggregate(parseCodexFile(inp.transcriptPath)));
    const seen = new Set<string>();
    return sum(aggregate(claudeSessionFiles(inp.transcriptPath).flatMap(f => parseClaudeFile(f, seen))));
  }
  const rows = await collectRows({ agents: [inp.agent] });
  return sum(rows.filter(r => r.sessionId === inp.sessionId));
}

export async function dailyCost(now = Date.now()): Promise<number> {
  const today = localDay(new Date(now).toISOString());
  return sum((await collectRows()).filter(r => r.day === today));
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

export async function evaluate(inp: HookInput, opts: { cfg?: Config; now?: number; costs?: { session: number; daily: number } } = {}): Promise<Verdict> {
  const v = await evaluateInner(inp, opts);
  // Only Claude Code can act on a deny outside PreToolUse (Stop -> continue:false); elsewhere it's a no-op, so don't log a trip.
  const enforceable = inp.event.toLowerCase() === 'pretooluse' || inp.agent === 'claude';
  if (v.verdict.action === 'deny' && enforceable) logTrip(inp, v.verdict, v.s, v.d, opts.now ?? Date.now());
  return v.verdict;
}

async function evaluateInner(inp: HookInput, opts: { cfg?: Config; now?: number; costs?: { session: number; daily: number } }): Promise<{ verdict: Verdict; s: number; d: number }> {
  const cfg = opts.cfg || loadConfig();
  const now = opts.now ?? Date.now();
  if (isPaused(now)) return { verdict: { action: 'allow' }, s: 0, d: 0 };
  const sCost = opts.costs?.session ?? await sessionCost(inp);
  const dCost = opts.costs?.daily ?? (cfg.dailyCapUsd > 0 ? await dailyCost(now) : 0);

  if (cfg.sessionCapUsd > 0 && sCost >= cfg.sessionCapUsd)
    return { s: sCost, d: dCost, verdict: { action: 'deny', halt: true, kind: 'session_cap',
      reason: `LoopGuard: session spend ${fmt(sCost)} reached cap ${fmt(cfg.sessionCapUsd)}. Stopping. Raise with \`loopguard config set sessionCapUsd <n>\` or \`loopguard pause 15\`.` } };
  if (cfg.dailyCapUsd > 0 && dCost >= cfg.dailyCapUsd)
    return { s: sCost, d: dCost, verdict: { action: 'deny', halt: true, kind: 'daily_cap',
      reason: `LoopGuard: today's spend across agents ${fmt(dCost)} reached daily cap ${fmt(cfg.dailyCapUsd)}. Stopping.` } };

  const sf = stateFile(inp.agent, inp.sessionId);
  const st = readJson<SessionState>(sf, { calls: [], costs: [], denies: 0 });
  let verdict: Verdict = { action: 'allow' };

  if (cfg.loop.enabled) {
    const winMs = cfg.loop.windowSec * 1000;
    st.costs = st.costs.filter(x => now - x.t <= cfg.loop.spiralWindowSec * 1000);
    st.costs.push({ c: sCost, t: now });
    const delta = sCost - Math.min(...st.costs.map(x => x.c));
    if (cfg.loop.spiralUsd > 0 && delta >= cfg.loop.spiralUsd) {
      verdict = { action: 'deny', halt: true, kind: 'spiral',
        reason: `LoopGuard: cost spiral — ${fmt(delta)} spent in the last ${cfg.loop.spiralWindowSec}s (limit ${fmt(cfg.loop.spiralUsd)}). Stopping.` };
    }
    if (verdict.action === 'allow' && inp.toolName && inp.event.toLowerCase() === 'pretooluse') {
      const h = crypto.createHash('sha1').update(`${inp.toolName}\0${JSON.stringify(inp.toolInput ?? null)}`).digest('hex');
      st.calls = st.calls.filter(x => now - x.t <= winMs);
      st.calls.push({ h, t: now });
      const n = st.calls.filter(x => x.h === h).length;
      if (n >= cfg.loop.maxRepeats) {
        st.denies++;
        verdict = { action: 'deny', kind: 'loop', halt: st.denies >= 3,
          reason: `LoopGuard: loop detected — identical ${inp.toolName} call ${n}x in ${cfg.loop.windowSec}s. ` +
            (st.denies >= 3 ? 'Stopping session.' : 'Blocked; try a different approach.') };
      }
    }
  }
  if (verdict.action === 'allow') {
    st.denies = 0;
    const pct = (x: number, cap: number) => cap > 0 ? (x / cap) * 100 : 0;
    const sp = pct(sCost, cfg.sessionCapUsd), dp = pct(dCost, cfg.dailyCapUsd);
    if (Math.max(sp, dp) >= cfg.warnAtPct)
      verdict = { action: 'allow', warn: 'LoopGuard: ' + [
        cfg.sessionCapUsd > 0 ? `session ${fmt(sCost)}/${fmt(cfg.sessionCapUsd)}` : '',
        cfg.dailyCapUsd > 0 ? `today ${fmt(dCost)}/${fmt(cfg.dailyCapUsd)}` : '',
      ].filter(Boolean).join(', ') };
  }
  try { writeJson(sf, st); } catch { /* ignore */ }
  return { verdict, s: sCost, d: dCost };
}

function logTrip(inp: HookInput, v: Extract<Verdict, { action: 'deny' }>, s: number, d: number, now: number) {
  try {
    fs.mkdirSync(lgDir(), { recursive: true });
    fs.appendFileSync(path.join(lgDir(), 'trips.jsonl'), JSON.stringify({
      t: new Date(now).toISOString(), agent: inp.agent, session: inp.sessionId, kind: v.kind, halt: v.halt,
      tool: inp.toolName, sessionCost: +s.toFixed(4), dailyCost: +d.toFixed(4), reason: v.reason }) + '\n');
  } catch { /* ignore */ }
}

/**
 * Cursor also runs Claude Code hooks from ~/.claude/settings.json ("third-party hooks"), feeding them its own
 * payload. Its payload carries cursor_version (and Cursor sets CURSOR_VERSION for hook processes).
 */
export function isCursorPayload(raw: any, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!raw && typeof raw === 'object' &&
    (typeof raw.cursor_version === 'string' || (!!raw.conversation_id && !!env.CURSOR_VERSION));
}

/** Fail-open output when LoopGuard itself errors: Cursor treats empty stdout as a failed hook. */
export function failOpenOutput(agent: Agent, event: string): string {
  if (agent !== 'cursor') return '';
  return event.toLowerCase() === 'pretooluse' ? JSON.stringify({ permission: 'allow' }) : '{}';
}

/** Translate verdict into each agent's hook protocol. Returns stdout text and exit code. */
export function render(inp: HookInput, v: Verdict): { stdout: string; stderr: string; code: number } {
  const ev = inp.event.toLowerCase();
  if (v.action === 'allow') {
    if (v.warn && inp.agent === 'claude') return { stdout: JSON.stringify({ systemMessage: v.warn }), stderr: '', code: 0 };
    // Cursor logs an empty stdout as a failed hook ("empty_stdout"), so always answer with JSON.
    if (inp.agent === 'cursor') return { stdout: ev === 'pretooluse' ? JSON.stringify({ permission: 'allow' }) : '{}', stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }
  switch (inp.agent) {
    case 'claude': {
      const o: any = {};
      if (v.halt) { o.continue = false; o.stopReason = v.reason; }
      if (ev === 'pretooluse')
        o.hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: v.reason };
      return { stdout: JSON.stringify(o), stderr: '', code: 0 };
    }
    case 'codex':
      // Documented Codex contract: exit 2 + stderr reason denies the tool call.
      if (ev === 'pretooluse') return { stdout: '', stderr: v.reason, code: 2 };
      return { stdout: '', stderr: v.reason, code: 0 };
    case 'cursor':
      if (ev === 'pretooluse')
        return { stdout: JSON.stringify({ permission: 'deny', user_message: v.reason, agent_message: v.reason }), stderr: '', code: 0 };
      return { stdout: '{}', stderr: '', code: 0 };
  }
}
