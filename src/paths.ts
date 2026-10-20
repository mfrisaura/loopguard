import os from 'os';
import path from 'path';
export const home = () => process.env.LOOPGUARD_USER_HOME || os.homedir();
export const lgDir = () => process.env.LOOPGUARD_DIR || path.join(home(), '.loopguard');
export const claudeProjectsDir = () =>
  path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude'), 'projects');
export const codexHome = () => process.env.CODEX_HOME || path.join(home(), '.codex');
export const codexSessionsDir = () => path.join(codexHome(), 'sessions');
/** Per-turn token counts that Cursor reports to LoopGuard's `stop` hook (written by LoopGuard). */
export const cursorLedgerPath = () => path.join(lgDir(), 'cursor-usage.jsonl');
export function cursorDbPath(): string {
  if (process.env.LOOPGUARD_CURSOR_DB) return process.env.LOOPGUARD_CURSOR_DB;
  const h = home();
  if (process.platform === 'darwin')
    return path.join(h, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(h, 'AppData/Roaming'), 'Cursor/User/globalStorage/state.vscdb');
  return path.join(h, '.config/Cursor/User/globalStorage/state.vscdb');
}
