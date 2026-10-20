import fs from 'fs';
import path from 'path';
import { lgDir } from './paths';
import { UsageEvent } from './types';

/**
 * USD per 1M tokens, at API list price (standard tier, global endpoints, no batch discount).
 * Sources, checked 2026-10-20:
 *   Anthropic  https://platform.claude.com/docs/en/about-claude/pricing
 *   OpenAI     https://developers.openai.com/api/docs/pricing
 *   Cursor     https://cursor.com/docs/models  (Cursor's own models + third-party models at API list price)
 * cacheWrite = 5-minute cache write. `long` = long-context tier applied per request when the prompt
 * (input + cache read + cache write) exceeds `over` tokens. Override any of this in ~/.loopguard/pricing.json.
 */
export interface Price {
  input: number; output: number; cacheRead: number; cacheWrite: number;
  long?: { over: number; input: number; output: number }; // multipliers
}
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
/** Anthropic-style defaults: cache read 0.1x input, 5-minute cache write 1.25x input. */
const p = (input: number, output: number, cacheRead = input * 0.1, cacheWrite = input * 1.25, long?: Price['long']): Price =>
  ({ input, output, cacheRead: r6(cacheRead), cacheWrite: r6(cacheWrite), ...(long ? { long } : {}) });
/** OpenAI-style: cached input listed, no cache-write charge. */
const o = (input: number, output: number, cacheRead: number, long?: Price['long']) => p(input, output, cacheRead, 0, long);
const OAI_LONG = { over: 272_000, input: 2, output: 1.5 };

/**
 * Model names arrive in several spellings: `claude-sonnet-4-5-20250929` (Claude Code), `gpt-5.4` (Codex),
 * `claude-4.5-sonnet`, `claude-opus-4-7-thinking-max`, `composer-2.5` (Cursor). Normalize to lowercase,
 * dashes only, and Anthropic's family-first order, then match the first pattern below.
 */
export function canonicalModel(model: string): string {
  return (model || '').toLowerCase().trim()
    .replace(/[._\s/]+/g, '-')
    .replace(/claude-(\d+(?:-\d+)?)-(opus|sonnet|haiku|fable|mythos)/, 'claude-$2-$1');
}

