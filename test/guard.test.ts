import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { FIX, sandbox, seed } from './helpers';
import { evaluate, render, normalizeInput } from '../src/guard';
import { DEFAULTS, Config } from '../src/config';

const cfg = (o: Partial<Config> = {}, loop: Partial<Config['loop']> = {}): Config =>
  ({ ...DEFAULTS, ...o, loop: { ...DEFAULTS.loop, ...loop } });
const inp = (agent: any, extra: any = {}) => normalizeInput(agent, { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, ...extra });

test('session cap halts with agent-specific protocol', async () => {
  sandbox();
  const v = await evaluate(inp('claude'), { cfg: cfg({ sessionCapUsd: 5 }), costs: { session: 5.01, daily: 6 } });
  assert.equal(v.action, 'deny');
  const c = JSON.parse(render(inp('claude'), v).stdout);
  assert.equal(c.continue, false);
  assert.equal(c.hookSpecificOutput.permissionDecision, 'deny');
  const x = render(inp('codex'), v);
  assert.equal(x.code, 2); assert.match(x.stderr, /session spend/);
  const cu = JSON.parse(render(inp('cursor'), v).stdout);
  assert.equal(cu.permission, 'deny');
});

test('daily cap', async () => {
  sandbox();
  const v = await evaluate(inp('codex'), { cfg: cfg({ dailyCapUsd: 10 }), costs: { session: 1, daily: 10 } });
  assert.equal(v.action === 'deny' && v.kind, 'daily_cap');
});

test('warns near cap but allows', async () => {
  sandbox();
  const v = await evaluate(inp('claude'), { cfg: cfg({ sessionCapUsd: 10 }), costs: { session: 8.5, daily: 9 } });
  assert.equal(v.action, 'allow');
  assert.match(JSON.parse(render(inp('claude'), v).stdout).systemMessage, /\$8.50/);
});

test('loop detection: blocks Nth identical call, escalates to halt, ignores varied calls', async () => {
  sandbox();
  const c = cfg({}, { maxRepeats: 3, windowSec: 60, spiralUsd: 0 });
  const t0 = 1_000_000;
  const costs = { session: 0, daily: 0 };
  assert.equal((await evaluate(inp('claude'), { cfg: c, now: t0, costs })).action, 'allow');
  assert.equal((await evaluate(inp('claude', { tool_input: { command: 'ls' } }), { cfg: c, now: t0 + 1, costs })).action, 'allow');
  assert.equal((await evaluate(inp('claude'), { cfg: c, now: t0 + 2, costs })).action, 'allow');
  const v3 = await evaluate(inp('claude'), { cfg: c, now: t0 + 3, costs });
  assert.ok(v3.action === 'deny' && v3.kind === 'loop' && !v3.halt);
  await evaluate(inp('claude'), { cfg: c, now: t0 + 4, costs });
  const v5 = await evaluate(inp('claude'), { cfg: c, now: t0 + 5, costs });
  assert.ok(v5.action === 'deny' && v5.halt);
  // outside the window it is allowed again
  assert.equal((await evaluate(inp('claude'), { cfg: c, now: t0 + 120_000, costs })).action, 'allow');
});

test('cost spiral', async () => {
  sandbox();
  const c = cfg({}, { spiralUsd: 2, spiralWindowSec: 60 });
  await evaluate(inp('codex'), { cfg: c, now: 0, costs: { session: 1, daily: 1 } });
  const v = await evaluate(inp('codex', { tool_input: 'other' }), { cfg: c, now: 30_000, costs: { session: 3.5, daily: 3.5 } });
  assert.ok(v.action === 'deny' && v.kind === 'spiral');
});

test('pause bypasses enforcement', async () => {
  const d = sandbox();
  fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true });
  fs.writeFileSync(path.join(d, '.loopguard/pause.json'), JSON.stringify({ until: Date.now() + 60000 }));
  const v = await evaluate(inp('claude'), { cfg: cfg({ sessionCapUsd: 1 }), costs: { session: 99, daily: 99 } });
  assert.equal(v.action, 'allow');
});

// End-to-end through the compiled CLI, the way agents call it.
const CLI = path.join(__dirname, '..', 'dist', 'cli.js');
function runHook(d: string, agent: string, payload: object, event = 'PreToolUse') {
  return spawnSync('node', [CLI, 'hook', '--agent', agent, '--event', event], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, LOOPGUARD_USER_HOME: d, LOOPGUARD_DIR: path.join(d, '.loopguard'), LOOPGUARD_CURSOR_DB: path.join(d, 'cursor/state.vscdb') },
  });
}

