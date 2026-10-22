/**
 * Progress signals for loop detection. An identical tool call only counts toward a loop when nothing changed
 * since the previous identical call: same git working tree (content fingerprint) and, when the agent's
 * post-tool hook reported it, the same normalized tool output. Everything here fails open (returns undefined).
 */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const sha = (s: string | Buffer) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 20);

/** Paths LoopGuard itself suggests writing (checkpoint notes) never count as progress. */
const IGNORED = /^\.loopguard(\/|$)/;
const MAX_FILES = 300, MAX_FILE_BYTES = 512 * 1024, MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function git(args: string[], cwd: string, timeoutMs: number): string {
  return execFileSync('git', args, {
    cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // Never take index.lock: the agent may be running git at the same moment.
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  });
}

/**
 * Content fingerprint of the git working tree at `dir`: `git status` (tracked changes + untracked files) plus a
 * hash of each changed file's contents. Re-running a test doesn't change it; editing code does. Returns
 * undefined outside a git repo or on any error/timeout.
 */
export function workTreeFingerprint(dir: string | undefined, timeoutMs = 1500): string | undefined {
  if (!dir) return undefined;
  try {
    if (!fs.statSync(dir).isDirectory()) return undefined;
    const started = Date.now();
    const root = git(['rev-parse', '--show-toplevel'], dir, timeoutMs).trim();
    if (!root) return undefined;
    const left = Math.max(200, timeoutMs - (Date.now() - started));
    const out = git(['-c', 'core.quotepath=off', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], root, left);
    const h = crypto.createHash('sha1');
    let files = 0, bytes = 0;
    for (const rec of out.split('\0')) {
      if (rec.length < 4) continue;
      const rel = rec.slice(3);
      if (IGNORED.test(rel)) continue;
      h.update(rec + '\0');
      if (files >= MAX_FILES) continue;
      files++;
      const abs = path.join(root, rel);
      try {
        const st = fs.statSync(abs);
        if (!st.isFile()) { h.update('d\0'); continue; }
        if (st.size <= MAX_FILE_BYTES && bytes + st.size <= MAX_TOTAL_BYTES) { bytes += st.size; h.update(fs.readFileSync(abs)); }
        else h.update(`${st.size}:${st.mtimeMs}`);
      } catch { h.update('gone'); }
      h.update('\0');
    }
    return h.digest('hex').slice(0, 20);
  } catch { return undefined; }
}

/** Working directory for a hook payload: `cwd` (Claude Code, Codex, Cursor), Cursor's Shell `working_directory`, workspace root. */
export function payloadDir(raw: any): string | undefined {
  const ti = raw?.tool_input;
  const cands = [raw?.cwd, ti && typeof ti === 'object' ? ti.working_directory : undefined,
    Array.isArray(raw?.workspace_roots) ? raw.workspace_roots[0] : undefined];
  for (const c of cands) if (typeof c === 'string' && c) return c;
  return undefined;
}