// Ordered: first match wins, so specific ids come before their family.
export const DEFAULT_PRICES: [RegExp, Price][] = [
  // ---- Anthropic ----
  [/(fable|mythos)-5-1/, p(10, 50, 0.25)],
  [/fable|mythos/, p(10, 50, 1)],
  [/opus-5-5.*fast/, p(8, 40, 0.4)],
  [/opus-5-5/, p(4, 20, 0.2)],
  [/opus-(5|4-8).*fast/, p(10, 50)],
  [/opus-4-7.*fast/, p(30, 150)],                           // Cursor: Opus 4.7 fast mode (research preview)
  [/opus-4-1|opus-4(-2025|-thinking|$)/, p(15, 75)],      // Opus 4 / 4.1; Opus 4.5+ fall through to 'opus'
  [/opus/, p(5, 25)],                                       // Opus 4.5, 4.6, 4.7, 4.8, 5
  [/sonnet-4-1m/, p(6, 22.5)],                              // Cursor: Claude 4 Sonnet 1M (2x in, 1.5x out)
  [/sonnet-5-5/, p(2, 10, 0.1)],
  [/sonnet-5(-|$)/, p(2, 10, 0.2)],
  [/sonnet/, p(3, 15)],                                     // Sonnet 4, 4.5, 4.6
  [/haiku-5-5/, p(0.1, 0.5, 0.01, 0.125, { over: 100_000, input: 5, output: 5 })],
  [/haiku-3/, p(0.8, 4)],
  [/haiku/, p(1, 5)],                                       // Haiku 4.5
  // ---- OpenAI / Codex ----
  [/gpt-6-astra/, p(10, 50, 1, 12.5, OAI_LONG)],
  [/gpt-6-1-sol/, p(2, 10, 0.1, 2.5, OAI_LONG)],
  [/gpt-6-luna/, p(0.1, 0.5, 0.01, 0.125, OAI_LONG)],
  [/gpt-6/, p(2, 10, 0.2, 2.5, OAI_LONG)],                  // gpt-6-sol and unknown gpt-6 variants
  [/gpt-5-6-cyber/, p(12.5, 75, 1.25, 15.625)],
  [/gpt-5-6-sol/, p(4, 20, 0.4, 5, OAI_LONG)],
  [/gpt-5-6-luna/, p(0.2, 1.2, 0.02, 0.25, OAI_LONG)],
  [/gpt-5-6/, p(2, 12, 0.2, 2.5, OAI_LONG)],                // gpt-5.6-terra
  [/gpt-5-5-cyber/, o(12.5, 75, 1.25)],
  [/gpt-5-5-pro/, o(30, 180, 30, OAI_LONG)],
  [/gpt-5-5.*fast/, o(12.5, 75, 1.25)],
  [/gpt-5-5/, o(5, 30, 0.5, OAI_LONG)],
  [/gpt-5-4-pro/, o(30, 180, 30, OAI_LONG)],
  [/gpt-5-4-mini/, o(0.75, 4.5, 0.075)],
  [/gpt-5-4-nano/, o(0.2, 1.25, 0.02)],
  [/gpt-5-4/, o(2.5, 15, 0.25, OAI_LONG)],
  [/gpt-5-3/, o(1.75, 14, 0.175)],                          // gpt-5.3-codex (+ retired -spark)
  [/gpt-5-2-pro/, o(21, 168, 21)],
  [/gpt-5-2/, o(1.75, 14, 0.175)],                          // gpt-5.2, gpt-5.2-codex
  [/gpt-5(-1)?-codex-mini/, o(0.25, 2, 0.025)],
  [/gpt-5-1/, o(1.25, 10, 0.125)],                          // gpt-5.1, -codex, -codex-max
  [/gpt-5-pro/, o(15, 120, 15)],
  [/gpt-5-mini/, o(0.25, 2, 0.025)],
  [/gpt-5-nano/, o(0.05, 0.4, 0.005)],
  [/gpt-5/, o(1.25, 10, 0.125)],                            // gpt-5, gpt-5-codex
  [/gpt-4-1-mini/, o(0.4, 1.6, 0.1)],
  [/gpt-4-1-nano/, o(0.1, 0.4, 0.025)],
  [/gpt-4-1/, o(2, 8, 0.5)],
  [/gpt-4o-mini/, o(0.15, 0.6, 0.075)],
  [/gpt-4o/, o(2.5, 10, 1.25)],
  [/(^|-)o4-mini/, o(1.1, 4.4, 0.275)],
  [/(^|-)o3-pro/, o(20, 80, 20)],
  [/(^|-)o3-mini/, o(1.1, 4.4, 0.55)],
  [/(^|-)o3(-|$)/, o(2, 8, 0.5)],
  [/(^|-)o1-pro/, o(150, 600, 150)],
  [/(^|-)o1(-|$)/, o(15, 60, 7.5)],
  [/codex-mini/, o(1.5, 6, 0.375)],
  // ---- Cursor's own models ----
  [/composer-2-5.*fast/, o(3, 15, 0.5)],
  [/composer-2.*fast/, o(1.5, 7.5, 0.35)],
  [/composer-1-5/, o(3.5, 17.5, 0.35)],
  [/composer-1(-|$)/, o(1.25, 10, 0.125)],
  [/composer/, o(0.5, 2.5, 0.2)],                           // Composer 2 / 2.5 and newer
  [/grok-4-7.*(500k|1m).*fast|grok-4-7.*fast.*(500k|1m)/, o(6, 18, 1.5)],
  [/grok-4-7.*(500k|1m)/, o(4, 12, 1)],
  [/grok-4-5.*fast/, o(4, 18, 1)],
  [/grok.*fast/, o(4, 12, 1, { over: 256_000, input: 1.5, output: 1.5 })],
  [/grok/, o(2, 6, 0.5, { over: 256_000, input: 2, output: 2 })],  // Grok 4.5 / 4.6 / 4.7
  [/^(auto|default)$/, o(2, 6, 0.5)],  // Cursor Auto (Cost mode) bills at Cursor-model rates
  // ---- Other third-party models offered in Cursor ----
  [/gemini-4/, o(2, 10, 0.1)],
  [/gemini-3-[78]-flash/, o(0.75, 3.75, 0.075)],
  [/gemini-3-6-flash/, o(1.5, 7.5, 0.15)],
  [/gemini-3-5-flash-lite|gemini-2-5-flash/, o(0.3, 2.5, 0.03)],
  [/gemini-3-5-flash/, o(1.5, 9, 0.15)],
  [/gemini-3-flash/, o(0.5, 3, 0.05)],
  [/gemini-2-5-pro/, o(1.25, 10, 0.125)],
  [/gemini/, o(2, 12, 0.2)],                                // Gemini 3 / 3.1 Pro
  [/kimi-k3/, o(3, 15, 0.3)],
  [/kimi/, o(0.95, 4, 0.19)],
  [/glm-5-3-flash/, o(0.15, 0.5, 0.029)],
  [/glm/, o(1.4, 4.4, 0.26)],
  [/muse-spark/, o(1.25, 4.25, 0.15)],
  [/muse/, o(4, 20, 0.2)],
];
/** Unknown model: Sonnet-class list price ($3 in / $15 out), conservative for a budget fuse. */
export const FALLBACK: Price = p(3, 15);
/** Fast/priority mode on a model without its own fast entry: 2x (OpenAI Fast, Cursor Grok/GPT fast). */
const FAST = /(^|-)fast(-|$)/;

