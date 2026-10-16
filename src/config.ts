import path from 'path';
import { lgDir } from './paths';
import { readJson, writeJson } from './util';

export interface Config {
  sessionCapUsd: number;     // 0 = off
  dailyCapUsd: number;       // 0 = off; across all agents, local day
  loop: {
    enabled: boolean;
    maxRepeats: number;      // identical tool call (name+input) N times within window -> trip
    windowSec: number;
    spiralUsd: number;       // session spend increase within spiralWindowSec -> trip (0 = off)
    spiralWindowSec: number;
  };
  warnAtPct: number;         // print warning to agent at this % of a cap
}
export const DEFAULTS: Config = {
  sessionCapUsd: 25, dailyCapUsd: 100,
  loop: { enabled: true, maxRepeats: 5, windowSec: 600, spiralUsd: 10, spiralWindowSec: 300 },
  warnAtPct: 80,
};
export const configFile = () => path.join(lgDir(), 'config.json');
export function loadConfig(): Config {
  const c = readJson<Partial<Config>>(configFile(), {});
  return { ...DEFAULTS, ...c, loop: { ...DEFAULTS.loop, ...(c.loop || {}) } };
}
export function setConfig(key: string, value: string) {
  const c: any = loadConfig();
  const parts = key.split('.');
  let o = c;
  for (const p of parts.slice(0, -1)) { if (typeof o[p] !== 'object') throw new Error(`unknown key ${key}`); o = o[p]; }
  const last = parts[parts.length - 1];
  if (!(last in o)) throw new Error(`unknown key ${key}`);
  o[last] = typeof o[last] === 'boolean' ? value === 'true' : typeof o[last] === 'number' ? Number(value) : value;
  if (typeof o[last] === 'number' && Number.isNaN(o[last])) throw new Error(`not a number: ${value}`);
  writeJson(configFile(), c);
  return c as Config;
}
