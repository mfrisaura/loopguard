import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { sandbox } from './helpers';
import { callKey, normalizeOutput, normalizeShell, outputHash, payloadDir, payloadOutput, workTreeFingerprint } from '../src/progress';
import { evaluate, normalizeInput, recordToolOutput, render, loopReason } from '../src/guard';
import { addHooks, removeHooks } from '../src/install';
import { DEFAULTS, Config } from '../src/config';

const cfg = (loop: Partial<Config['loop']> = {}): Config =>
  ({ ...DEFAULTS, sessionCapUsd: 0, dailyCapUsd: 0, loop: { ...DEFAULTS.loop, spiralUsd: 0, ...loop } });
const costs = { session: 0, daily: 0 };
const bash = (command: string, extra: any = {}) => normalizeInput('claude', {
  session_id: 'p1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: '/w', ...extra });

// ---------- shell normalization (the "one-liner dodge") ----------

test('normalizeShell: cosmetic rewordings of the same run match', () => {
  const same = ['npm test', '  npm   test ', 'npm run test', 'npm t', 'npm test 2>&1', 'npm test 2>&1 | tail -50',
    'npm test | tail -n 100', 'npm test | head -20', 'npm test | cat', "bash -c 'npm test'", 'bash -lc "npm test 2>&1 | tail -30"',
    'sh -c "npm test"', 'cd /w && npm test', 'cd . && npm test', 'timeout 300 npm test', 'timeout 5m npm test | tail -5'];
  for (const c of same) assert.equal(normalizeShell(c, '/w'), 'npm test', c);
  assert.equal(normalizeShell('pnpm run test', '/w'), 'pnpm test');
  assert.equal(normalizeShell('yarn run test --watch=false', '/w'), 'yarn test --watch=false');
});

test('normalizeShell: genuinely different commands stay different', () => {
  const k = (c: string) => normalizeShell(c, '/w');
  assert.notEqual(k('npx jest'), k('npm test'));
  assert.notEqual(k('npm test -- auth'), k('npm test'));
  assert.notEqual(k('cd /other && npm test'), k('npm test'));    // different directory
  assert.notEqual(k('bun run test'), k('bun test'));             // bun test is bun's own runner
  assert.notEqual(k('npm test | grep FAIL'), k('npm test'));     // filters other than head/tail/cat are kept
  assert.notEqual(k('npm test && npm run lint'), k('npm test'));
});

test('callKey: shell calls ignore Claude Bash description/timeout; other tools use exact input; can be turned off', () => {
  const a = callKey('Bash', { command: 'npm test', description: 'Run tests' });
  const b = callKey('Bash', { command: 'npm run test 2>&1 | tail -40', description: 'Re-run the tests', timeout: 120000 });
  assert.equal(a, b);
  assert.equal(callKey('Shell', { command: 'npm test', working_directory: '/w' }), callKey('Shell', { command: 'npm t', working_directory: '/w' }));
  assert.notEqual(callKey('Shell', { command: 'npm test', working_directory: '/a' }), callKey('Shell', { command: 'npm test', working_directory: '/b' }));
  assert.equal(callKey('exec_command', { command: ['bash', '-lc', 'npm test'] }), callKey('Bash', { command: 'npm test' }));
  assert.notEqual(callKey('Read', { file_path: '/a' }), callKey('Read', { file_path: '/b' }));
  assert.notEqual(callKey('Bash', { command: 'npm test' }, { normalizeShell: false }), callKey('Bash', { command: 'npm test | tail' }, { normalizeShell: false }));
});

// ---------- output normalization ----------

test('normalizeOutput: timestamps, durations, temp paths and ids do not count as a change; results do', () => {
  const run = (ts: string, ms: number, tmp: string, failed: number) =>
    `[${ts}] Tests: ${failed} failed, 12 passed\nTime: ${ms}ms (${(ms / 1000).toFixed(2)} s)\nsnapshot at ${tmp}/out.txt pid=${ms}\n\x1b[31mFAIL\x1b[0m src/a.test.ts`;
  const h1 = outputHash(run('2026-10-22T14:01:02.123Z', 812, '/tmp/jest_ab12', 3));
  const h2 = outputHash(run('2026-10-22T14:05:59.004Z', 1093, '/var/folders/x1/T/jest_zz', 3));
  assert.equal(h1, h2);
  assert.notEqual(h1, outputHash(run('2026-10-22T14:05:59.004Z', 1093, '/tmp/q', 2)));
  // Cursor sends tool_output as a JSON string with timing fields
  assert.equal(outputHash('{"exitCode":1,"stdout":"FAIL","executionTime":5432}'), outputHash('{"exitCode":1,"stdout":"FAIL","executionTime":61}'));
  assert.notEqual(outputHash('{"exitCode":1,"stdout":"FAIL"}'), outputHash('{"exitCode":0,"stdout":"ok"}'));
  assert.equal(outputHash(undefined), undefined);
  assert.equal(normalizeOutput('done in 3.2s at 12:00:01'), 'done in <dur> at <time>');
});

test('payloadOutput / payloadDir read each agent\'s field names', () => {
  assert.deepEqual(payloadOutput({ tool_response: { stdout: 'x' } }), { stdout: 'x' });          // Claude Code / Codex PostToolUse
  assert.equal(payloadOutput({ tool_output: '{"exitCode":1}' }), '{"exitCode":1}');               // Cursor postToolUse
  assert.equal(payloadOutput({ error: 'Exit code 1\nboom' }), 'failed:Exit code 1\nboom');        // Claude PostToolUseFailure
  assert.equal(payloadOutput({ error_message: 'timed out', failure_type: 'timeout' }), 'failed:timeout:timed out'); // Cursor postToolUseFailure
  assert.equal(payloadOutput({ tool_name: 'Bash' }), undefined);
  assert.equal(payloadDir({ cwd: '/a', tool_input: { working_directory: '/b' } }), '/a');
  assert.equal(payloadDir({ tool_input: { working_directory: '/b' }, workspace_roots: ['/c'] }), '/b');
  assert.equal(payloadDir({ workspace_roots: ['/c'] }), '/c');
  assert.equal(payloadDir({}), undefined);
});

// ---------- git working-tree fingerprint ----------

const gitRepo = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-git-'));
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: d, stdio: 'ignore' });
  g('init', '-q'); fs.writeFileSync(path.join(d, 'a.ts'), 'export const a = 1;\n'); g('add', '.'); g('commit', '-qm', 'init');
  return d;
};

