import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { close, sandbox, seed } from './helpers';
import { cursorUsageFromHook, parseCursorLedger, recordCursorUsage } from '../src/parsers/cursor';
import { aggregate, collectRows, mergeCursor, sum } from '../src/usage';
import { evaluate, failOpenOutput, isCursorPayload, normalizeInput, render } from '../src/guard';
import { install } from '../src/install';
import { DEFAULTS } from '../src/config';
import { UsageEvent } from '../src/types';

// Payload shapes below are copied from what Cursor's own hook runner sends (CLI 2026.10.19 / IDE 3.25.9):
// stop + afterAgentResponse carry the turn's tokens; input_tokens includes cache reads and writes.
const stopPayload = (conv: string, gen: string, t: { input: number; output: number; cr?: number; cw?: number }, model = 'claude-4.5-sonnet') => ({
  conversation_id: conv, generation_id: gen, model, model_id: 'claude-sonnet-4-5', hook_event_name: 'stop', status: 'completed', loop_count: 0,
  input_tokens: t.input, output_tokens: t.output, cache_read_tokens: t.cr ?? 0, cache_write_tokens: t.cw ?? 0,
  cursor_version: '2026.10.19-6bbf2c4', workspace_roots: ['/w'], user_email: null, transcript_path: null,
});
const prePayload = (conv: string, cmd = 'npm test') => ({
  conversation_id: conv, generation_id: 'g', model: 'claude-4.5-sonnet', hook_event_name: 'preToolUse', session_id: conv,
  tool_name: 'Shell', tool_input: { command: cmd, working_directory: '/w' }, tool_use_id: `tu-${Math.random()}`,
  cursor_version: '2026.10.19-6bbf2c4', workspace_roots: ['/w'], user_email: null,
});

test('cursor usage from hook: splits cache out of input_tokens, prefers model_id, ignores token-less events', () => {
  const l = cursorUsageFromHook(stopPayload('c1', 'g1', { input: 1_200_000, output: 40_000, cr: 900_000, cw: 100_000 }))!;
  assert.deepEqual([l.conv, l.gen, l.model, l.in, l.out, l.cr, l.cw], ['c1', 'g1', 'claude-sonnet-4-5', 200_000, 40_000, 900_000, 100_000]);
  assert.equal(cursorUsageFromHook({ conversation_id: 'c1', status: 'completed', loop_count: 0 }), null);
  assert.equal(cursorUsageFromHook({ input_tokens: 5 }), null); // no conversation
});

test('cursor ledger: one entry per generation (stop + afterAgentResponse report the same turn)', () => {
  const d = sandbox();
  const f = path.join(d, 'ledger.jsonl');
  recordCursorUsage(f, stopPayload('c1', 'g1', { input: 1000, output: 100 }));
  recordCursorUsage(f, { ...stopPayload('c1', 'g1', { input: 1000, output: 100 }), hook_event_name: 'afterAgentResponse' });
  recordCursorUsage(f, stopPayload('c1', 'g2', { input: 2000, output: 200 }));
  fs.appendFileSync(f, 'garbage\n');
  const ev = parseCursorLedger(f);
  assert.equal(ev.length, 2);
  assert.equal(ev.reduce((a, e) => a + e.inputTokens, 0), 3000);
});

