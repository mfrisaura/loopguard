import fs from 'fs';
import os from 'os';
import path from 'path';
export const FIX = path.join(__dirname, 'fixtures');
export function sandbox(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-'));
  process.env.LOOPGUARD_USER_HOME = d;
  process.env.LOOPGUARD_DIR = path.join(d, '.loopguard');
  process.env.LOOPGUARD_CURSOR_DB = path.join(d, 'cursor', 'state.vscdb');
  delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME;
  return d;
}
export function seed(d: string) {
  const c = path.join(d, '.claude/projects/-work-app'); fs.mkdirSync(c, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'claude-session.jsonl'), path.join(c, 'sess-claude-1.jsonl'));
  const x = path.join(d, '.codex/sessions/2026/10/15'); fs.mkdirSync(x, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'codex-rollout.jsonl'), path.join(x, 'rollout-2026-10-15T15-00-00-0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl'));
  fs.mkdirSync(path.join(d, 'cursor'), { recursive: true }); fs.mkdirSync(path.join(d, '.cursor'), { recursive: true });
  fs.copyFileSync(path.join(FIX, 'state.vscdb'), path.join(d, 'cursor', 'state.vscdb'));
}
export const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
