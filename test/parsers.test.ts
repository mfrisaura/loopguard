import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { FIX, close, sandbox, seed } from './helpers';
import { parseClaudeFile } from '../src/parsers/claude';
import { parseCodexFile } from '../src/parsers/codex';
import { parseCursorDb } from '../src/parsers/cursor';
import { aggregate, collectRows, sum } from '../src/usage';
import { costOf, priceFor } from '../src/pricing';

test('claude: dedupes streamed chunks, skips garbage, prices per model', () => {
  sandbox();
  const ev = parseClaudeFile(path.join(FIX, 'claude-session.jsonl'));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].sessionId, 'sess-claude-1');
  assert.equal(ev[0].cacheReadTokens, 10000);
  assert.ok(close(costOf(ev[0]), 0.021));
  assert.ok(close(costOf(ev[1]), 0.105)); // opus 4.1 list price
  assert.ok(close(sum(aggregate(ev)), 0.126));
});

test('codex: uses last_token_usage, splits cached, skips rate-limit re-emits, tracks model switches', () => {
  sandbox();
  const ev = parseCodexFile(path.join(FIX, 'codex-rollout.jsonl'));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].model, 'gpt-5-codex');
  assert.equal(ev[0].inputTokens, 4000);
  assert.equal(ev[0].cacheReadTokens, 8000);
  assert.equal(ev[1].model, 'gpt-5-mini');
  assert.equal(ev[0].sessionId, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
  assert.ok(close(sum(aggregate(ev)), 0.016 + 0.00675));
});

test('cursor: reads bubble tokenCount, estimates chars/4 when missing', async () => {
  sandbox();
  const ev = await parseCursorDb(path.join(FIX, 'state.vscdb'));
  assert.equal(ev.length, 2);
  const exact = ev.find(e => !e.estimated)!, est = ev.find(e => e.estimated)!;
  assert.equal(exact.sessionId, 'comp-1');
  assert.equal(exact.model, 'claude-sonnet-4-5');
  assert.ok(close(costOf(exact), 0.024));
  assert.equal(est.outputTokens, 1000);
});

test('missing data dirs/files are fine', async () => {
  sandbox();
  assert.deepEqual(await collectRows(), []);
  assert.deepEqual(await parseCursorDb('/nonexistent/x.vscdb'), []);
});

test('collectRows: all agents + incremental cache gives same result', async () => {
  const d = sandbox(); seed(d);
  const a = await collectRows();
  const b = await collectRows();
  assert.equal(new Set(a.map(r => r.agent)).size, 3);
  assert.ok(close(sum(a), 0.126 + 0.02275 + 0.039));
  assert.ok(close(sum(a), sum(b)));
});

test('pricing: opus 4.5+ cheaper tier, unknown falls back', () => {
  assert.equal(priceFor('claude-opus-4-5-20251101').input, 5);
  assert.equal(priceFor('claude-opus-4-20250514').input, 15);
  assert.equal(priceFor('mystery-model').input, 3);
});