test('cursor: per conversation, the larger of ledger vs state.vscdb wins (no double count)', () => {
  const mk = (sessionId: string, inputTokens: number): UsageEvent => ({ agent: 'cursor', sessionId, timestamp: '2026-10-20T10:00:00Z',
    model: 'claude-sonnet-4-5', inputTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const db = aggregate([mk('a', 1_000_000), mk('b', 1_000_000)]);       // $3 each
  const led = aggregate([mk('a', 2_000_000), mk('c', 1_000_000)]);      // a: $6, c: $3
  const m = mergeCursor(db, led);
  assert.ok(close(sum(m), 6 + 3 + 3));
  assert.ok(close(sum(m.filter(r => r.sessionId === 'a')), 6));
});

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');
const run = (d: string, agent: string, event: string, payload: object) => spawnSync('node', [CLI, 'hook', '--agent', agent, '--event', event], {
  input: JSON.stringify(payload), encoding: 'utf8',
  env: { ...process.env, LOOPGUARD_USER_HOME: d, LOOPGUARD_DIR: path.join(d, '.loopguard'), LOOPGUARD_CURSOR_DB: path.join(d, 'cursor/state.vscdb') },
});
const cfgFile = (d: string, c: object) => { fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true }); fs.writeFileSync(path.join(d, '.loopguard/config.json'), JSON.stringify(c)); };
const trips = (d: string) => { try { return fs.readFileSync(path.join(d, '.loopguard/trips.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

test('e2e cursor: stop hook records turn tokens and answers {}; next preToolUse is denied over the session cap', () => {
  const d = sandbox();
  cfgFile(d, { sessionCapUsd: 1.5, dailyCapUsd: 0 });
  assert.equal(JSON.parse(run(d, 'cursor', 'preToolUse', prePayload('conv-1')).stdout).permission, 'allow');
  const s = run(d, 'cursor', 'stop', stopPayload('conv-1', 'g1', { input: 1_200_000, output: 40_000, cr: 900_000, cw: 100_000 }));
  assert.equal(s.status, 0);
  assert.equal(s.stdout, '{}'); // empty stdout is logged by Cursor as a failed hook
  assert.equal(trips(d).length, 0, 'deny on stop is a no-op in Cursor; not logged as a trip');
  const v = JSON.parse(run(d, 'cursor', 'preToolUse', prePayload('conv-1', 'ls')).stdout);
  assert.equal(v.permission, 'deny');
  assert.match(v.user_message, /session spend \$1\.84 reached cap \$1\.50/); // 200k*$3 + 900k*$0.30 + 100k*$3.75 + 40k*$15
  assert.equal(trips(d)[0].kind, 'session_cap');
  // other conversations are unaffected by this one's session cap
  assert.equal(JSON.parse(run(d, 'cursor', 'preToolUse', prePayload('conv-2', 'ls')).stdout).permission, 'allow');
  // the ledger also feeds reports and the daily cap
  const a = run(d, 'cursor', 'afterAgentResponse', { ...stopPayload('conv-2', 'g9', { input: 10, output: 10 }), hook_event_name: 'afterAgentResponse', text: 'hi' });
  assert.equal(a.stdout, '{}');
});

test('e2e cursor: daily cap counts hook-reported Cursor spend', async () => {
  const d = sandbox();
  cfgFile(d, { sessionCapUsd: 0, dailyCapUsd: 1 });
  run(d, 'cursor', 'stop', stopPayload('conv-x', 'g1', { input: 400_000, output: 0 })); // $1.20 today
  const v = JSON.parse(run(d, 'cursor', 'preToolUse', prePayload('conv-y')).stdout);
  assert.equal(v.permission, 'deny');
  assert.match(v.user_message, /daily cap/);
  const rows = await collectRows({ agents: ['cursor'] });
  assert.ok(close(sum(rows), 1.2));
});

test('Cursor running our Claude Code hook (third-party hooks): defers to the Cursor hook, or acts as it', () => {
  // A) both installed: the claude-sourced call is a silent no-op, so loops/denies are not doubled
  const d = sandbox();
  fs.mkdirSync(path.join(d, '.cursor'), { recursive: true }); fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  process.env.LOOPGUARD_BIN = 'loopguard';
  try { install('cursor'); install('claude'); } finally { delete process.env.LOOPGUARD_BIN; }
  cfgFile(d, { sessionCapUsd: 0, dailyCapUsd: 0, loop: { ...DEFAULTS.loop, maxRepeats: 2 } });
  for (let i = 0; i < 3; i++) {
    const r = run(d, 'claude', 'PreToolUse', prePayload('conv-b'));
    assert.equal(r.status, 0); assert.equal(r.stdout, '{}');
  }
  assert.equal(trips(d).length, 0);
  assert.equal(fs.existsSync(path.join(d, '.loopguard/state')), false);

  // B) only the Claude hook installed: it enforces for Cursor, in Cursor's format, attributed to cursor
  const e = sandbox();
  cfgFile(e, { sessionCapUsd: 0, dailyCapUsd: 0, loop: { ...DEFAULTS.loop, maxRepeats: 2 } });
  run(e, 'claude', 'PreToolUse', prePayload('conv-c'));
  const v = JSON.parse(run(e, 'claude', 'PreToolUse', prePayload('conv-c')).stdout);
  assert.equal(v.permission, 'deny');
  assert.equal(trips(e)[0].agent, 'cursor');
  // and it still records Cursor's turn usage from the Stop event
  run(e, 'claude', 'Stop', stopPayload('conv-c', 'g1', { input: 1000, output: 10 }));
  assert.ok(fs.readFileSync(path.join(e, '.loopguard/cursor-usage.jsonl'), 'utf8').includes('conv-c'));

  // Real Claude Code payloads are untouched
  assert.equal(isCursorPayload({ session_id: 's', transcript_path: '/x.jsonl', hook_event_name: 'PreToolUse' }, {}), false);
  assert.equal(isCursorPayload({ conversation_id: 'c', cursor_version: '3.25.9' }, {}), true);
});

test('cursor: session id is conversation_id (composerId) even if session_id differs; fail-open output is valid JSON', () => {
  assert.equal(normalizeInput('cursor', { conversation_id: 'comp', session_id: 'sess' }).sessionId, 'comp');
  assert.equal(normalizeInput('claude', { conversation_id: 'comp', session_id: 'sess' }).sessionId, 'sess');
  assert.deepEqual(JSON.parse(failOpenOutput('cursor', 'preToolUse')), { permission: 'allow' });
  assert.equal(failOpenOutput('cursor', 'stop'), '{}');
  assert.equal(failOpenOutput('claude', 'PreToolUse'), '');
  const inp = normalizeInput('cursor', { conversation_id: 'c' }, 'stop');
  assert.equal(render(inp, { action: 'allow' }).stdout, '{}');
});

test('collectRows({agents}) returns only those agents, even with other agents cached in the index', async () => {
  const d = sandbox(); seed(d);
  await collectRows();
  const only = await collectRows({ agents: ['claude'] });
  assert.ok(only.length > 0);
  assert.deepEqual([...new Set(only.map(r => r.agent))], ['claude']);
});

test('cursor evaluate: session cost from ledger', async () => {
  const d = sandbox();
  recordCursorUsage(path.join(d, '.loopguard', 'cursor-usage.jsonl'), stopPayload('conv-e', 'g1', { input: 1_000_000, output: 0 }));
  const v = await evaluate(normalizeInput('cursor', prePayload('conv-e'), 'preToolUse'),
    { cfg: { ...DEFAULTS, sessionCapUsd: 2.5, dailyCapUsd: 0, loop: { ...DEFAULTS.loop, spiralUsd: 0 } } });
  assert.ok(v.action === 'deny' && v.kind === 'session_cap', JSON.stringify(v));
});
