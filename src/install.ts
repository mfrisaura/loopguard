import fs from 'fs';
import path from 'path';
import { Agent } from './types';
import { codexHome, home, lgDir } from './paths';
import { readJson, writeJson } from './util';

export const MARK = 'loopguard hook';

const ownCli = () => path.resolve(__dirname, '..', 'dist', 'cli.js');

/** Find a `loopguard` executable on PATH that resolves to THIS install (global npm/pnpm/bun bin). */
export function globalBin(pathEnv = process.env.PATH || '', target = ownCli()): string | null {
  let real: string;
  try { real = fs.realpathSync(target); } catch { return null; }
  const names = process.platform === 'win32' ? ['loopguard.cmd', 'loopguard.exe', 'loopguard'] : ['loopguard'];
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        if (!fs.existsSync(p)) continue;
        // npx caches are temporary: never pin hooks to them
        if (/[\\/]_npx[\\/]/.test(p)) continue;
        if (process.platform === 'win32' || fs.realpathSync(p) === real) return 'loopguard';
      } catch { /* skip */ }
    }
  }
  return null;
}

export const PKG_NAME = 'loopguard-cli';

/** True when running from a temporary npx cache (e.g. `npx loopguard-cli init`). */
export const runningFromNpx = (target = ownCli()) => /[\\/]_npx[\\/]/.test(target);

function pkgVersion(): string {
  try { return require(path.resolve(__dirname, '..', 'package.json')).version; } catch { return 'latest'; }
}

/** Command the agents' hooks run. Never pinned to a temporary npx cache path. */
export function hookCli(target = ownCli(), pathEnv = process.env.PATH || ''): string {
  if (process.env.LOOPGUARD_BIN) return process.env.LOOPGUARD_BIN;
  const g = globalBin(pathEnv, target);
  if (g) return g;
  // From an npx cache with no global install: re-resolve via npx (slower, but survives cache cleanup).
  if (runningFromNpx(target)) return `npx -y ${PKG_NAME}@${pkgVersion()}`;
  return `node ${JSON.stringify(target)}`;
}

export function hookCommand(agent: Agent): string {
  return `${hookCli()} hook --agent ${agent}`;
}

export function configPath(agent: Agent): string {
  if (agent === 'claude') return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude'), 'settings.json');
  if (agent === 'codex') return path.join(codexHome(), 'hooks.json');
  return path.join(home(), '.cursor', 'hooks.json');
}

export const isOurs = (cmd: unknown) =>
  typeof cmd === 'string' && /loopguard/i.test(cmd) && / hook --agent (claude|codex|cursor)\b/.test(cmd);

/** Pure transforms (tested). */
export function addHooks(agent: Agent, cfg: any, cmd: string): any {
  const c = cfg && typeof cfg === 'object' ? JSON.parse(JSON.stringify(cfg)) : {};
  c.hooks = c.hooks && typeof c.hooks === 'object' ? c.hooks : {};
  if (agent === 'cursor') {
    c.version = c.version ?? 1;
    for (const ev of ['preToolUse', 'stop']) {
      const list: any[] = Array.isArray(c.hooks[ev]) ? c.hooks[ev] : [];
      c.hooks[ev] = [...list.filter(h => !isOurs(h?.command)), { command: `${cmd} --event ${ev}` }];
    }
    return c;
  }
  for (const ev of ['PreToolUse', 'Stop']) {
    const groups: any[] = Array.isArray(c.hooks[ev]) ? c.hooks[ev] : [];
    const cleaned = stripGroups(groups);
    const entry: any = { hooks: [{ type: 'command', command: `${cmd} --event ${ev}`, timeout: 15 }] };
    if (ev === 'PreToolUse') entry.matcher = agent === 'claude' ? '*' : '.*';
    c.hooks[ev] = [...cleaned, entry];
  }
  return c;
}

function stripGroups(groups: any[]): any[] {
  return groups
    .map(g => ({ ...g, hooks: Array.isArray(g?.hooks) ? g.hooks.filter((h: any) => !isOurs(h?.command)) : g?.hooks }))
    .filter(g => !Array.isArray(g.hooks) || g.hooks.length > 0);
}

export function removeHooks(agent: Agent, cfg: any): any {
  if (!cfg?.hooks) return cfg;
  const c = JSON.parse(JSON.stringify(cfg));
  for (const ev of Object.keys(c.hooks)) {
    const list = c.hooks[ev];
    if (!Array.isArray(list)) continue;
    c.hooks[ev] = agent === 'cursor' ? list.filter((h: any) => !isOurs(h?.command)) : stripGroups(list);
    if (c.hooks[ev].length === 0) delete c.hooks[ev];
  }
  if (Object.keys(c.hooks).length === 0) delete c.hooks;
  return c;
}

interface Manifest { [agent: string]: { file: string; backup: string | null; existed: boolean; installedAt: string } }
const manifestFile = () => path.join(lgDir(), 'backups', 'manifest.json');

export function detectAgents(): Agent[] {
  const found: Agent[] = [];
  if (fs.existsSync(path.dirname(configPath('claude')))) found.push('claude');
  if (fs.existsSync(codexHome())) found.push('codex');
  if (fs.existsSync(path.join(home(), '.cursor'))) found.push('cursor');
  return found;
}

export function install(agent: Agent): string {
  const file = configPath(agent);
  const existed = fs.existsSync(file);
  let current: any = {};
  if (existed) {
    const raw = fs.readFileSync(file, 'utf8');
    try { current = raw.trim() ? JSON.parse(raw) : {}; }
    catch { throw new Error(`${file} is not valid JSON; refusing to modify`); }
  }
  const man = readJson<Manifest>(manifestFile(), {});
  let backup: string | null = man[agent]?.backup ?? null;
  if (!man[agent]) { // keep the ORIGINAL pre-LoopGuard backup across re-installs
    if (existed) {
      backup = path.join(lgDir(), 'backups', `${agent}-${Date.now()}-${path.basename(file)}`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(file, backup);
    }
    man[agent] = { file, backup, existed, installedAt: new Date().toISOString() };
    writeJson(manifestFile(), man);
  }
  writeJson(file, addHooks(agent, current, hookCommand(agent)));
  return file;
}

/** mode 'remove' strips only LoopGuard entries (keeps later user edits); 'restore' puts original file back. */
export function uninstall(agent: Agent, mode: 'remove' | 'restore' = 'remove'): string {
  const file = configPath(agent);
  const man = readJson<Manifest>(manifestFile(), {});
  const m = man[agent];
  if (mode === 'restore' && m) {
    if (m.backup && fs.existsSync(m.backup)) fs.copyFileSync(m.backup, file);
    else if (!m.existed && fs.existsSync(file)) fs.unlinkSync(file);
  } else if (fs.existsSync(file)) {
    const cleaned = removeHooks(agent, readJson<any>(file, {}));
    const empty = !cleaned || Object.keys(cleaned).filter(k => !(agent === 'cursor' && k === 'version')).length === 0;
    if (m && !m.existed && empty) fs.unlinkSync(file); else writeJson(file, cleaned);
  }
  delete man[agent];
  writeJson(manifestFile(), man);
  return file;
}
