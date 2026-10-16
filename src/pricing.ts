import fs from 'fs';
import path from 'path';
import { lgDir } from './paths';
import { UsageEvent } from './types';

/** USD per 1M tokens. Defaults are list-price estimates; override in ~/.loopguard/pricing.json. */
export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }
const p = (input: number, output: number, cacheRead = input * 0.1, cacheWrite = input * 1.25): Price =>
  ({ input, output, cacheRead, cacheWrite });

// Ordered: first substring match wins.
export const DEFAULT_PRICES: [string, Price][] = [
  ['claude-opus-4-1', p(15, 75)],
  ['claude-opus-4-2025', p(15, 75)], // Opus 4.0 dated ids; Opus 4.5+ fall to 'opus'
  ['opus', p(5, 25)],
  ['sonnet', p(3, 15)],
  ['haiku', p(1, 5)],
  ['gpt-5-codex', p(1.25, 10, 0.125, 0)],
  ['gpt-5-mini', p(0.25, 2, 0.025, 0)],
  ['gpt-5-nano', p(0.05, 0.4, 0.005, 0)],
  ['gpt-5', p(1.25, 10, 0.125, 0)],
  ['gpt-4.1', p(2, 8, 0.5, 0)],
  ['o3', p(2, 8, 0.5, 0)],
  ['o4-mini', p(1.1, 4.4, 0.275, 0)],
];
export const FALLBACK: Price = p(3, 15);

let overrides: [string, Price][] | null = null;
function loadOverrides(): [string, Price][] {
  if (overrides) return overrides;
  overrides = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(lgDir(), 'pricing.json'), 'utf8'));
    for (const [k, v] of Object.entries(raw)) overrides.push([k.toLowerCase(), { ...FALLBACK, ...(v as object) }]);
  } catch { /* none */ }
  return overrides;
}
export function resetPricingCache() { overrides = null; }

export function priceFor(model: string): Price {
  const m = (model || '').toLowerCase();
  for (const [k, v] of [...loadOverrides(), ...DEFAULT_PRICES]) if (m.includes(k)) return v;
  return FALLBACK;
}

export function costOf(e: UsageEvent): number {
  const pr = priceFor(e.model);
  return (e.inputTokens * pr.input + e.outputTokens * pr.output +
    e.cacheReadTokens * pr.cacheRead + e.cacheWriteTokens * pr.cacheWrite) / 1e6;
}