test('e2e: claude hook halts when transcript spend exceeds session cap; trip logged', () => {
  const d = sandbox(); seed(d);
  fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true });
  fs.writeFileSync(path.join(d, '.loopguard/config.json'), JSON.stringify({ sessionCapUsd: 0.1, dailyCapUsd: 0 }));
  const tp = path.join(d, '.claude/projects/-work-app/sess-claude-1.jsonl');
  const r = runHook(d, 'claude', { session_id: 'sess-claude-1', transcript_path: tp, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'x' } });
  assert.equal(r.status, 0);
  const o = JSON.parse(r.stdout);
  assert.equal(o.continue, false);
  assert.match(o.stopReason, /\$0\.13/);
  assert.match(fs.readFileSync(path.join(d, '.loopguard/trips.jsonl'), 'utf8'), /session_cap/);
});

test('e2e: codex daily cap across all agents -> exit 2', () => {
  const d = sandbox(); seed(d);
  fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true });
  fs.writeFileSync(path.join(d, '.loopguard/config.json'), JSON.stringify({ sessionCapUsd: 0, dailyCapUsd: 0.15 }));
  // Fixtures are dated 2026-10-15; daily cap uses today's local date, so stamp a fresh codex file for today.
  const now = new Date().toISOString();
  const today = fs.readFileSync(path.join(FIX, 'claude-session.jsonl'), 'utf8').replace(/2026-10-15T\d\d:\d\d:\d\d(\.\d+)?Z/g, now);
  fs.writeFileSync(path.join(d, '.claude/projects/-work-app/today.jsonl'), today.replace(/req_/g, 'today_req_'));
  fs.writeFileSync(path.join(d, '.claude/projects/-work-app/today2.jsonl'), today.replace(/req_/g, 'today2_req_'));
  const r = runHook(d, 'codex', { session_id: 'zzz', hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: 'ls' } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /daily cap/);
});

test('e2e: cursor allow + garbage stdin fails open', () => {
  const d = sandbox(); seed(d);
  const ok = runHook(d, 'cursor', { conversation_id: 'comp-1', hook_event_name: 'preToolUse', tool_name: 'edit', tool_input: {} }, 'preToolUse');
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).permission, 'allow');
  const bad = spawnSync('node', [CLI, 'hook', '--agent', 'claude'], { input: '{{{', encoding: 'utf8', env: { ...process.env, LOOPGUARD_USER_HOME: d, LOOPGUARD_DIR: path.join(d, '.loopguard') } });
  assert.equal(bad.status, 0);
});

// ---- Regressions found in the pre-launch smoke test against real Claude Code 2.1.302 / Codex 0.163 ----

const asstLine = (sid: string, id: string, input: number) => JSON.stringify({
  type: 'assistant', sessionId: sid, requestId: 'req_' + id, timestamp: new Date().toISOString(),
  message: { id, model: 'claude-sonnet-4-5', usage: { input_tokens: input, output_tokens: 0 } } });

test('claude session cost includes subagent transcripts (<session>/subagents/agent-*.jsonl)', async () => {
  const d = sandbox();
  const dir = path.join(d, '.claude/projects/-work-app'); const sid = 'aaaa-sub';
  fs.mkdirSync(path.join(dir, sid, 'subagents'), { recursive: true });
  const main = path.join(dir, `${sid}.jsonl`);
  fs.writeFileSync(main, asstLine(sid, 'm1', 1_000_000) + '\n'); // $3
  fs.writeFileSync(path.join(dir, sid, 'subagents', 'agent-x1.jsonl'), asstLine(sid, 's1', 1_000_000) + '\n' + asstLine(sid, 's2', 1_000_000) + '\n'); // $6
  // Real subagent PreToolUse payloads carry the PARENT transcript_path plus agent_id.
  const i = normalizeInput('claude', { session_id: sid, transcript_path: main, agent_id: 'x1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
  const v = await evaluate(i, { cfg: cfg({ sessionCapUsd: 8, dailyCapUsd: 0 }, { spiralUsd: 0 }) });
  assert.ok(v.action === 'deny' && v.kind === 'session_cap', JSON.stringify(v));
});

test('cursor session cap uses state.vscdb even when transcript_path is set', async () => {
  const d = sandbox(); seed(d);
  const t = path.join(d, '.cursor/projects/app/agent-transcripts/conv.jsonl');
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, '{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n');
  const { parseCursorDb } = await import('../src/parsers/cursor');
  const ev = await parseCursorDb(path.join(d, 'cursor', 'state.vscdb'));
  const conv = ev[0].sessionId;
  const raw = { conversation_id: conv, hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'ls', working_directory: '/w' }, transcript_path: t };
  const withT = await evaluate(normalizeInput('cursor', raw, 'preToolUse'), { cfg: cfg({ sessionCapUsd: 0.000001, dailyCapUsd: 0 }, { spiralUsd: 0 }) });
  assert.ok(withT.action === 'deny' && withT.kind === 'session_cap', JSON.stringify(withT));
});

test('warning omits disabled caps', async () => {
  sandbox();
  const v = await evaluate(inp('claude'), { cfg: cfg({ sessionCapUsd: 10, dailyCapUsd: 0 }), costs: { session: 9, daily: 0 } });
  assert.ok(v.action === 'allow' && v.warn);
  assert.doesNotMatch(v.warn!, /today/);
});