test('workTreeFingerprint: stable across reruns, changes with edits, ignores .loopguard/, fails open outside git', () => {
  const d = gitRepo();
  const clean = workTreeFingerprint(d)!;
  assert.ok(clean);
  assert.equal(workTreeFingerprint(d), clean);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const a = 2;\n');
  const e1 = workTreeFingerprint(d)!;
  assert.notEqual(e1, clean);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const a = 3;\n');              // same file, new content
  assert.notEqual(workTreeFingerprint(d), e1);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const a = 2;\n');              // content-based, not mtime-based
  assert.equal(workTreeFingerprint(d), e1);
  fs.mkdirSync(path.join(d, 'sub'));
  fs.writeFileSync(path.join(d, 'sub', 'new.ts'), 'x');                         // untracked file
  const e2 = workTreeFingerprint(path.join(d, 'sub'))!;                          // from a subdirectory too
  assert.notEqual(e2, e1);
  fs.writeFileSync(path.join(d, 'sub', 'new.ts'), 'y');
  assert.notEqual(workTreeFingerprint(d), e2);
  const e3 = workTreeFingerprint(d);
  fs.mkdirSync(path.join(d, '.loopguard')); fs.writeFileSync(path.join(d, '.loopguard', 'checkpoint.md'), 'notes');
  assert.equal(workTreeFingerprint(d), e3, 'writing the checkpoint note is not progress');
  assert.equal(workTreeFingerprint(fs.mkdtempSync(path.join(os.tmpdir(), 'lg-nogit-'))), undefined);
  assert.equal(workTreeFingerprint('/definitely/not/here'), undefined);
  assert.equal(workTreeFingerprint(undefined), undefined);
});

