import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { close, sandbox } from './helpers';
import { canonicalModel, costOf, priceFor, resetPricingCache, FALLBACK } from '../src/pricing';
import { UsageEvent } from '../src/types';

const ev = (agent: UsageEvent['agent'], model: string, t: Partial<UsageEvent> = {}): UsageEvent => ({
  agent, sessionId: 's', timestamp: '2026-10-20T12:00:00Z', model,
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...t });
const io = (m: string) => { const p = priceFor(m); return [p.input, p.output, p.cacheRead]; };

test('pricing: model name spellings normalize to one canonical form', () => {
  assert.equal(canonicalModel('claude-4.5-sonnet'), 'claude-sonnet-4-5');
  assert.equal(canonicalModel('claude-3-5-haiku-20241022'), 'claude-haiku-3-5-20241022');
  assert.equal(canonicalModel('GPT-5.4-mini'), 'gpt-5-4-mini');
  assert.equal(canonicalModel('claude-opus-4-7-thinking-max'), 'claude-opus-4-7-thinking-max');
});

test('pricing: Anthropic list prices (Oct 2026)', () => {
  assert.deepEqual(io('claude-opus-4-20250514'), [15, 75, 1.5]);
  assert.deepEqual(io('claude-opus-4-1-20250805'), [15, 75, 1.5]);
  assert.deepEqual(io('claude-opus-4-5-20251101'), [5, 25, 0.5]);
  assert.deepEqual(io('claude-opus-4-8'), [5, 25, 0.5]);
  assert.deepEqual(io('claude-opus-5'), [5, 25, 0.5]);
  assert.deepEqual(io('claude-opus-5-5'), [4, 20, 0.2]);
  assert.deepEqual(io('claude-sonnet-4-5-20250929'), [3, 15, 0.3]);
  assert.deepEqual(io('claude-sonnet-4-6'), [3, 15, 0.3]);
  assert.deepEqual(io('claude-sonnet-5'), [2, 10, 0.2]);
  assert.deepEqual(io('claude-sonnet-5-5'), [2, 10, 0.1]);
  assert.deepEqual(io('claude-haiku-4-5'), [1, 5, 0.1]);
  assert.deepEqual(io('claude-haiku-5-5'), [0.1, 0.5, 0.01]);
  assert.deepEqual(io('claude-fable-5'), [10, 50, 1]);
  assert.deepEqual(io('claude-fable-5-1'), [10, 50, 0.25]);
  assert.equal(priceFor('claude-opus-5-5').cacheWrite, 5);
  // Cursor's spellings of the same models
  assert.deepEqual(io('claude-4.5-sonnet'), [3, 15, 0.3]);
  assert.deepEqual(io('claude-4-opus'), [15, 75, 1.5]);
  assert.deepEqual(io('claude-opus-4-7-thinking-max'), [5, 25, 0.5]);
  assert.deepEqual(io('claude-opus-5-5-fast'), [8, 40, 0.4]);
});

test('pricing: OpenAI / Codex list prices incl. gpt-5.4 and newer', () => {
  assert.deepEqual(io('gpt-5-codex'), [1.25, 10, 0.125]);
  assert.deepEqual(io('gpt-5.1-codex-max'), [1.25, 10, 0.125]);
  assert.deepEqual(io('gpt-5.1-codex-mini'), [0.25, 2, 0.025]);
  assert.deepEqual(io('gpt-5.2-codex'), [1.75, 14, 0.175]);
  assert.deepEqual(io('gpt-5.3-codex'), [1.75, 14, 0.175]);
  assert.deepEqual(io('gpt-5.4'), [2.5, 15, 0.25]);
  assert.deepEqual(io('gpt-5.4-mini'), [0.75, 4.5, 0.075]);
  assert.deepEqual(io('gpt-5.4-nano'), [0.2, 1.25, 0.02]);
  assert.deepEqual(io('gpt-5.5'), [5, 30, 0.5]);
  assert.deepEqual(io('gpt-5.6-sol'), [4, 20, 0.4]);
  assert.deepEqual(io('gpt-5.6-terra'), [2, 12, 0.2]);
  assert.deepEqual(io('gpt-5.6-luna'), [0.2, 1.2, 0.02]);
  assert.deepEqual(io('gpt-6-astra'), [10, 50, 1]);
  assert.deepEqual(io('gpt-6.1-sol'), [2, 10, 0.1]);
  assert.deepEqual(io('gpt-6-sol'), [2, 10, 0.2]);
  assert.deepEqual(io('gpt-6-luna'), [0.1, 0.5, 0.01]);
  assert.deepEqual(io('gpt-5-mini'), [0.25, 2, 0.025]);
  assert.deepEqual(io('o3'), [2, 8, 0.5]);
  assert.deepEqual(io('o4-mini'), [1.1, 4.4, 0.275]);
  assert.equal(priceFor('gpt-5.4').cacheWrite, 0);
  assert.equal(priceFor('gpt-6.1-sol').cacheWrite, 2.5);
  // unknown future variants fall back to their family, not to the generic fallback
  assert.deepEqual(io('gpt-6.2-sol'), [2, 10, 0.2]);
});