/** Strip noise that changes between otherwise identical runs: ANSI codes, timestamps, durations, temp paths, ids. */
export function normalizeOutput(s: string): string {
  if (s.length > 1_000_000) s = s.slice(0, 500_000) + '\n…\n' + s.slice(-500_000);
  return s
    .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g, '<time>')
    .replace(/"([\w-]*(time|duration|elapsed|took|timestamp|pid)[\w-]*)"\s*:\s*-?\d+(\.\d+)?/gi, '"$1":0')
    .replace(/\b\d+(\.\d+)?\s?(ms|µs|us|ns|s|sec|secs|seconds|min|mins|minutes)\b/g, '<dur>')
    .replace(/(\/private)?\/(tmp|var\/folders)\/[^\s'"`),\]}]*/g, '<tmp>')
    .replace(/[A-Za-z]:\\[^\s'"]*\\Temp\\[^\s'"]*/gi, '<tmp>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<id>')
    .replace(/\bpid[ =:]*\d+/gi, 'pid <n>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function outputHash(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  try { return sha(normalizeOutput(typeof v === 'string' ? v : JSON.stringify(v))); } catch { return undefined; }
}

/**
 * The tool result from a post-tool hook payload, as each agent sends it:
 * Claude Code PostToolUse `tool_response` / PostToolUseFailure `error`; Codex PostToolUse `tool_response`
 * (also fires for non-zero Bash exits); Cursor postToolUse `tool_output` / postToolUseFailure `error_message`.
 */
export function payloadOutput(raw: any): unknown {
  if (raw?.tool_response !== undefined) return raw.tool_response;
  if (raw?.tool_output !== undefined) return raw.tool_output;
  if (typeof raw?.error === 'string') return 'failed:' + raw.error;
  if (typeof raw?.error_message === 'string') return 'failed:' + (raw.failure_type || '') + ':' + raw.error_message;
  return undefined;
}

const SHELL_TOOLS = /^(bash|shell|exec_command|local_shell|shell_command|run_terminal_cmd|run_shell_command)$/i;

export function isShellTool(name: string | undefined): boolean { return !!name && SHELL_TOOLS.test(name); }

function shellCommand(input: any): string | undefined {
  const c = input && typeof input === 'object' ? input.command : input;
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && c.every(x => typeof x === 'string')) {
    if (c.length === 3 && /^(ba|z)?sh$/.test(path.basename(c[0])) && /^-l?c$/.test(c[1])) return c[2];
    return c.join(' ');
  }
  return undefined;
}

/**
 * Normalize a shell command so cosmetic rewordings of the same run match. Deliberately narrow (low false-positive
 * risk): whitespace, `bash -c '…'` / `sh -lc "…"` wrappers, a leading `cd <cwd> &&`, a leading `timeout N`,
 * trailing `2>&1`, trailing `| tail …` / `| head …` / `| cat`, and `npm run test` / `npm t` = `npm test`
 * (also `pnpm run test`, `yarn run test`). It does NOT treat different tools (`npx jest` vs `npm test`) as equal.
 */
export function normalizeShell(cmd: string, cwd?: string): string {
  let s = cmd.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 5; i++) {
    const before = s;
    const w = s.match(/^(?:\/\S*\/)?(?:ba|z)?sh -l?c (['"])(.*)\1$/);
    if (w) s = w[2].trim();
    const cd = s.match(/^cd (\S+|"[^"]+"|'[^']+') ?&& ?(.*)$/);
    if (cd && cwd) {
      const target = cd[1].replace(/^['"]|['"]$/g, '');
      if (path.resolve(cwd, target) === path.resolve(cwd)) s = cd[2].trim();
    }
    s = s.replace(/^timeout (-\S+ )*\d+[smh]? /, '');
    s = s.replace(/ ?\| ?(tail|head)( (-n ?\d+|-\d+|-c ?\d+|--lines=\d+|-n|-f|\+?\d+))*$/, '');
    s = s.replace(/ ?\| ?cat$/, '');
    s = s.replace(/ ?2>&1$/, '');
    s = s.replace(/;$/, '').trim();
    if (s === before) break;
  }
  return s
    .replace(/^npm (run|run-script) test\b/, 'npm test')
    .replace(/^npm (t|tst)\b/, 'npm test')
    .replace(/^(pnpm|yarn) run test\b/, '$1 test');
}

/** Key that identifies "the same call". Shell tools key on the normalized command (+ working directory), not on
 *  cosmetic fields like Claude's Bash `description`. Other tools key on name + exact input, as before. */
export function callKey(toolName: string, toolInput: unknown, opts: { normalizeShell?: boolean; cwd?: string } = {}): string {
  if (opts.normalizeShell !== false && isShellTool(toolName)) {
    const c = shellCommand(toolInput);
    if (c !== undefined) {
      const wd = toolInput && typeof toolInput === 'object' && typeof (toolInput as any).working_directory === 'string'
        ? (toolInput as any).working_directory : '';
      return sha(`shell\0${wd}\0${normalizeShell(c, wd || opts.cwd)}`);
    }
  }
  return crypto.createHash('sha1').update(`${toolName}\0${JSON.stringify(toolInput ?? null)}`).digest('hex');
}