// ---------- progress-aware loop detection ----------

test('identical call does not count when the working tree changed in between', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  let fp = 0;
  for (let i = 0; i < 10; i++) {
    const v = await evaluate(bash('npm test'), { cfg: c, now: 1000 + i, costs, fingerprint: () => `fp${fp++}` });
    assert.equal(v.action, 'allow', `call ${i}`);
  }
});

test('identical call with unchanged tree trips; progressAware=false keeps the old exact-repeat behavior', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  const same = () => 'fpX';
  assert.equal((await evaluate(bash('npm test'), { cfg: c, now: 1, costs, fingerprint: same })).action, 'allow');
  assert.equal((await evaluate(bash('npm test'), { cfg: c, now: 2, costs, fingerprint: same })).action, 'allow');
  const v = await evaluate(bash('npm test'), { cfg: c, now: 3, costs, fingerprint: same });
  assert.ok(v.action === 'deny' && v.kind === 'loop' && !v.halt);
  assert.match(v.reason, /no change to the files or to its output/);

  sandbox();
  const off = cfg({ maxRepeats: 3, progressAware: false });
  let n = 0;
  await evaluate(bash('npm test'), { cfg: off, now: 1, costs, fingerprint: () => `f${n++}` });
  await evaluate(bash('npm test'), { cfg: off, now: 2, costs, fingerprint: () => `f${n++}` });
  const v2 = await evaluate(bash('npm test'), { cfg: off, now: 3, costs, fingerprint: () => `f${n++}` });
  assert.ok(v2.action === 'deny' && v2.kind === 'loop');
  assert.doesNotMatch(v2.reason, /no change to the files/);
});

test('unknown fingerprint (not a git repo) falls back to counting exact repeats', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  for (let i = 0; i < 2; i++) await evaluate(bash('npm test'), { cfg: c, now: i, costs, fingerprint: () => undefined });
  assert.equal((await evaluate(bash('npm test'), { cfg: c, now: 5, costs, fingerprint: () => undefined })).action, 'deny');
});

const post = (id: string, out: unknown, cmd = 'npm test') => normalizeInput('claude', {
  session_id: 'p1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: cmd }, tool_use_id: id, cwd: '/w', tool_response: out });

test('changing tool output (from PostToolUse) counts as progress; identical output does not', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  const same = () => 'fpX';
  const outs = ['3 failed', '2 failed', '1 failed', '0 failed, all passed', 'again'];
  for (let i = 0; i < outs.length; i++) {
    const v = await evaluate(bash('npm test', { tool_use_id: `t${i}` }), { cfg: c, now: 10 + i, costs, fingerprint: same });
    assert.equal(v.action, 'allow', `call ${i}`);
    assert.ok(recordToolOutput(post(`t${i}`, { stdout: outs[i] }), c, 10 + i));
  }
  sandbox();
  const outsSame = ['3 failed in 1.2s', '3 failed in 0.9s', '3 failed in 1.4s'];
  let last: any;
  for (let i = 0; i < 3; i++) {
    last = await evaluate(bash('npm test', { tool_use_id: `u${i}` }), { cfg: c, now: 10 + i, costs, fingerprint: same });
    recordToolOutput(post(`u${i}`, { stdout: outsSame[i] }), c, 10 + i);
  }
  assert.ok(last.action === 'deny' && last.kind === 'loop', 'same failure (timing aside) is a loop');
});

test('failures from PostToolUseFailure are recorded too, and outputs match without tool_use_id', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  const same = () => 'fpX';
  const fail = (msg: string) => normalizeInput('claude', { session_id: 'p1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash',
    tool_input: { command: 'npm test' }, cwd: '/w', error: msg });
  for (let i = 0; i < 4; i++) {
    const v = await evaluate(bash('npm test'), { cfg: c, now: 100 + i * 10, costs, fingerprint: same });
    assert.equal(v.action, 'allow', `call ${i}`);
    assert.ok(recordToolOutput(fail(`Exit code 1\n${4 - i} tests failing`), c, 101 + i * 10));
  }
});