let overrides: [string, Price][] | null = null;
function loadOverrides(): [string, Price][] {
  if (overrides) return overrides;
  overrides = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(lgDir(), 'pricing.json'), 'utf8'));
    for (const [k, v] of Object.entries(raw)) overrides.push([k.toLowerCase(), { ...FALLBACK, long: undefined, ...(v as object) }]);
  } catch { /* none */ }
  return overrides;
}
export function resetPricingCache() { overrides = null; }

export function priceFor(model: string): Price {
  const raw = (model || '').toLowerCase();
  const m = canonicalModel(model);
  // User overrides: plain substring match against the raw or normalized name.
  for (const [k, v] of loadOverrides()) if (raw.includes(k) || m.includes(canonicalModel(k))) return v;
  for (const [re, v] of DEFAULT_PRICES) {
    if (!re.test(m)) continue;
    const explicitFast = /fast/.test(re.source);
    if (FAST.test(m) && !explicitFast)
      return { input: v.input * 2, output: v.output * 2, cacheRead: v.cacheRead * 2, cacheWrite: v.cacheWrite * 2, long: v.long };
    return v;
  }
  return FALLBACK;
}

export function costOf(e: UsageEvent): number {
  const pr = priceFor(e.model);
  // Long-context tiers are priced per request. Claude/Codex events are per request; Cursor events are
  // per turn (many requests summed), so the tier can't be applied to them.
  const prompt = e.inputTokens + e.cacheReadTokens + e.cacheWriteTokens;
  const lc = pr.long && e.agent !== 'cursor' && prompt > pr.long.over ? pr.long : undefined;
  const mi = lc ? lc.input : 1, mo = lc ? lc.output : 1;
  return (e.inputTokens * pr.input * mi + e.outputTokens * pr.output * mo +
    e.cacheReadTokens * pr.cacheRead * mi + e.cacheWriteTokens * pr.cacheWrite * mi) / 1e6;
}
