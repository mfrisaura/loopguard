#!/usr/bin/env node
/*
 * Drives the hook loader + executor of a locally installed Cursor CLI (`cursor-agent`, official installer:
 * `curl https://cursor.com/install -fsS | bash`) against LoopGuard's hooks, in a throwaway HOME. No Cursor
 * login, network or model calls are needed: this exercises Cursor's real code for reading ~/.cursor/hooks.json
 * (+ ~/.claude/settings.json third-party hooks), spawning hooks, passing the payload on stdin and parsing replies.
 * It does NOT run a model, so it can't prove which tool_input/conversation_id a live session sends.
 *
 * Reaches into the CLI's minified webpack bundle; export names were checked on 2026.10.19-6bbf2c4 and may move.
 * Usage: npm run build && node scripts/cursor-hooks-e2e.js [path/to/cursor-agent/versions/<v>]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const versions = path.join(os.homedir(), '.local/share/cursor-agent/versions');
const ver = process.argv[2] || (fs.existsSync(versions) && path.join(versions, fs.readdirSync(versions).sort().pop()));
if (!ver || !fs.existsSync(path.join(ver, 'index.js'))) { console.error('cursor-agent not found; install it or pass its version dir'); process.exit(2); }

if (process.env.LG_E2E_CHILD) return child();

// Parent: patch a copy of index.js to export __webpack_require__ instead of starting the CLI.
const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-hooks-'));
for (const f of fs.readdirSync(ver)) if (f !== 'index.js') fs.symlinkSync(path.join(ver, f), path.join(shim, f));
const src = fs.readFileSync(path.join(ver, 'index.js'), 'utf8');
const patched = src.replace(/var __webpack_exports__=__webpack_require__\("\.\/src\/main\.tsx"\)\}\)\(\);\s*$/, 'module.exports=__webpack_require__;})();');
if (patched === src) { console.error('could not patch bundle entry (CLI layout changed)'); process.exit(2); }
fs.writeFileSync(path.join(shim, 'index.js'), patched);

const cli = path.join(root, 'dist/cli.js');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };
function scenario(agents, cfg, steps) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-home-'));
  fs.mkdirSync(path.join(home, 'proj'));
  for (const a of agents) fs.mkdirSync(path.join(home, a === 'cursor' ? '.cursor' : '.claude'), { recursive: true });
  const env = { ...process.env, HOME: home, LOOPGUARD_USER_HOME: home, LOOPGUARD_CURSOR_DB: path.join(home, 'none.vscdb') };
  delete env.CURSOR_VERSION;
  execFileSync('node', [cli, 'init', '--agent', agents.join(',')], { env });
  fs.mkdirSync(path.join(home, '.loopguard'), { recursive: true });
  fs.writeFileSync(path.join(home, '.loopguard/config.json'), JSON.stringify(cfg));
  const out = execFileSync(path.join(ver, 'node'), [__filename, ver], {
    env: { ...env, LG_E2E_CHILD: shim, WS: path.join(home, 'proj') }, input: JSON.stringify(steps), encoding: 'utf8' });
  const lines = out.trim().split('\n').map(l => JSON.parse(l));
  let trips = [];
  try { trips = fs.readFileSync(path.join(home, '.loopguard/trips.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch {}
  return { lines, trips, home };
}
const base = (conv, gen = 'gen-1') => ({ conversation_id: conv, generation_id: gen, model: 'claude-4.5-sonnet', model_id: 'claude-sonnet-4-5' });
const pre = (conv, cmd) => ({ step: 'preToolUse', payload: { ...base(conv), tool_name: 'Shell', tool_input: { command: cmd, working_directory: '/w' }, tool_use_id: Math.random().toString(36) } });
const stop = (conv, t) => ({ step: 'stop', payload: { ...base(conv), status: 'completed', loop_count: 0, ...t } });

// 1. loop: 5 identical calls -> 5th denied
let r = scenario(['cursor'], { sessionCapUsd: 0, dailyCapUsd: 0 }, [1, 2, 3, 4, 5].map(() => pre('c-loop', 'npm test')));
check('Cursor loads ~/.cursor/hooks.json and runs the LoopGuard hook', r.lines[0].result?.permission === 'allow', JSON.stringify(r.lines[0].execs));
check('loop: 5th identical Shell call is denied by Cursor', r.lines[4].result?.permission === 'deny' && r.lines[4].execs.some(e => e.status === 'blocked'), r.lines[4].result?.user_message);

// 2. session cap from stop-hook tokens
r = scenario(['cursor'], { sessionCapUsd: 1.5, dailyCapUsd: 0 }, [pre('c-cap', 'ls'),
  stop('c-cap', { input_tokens: 1_200_000, output_tokens: 40_000, cache_read_tokens: 900_000, cache_write_tokens: 100_000 }), pre('c-cap', 'git status')]);
check('stop hook reply is accepted by Cursor (no empty_stdout failure)', r.lines[1].execs.every(e => e.status === 'success'), JSON.stringify(r.lines[1].execs));
check('session cap: next tool call denied once stop-reported spend passes the cap', r.lines[2].result?.permission === 'deny', r.lines[2].result?.user_message);
check('cost: $1.84 for 200k fresh + 900k cache-read + 100k cache-write in, 40k out on Sonnet 4.5', /\$1\.84/.test(r.lines[2].result?.user_message || ''));

// 3. Claude Code hooks are ALSO run by Cursor (third-party hooks): one deny, not two
r = scenario(['claude', 'cursor'], { sessionCapUsd: 0, dailyCapUsd: 0 }, [1, 2, 3, 4, 5].map(() => pre('c-both', 'npm test')));
const sources = new Set(r.lines[0].execs.map(e => e.hookSource));
check('Cursor runs both ~/.cursor/hooks.json and ~/.claude/settings.json hooks', sources.has('user') && sources.has('claude-user'), [...sources].join(','));
check('with both installed, only one LoopGuard deny + one trip', r.lines[4].result?.permission === 'deny' && !/---/.test(r.lines[4].result?.user_message) && r.trips.length === 1, `trips=${r.trips.length}`);
check('no hook reported as failed', r.lines.every(l => l.execs.every(e => e.status !== 'failed')));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

async function child() {
  const req = require(path.join(process.env.LG_E2E_CHILD, 'index.js'));
  for (const f of fs.readdirSync(process.env.LG_E2E_CHILD)) { const m = /^(\d+)\.index\.js$/.exec(f); if (m) { try { await req.e(+m[1]); } catch {} } }
  const hx = req('../hooks-exec/dist/index.js'), hooks = req('../hooks/dist/index.js'), shell = req('../shell-exec/dist/api/index.js');
  const ws = process.env.WS;
  const cfg = await new hx.gY(new hx.IF(), hx.Ve(ws)).load();
  let execs = [];
  const exec = new hx.WL(cfg, ws, { cursor_version: path.basename(ver), user_email: null }, shell.Fn(), undefined, undefined,
    e => execs.push({ hookSource: e.hookSource, status: e.status, errorClass: e.errorClass, latencyMs: e.latencyMs }),
    { enableClaudeNestedHookSpecificOutputCompatibility: true, commandHookPayloadTransport: hooks.S6(true) });
  for (const s of JSON.parse(fs.readFileSync(0, 'utf8'))) {
    execs = [];
    const result = await exec.executeHookForStep(hooks._E[s.step], s.payload);
    process.stdout.write(JSON.stringify({ step: s.step, result, execs }) + '\n');
  }
  process.exit(0);
}