test('the shell one-liner dodge is caught; turning normalizeShell off restores exact matching', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 3 });
  const same = () => 'fpX';
  await evaluate(bash('npm test'), { cfg: c, now: 1, costs, fingerprint: same });
  await evaluate(bash('npm run test 2>&1 | tail -50'), { cfg: c, now: 2, costs, fingerprint: same });
  const v = await evaluate(bash("bash -lc 'npm test'"), { cfg: c, now: 3, costs, fingerprint: same });
  assert.ok(v.action === 'deny' && v.kind === 'loop');
  sandbox();
  const off = cfg({ maxRepeats: 3, normalizeShell: false });
  await evaluate(bash('npm test'), { cfg: off, now: 1, costs, fingerprint: same });
  await evaluate(bash('npm run test 2>&1 | tail -50'), { cfg: off, now: 2, costs, fingerprint: same });
  assert.equal((await evaluate(bash("bash -lc 'npm test'"), { cfg: off, now: 3, costs, fingerprint: same })).action, 'allow');
});

test('block message says why and what to do; 3rd consecutive loop block still halts', async () => {
  sandbox();
  const c = cfg({ maxRepeats: 2 });
  const same = () => 'fpX';
  await evaluate(bash('npm test'), { cfg: c, now: 1, costs, fingerprint: same });
  const d1 = await evaluate(bash('npm test'), { cfg: c, now: 2, costs, fingerprint: same });
  assert.ok(d1.action === 'deny' && !d1.halt);
  for (const re of [/loop detected/, /ran 2x in 600s/, /Don't rerun it/, /different command/, /\.loopguard\/checkpoint\.md/, /root cause/, /hypotheses/])
    assert.match(d1.reason, re);
  await evaluate(bash('npm test'), { cfg: c, now: 3, costs, fingerprint: same });
  const d3 = await evaluate(bash('npm test'), { cfg: c, now: 4, costs, fingerprint: same });
  assert.ok(d3.action === 'deny' && d3.halt);
  assert.match(d3.reason, /Stopping the session/);
  assert.match(d3.reason, /loop\.maxRepeats/);
  const out = JSON.parse(render(bash('npm test'), d3).stdout);
  assert.equal(out.continue, false);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  // after a block, a real fix (tree changes) lets the same command run again
  const v = await evaluate(bash('npm test'), { cfg: c, now: 5, costs, fingerprint: () => 'fpFixed' });
  assert.equal(v.action, 'allow');
  assert.equal(loopReason('Bash', 5, 600, false, true).includes('checkpoint'), true);
});

test('recordToolOutput is a no-op when progressAware or loop detection is off', () => {
  sandbox();
  assert.equal(recordToolOutput(post('x', 'out'), cfg({ progressAware: false })), false);
  assert.equal(recordToolOutput(post('x', 'out'), cfg({ enabled: false })), false);
  assert.equal(recordToolOutput(post('x', undefined), cfg()), false);
});

// ---------- installer ----------

test('init installs post-tool hooks (Claude async + failure, Codex PostToolUse, Cursor post + failure); uninstall removes them', () => {
  const cl = addHooks('claude', {}, 'loopguard hook --agent claude');
  assert.deepEqual(Object.keys(cl.hooks), ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop']);
  assert.equal(cl.hooks.PostToolUse[0].hooks[0].async, true);
  assert.equal(cl.hooks.PostToolUseFailure[0].hooks[0].async, true);
  assert.equal(cl.hooks.PreToolUse[0].hooks[0].async, undefined);
  assert.equal(cl.hooks.PostToolUse[0].matcher, '*');
  assert.match(cl.hooks.PostToolUseFailure[0].hooks[0].command, /--event PostToolUseFailure$/);
  const cx = addHooks('codex', {}, 'loopguard hook --agent codex');
  assert.deepEqual(Object.keys(cx.hooks), ['PreToolUse', 'PostToolUse', 'Stop']);
  assert.equal(cx.hooks.PostToolUse[0].hooks[0].async, undefined);
  const cu = addHooks('cursor', { version: 1 }, 'loopguard hook --agent cursor');
  assert.deepEqual(Object.keys(cu.hooks), ['preToolUse', 'postToolUse', 'postToolUseFailure', 'stop']);
  assert.deepEqual(removeHooks('claude', cl), {});
  assert.deepEqual(removeHooks('codex', cx), {});
  assert.deepEqual(removeHooks('cursor', cu), { version: 1 });
});

// ---------- end to end through the compiled CLI, in a real git repo ----------

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');
const run = (d: string, agent: string, event: string, payload: object) => spawnSync('node', [CLI, 'hook', '--agent', agent, '--event', event], {
  input: JSON.stringify(payload), encoding: 'utf8',
  env: { ...process.env, LOOPGUARD_USER_HOME: d, LOOPGUARD_DIR: path.join(d, '.loopguard'), LOOPGUARD_CURSOR_DB: path.join(d, 'cursor/state.vscdb') },
});
const cfgFile = (d: string, c: object) => { fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true }); fs.writeFileSync(path.join(d, '.loopguard/config.json'), JSON.stringify(c)); };

test('e2e claude: edits between test runs keep it running; reruns with no edits get blocked with the checkpoint message', () => {
  const d = sandbox(); const repo = gitRepo();
  cfgFile(d, { sessionCapUsd: 0, dailyCapUsd: 0, loop: { maxRepeats: 3, spiralUsd: 0 } });
  const pre = (i: number) => ({ session_id: 'e1', hook_event_name: 'PreToolUse', cwd: repo, tool_name: 'Bash', tool_use_id: `c${i}`,
    tool_input: { command: 'npm test', description: `try ${i}` } });
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(repo, 'a.ts'), `export const a = ${i + 10};\n`);
    const r = run(d, 'claude', 'PreToolUse', pre(i));
    assert.equal(r.status, 0); assert.equal(r.stdout, '', `call ${i} allowed`);
    const p = run(d, 'claude', 'PostToolUse', { ...pre(i), hook_event_name: 'PostToolUse', tool_response: { stdout: 'FAIL', stderr: '' } });
    assert.equal(p.status, 0); assert.equal(p.stdout, '');
  }
  let last: any;
  for (let i = 5; i < 8; i++) last = run(d, 'claude', 'PreToolUse', pre(i));
  const o = JSON.parse(last.stdout);
  assert.equal(o.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(o.hookSpecificOutput.permissionDecisionReason, /checkpoint\.md/);
});