test('pricing: Cursor models, fast mode, unknown fallback', () => {
  assert.deepEqual(io('composer-2.5'), [0.5, 2.5, 0.2]);
  assert.deepEqual(io('composer-2.5-fast'), [3, 15, 0.5]);
  assert.deepEqual(io('composer-2-fast'), [1.5, 7.5, 0.35]);
  assert.deepEqual(io('composer-1.5'), [3.5, 17.5, 0.35]);
  assert.deepEqual(io('composer-1'), [1.25, 10, 0.125]);
  assert.deepEqual(io('grok-4.7'), [2, 6, 0.5]);
  assert.deepEqual(io('grok-4.7-fast'), [4, 12, 1]);
  assert.deepEqual(io('gemini-3.1-pro'), [2, 12, 0.2]);
  assert.deepEqual(io('auto'), [2, 6, 0.5]);
  assert.deepEqual(io('gpt-5.4-fast'), [5, 30, 0.5]);        // generic Fast = 2x
  assert.deepEqual(io('gpt-5-fast'), [2.5, 20, 0.25]);       // matches Cursor's GPT-5 Fast row
  assert.equal(priceFor('mystery-model'), FALLBACK);
  assert.equal(priceFor('cursor-default'), FALLBACK);
  assert.equal(priceFor(''), FALLBACK);
});

test('pricing: long-context tiers apply per request (Claude/Codex), not to per-turn Cursor totals', () => {
  // gpt-5.4 over 272k prompt tokens: 2x input, 1.5x output
  const big = { inputTokens: 300_000, outputTokens: 10_000 };
  assert.ok(close(costOf(ev('codex', 'gpt-5.4', big)), (300_000 * 5 + 10_000 * 22.5) / 1e6));
  assert.ok(close(costOf(ev('codex', 'gpt-5.4', { inputTokens: 100_000, outputTokens: 10_000 })), (100_000 * 2.5 + 10_000 * 15) / 1e6));
  // Haiku 5.5: prompts over 100k (cache reads included) bill at 5x
  const h = { inputTokens: 1_000, cacheReadTokens: 150_000, outputTokens: 1_000 };
  assert.ok(close(costOf(ev('claude', 'claude-haiku-5-5', h)), (1_000 * 0.5 + 150_000 * 0.05 + 1_000 * 2.5) / 1e6));
  // Cursor turn totals sum many requests: no tier
  assert.ok(close(costOf(ev('cursor', 'gpt-5.4', big)), (300_000 * 2.5 + 10_000 * 15) / 1e6));
});

test('pricing: ~/.loopguard/pricing.json overrides still win', () => {
  const d = sandbox();
  fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true });
  fs.writeFileSync(path.join(d, '.loopguard/pricing.json'), JSON.stringify({ 'gpt-5.4': { input: 1, output: 2 }, 'my-model': { input: 7 } }));
  resetPricingCache();
  try {
    assert.equal(priceFor('gpt-5.4').input, 1);
    assert.equal(priceFor('gpt-5.4').output, 2);
    assert.equal(priceFor('my-model-v2').input, 7);
    assert.equal(priceFor('my-model-v2').output, FALLBACK.output);
    assert.equal(priceFor('gpt-5.4').long, undefined);
  } finally { fs.rmSync(path.join(d, '.loopguard/pricing.json')); resetPricingCache(); }
});