test('e2e cursor: postToolUse answers {} and records the output; codex PostToolUse answers nothing', () => {
  const d = sandbox();
  const p = run(d, 'cursor', 'postToolUse', { conversation_id: 'cv', hook_event_name: 'postToolUse', tool_name: 'Shell', cursor_version: '3.25.9',
    tool_input: { command: 'npm test' }, tool_output: '{"exitCode":1,"stdout":"FAIL"}', tool_use_id: 'x1', cwd: '/w', duration: 10 });
  assert.equal(p.status, 0); assert.equal(p.stdout, '{}');
  const f = path.join(d, '.loopguard/state/cursor-cv.out.jsonl');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8').trim()).id, 'x1');
  const pf = run(d, 'cursor', 'postToolUseFailure', { conversation_id: 'cv', hook_event_name: 'postToolUseFailure', tool_name: 'Shell', cursor_version: '3.25.9',
    tool_input: { command: 'npm test' }, error_message: 'timed out', failure_type: 'timeout', tool_use_id: 'x2' });
  assert.equal(pf.stdout, '{}');
  const cx = run(d, 'codex', 'PostToolUse', { session_id: 'cs', hook_event_name: 'PostToolUse', cwd: '/w', tool_name: 'Bash', turn_id: 't',
    tool_input: { command: 'npm test' }, tool_response: 'FAIL\n', tool_use_id: 'exec-1' });
  assert.equal(cx.status, 0); assert.equal(cx.stdout, ''); assert.equal(cx.stderr, '');
  assert.ok(fs.existsSync(path.join(d, '.loopguard/state/codex-cs.out.jsonl')));
});
