import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { sandbox, seed } from './helpers';
import { buildPayload, sync, cloudFile } from '../src/sync';
import { isPaused } from '../src/guard';

test('payload contains aggregates only (no paths, prompts or raw session ids)', async () => {
  const d = sandbox(); seed(d);
  const p = await buildPayload();
  const s = JSON.stringify(p);
  assert.ok(p.rows.length >= 3);
  assert.ok(!s.includes('/work/app') && !s.includes('sess-claude-1') && !s.includes('fix the bug'));
  assert.deepEqual(Object.keys(p.rows[0]).sort(), ['agent', 'cacheReadTokens', 'cacheWriteTokens', 'cost', 'day', 'estimated', 'events', 'inputTokens', 'model', 'outputTokens', 'session'].sort());
});

test('sync posts with bearer key and applies remote pause', async () => {
  const d = sandbox(); seed(d);
  fs.mkdirSync(path.join(d, '.loopguard'), { recursive: true });
  fs.writeFileSync(cloudFile(), JSON.stringify({ apiUrl: 'http://x.test', apiKey: 'lg_test' }));
  let seen: any;
  const fake: any = async (url: string, init: any) => { seen = { url, init };
    return { ok: true, json: async () => ({ pausedUntil: new Date(Date.now() + 60000).toISOString(), plan: 'pro' }) }; };
  const r = await sync(fake);
  assert.equal(seen.url, 'http://x.test/api/sync');
  assert.equal(seen.init.headers.authorization, 'Bearer lg_test');
  assert.equal(r.plan, 'pro');
  assert.equal(isPaused(), true);
  const fake2: any = async () => ({ ok: true, json: async () => ({ pausedUntil: null }) });
  await sync(fake2);
  assert.equal(isPaused(), false);
});

test('sync without login errors clearly', async () => {
  sandbox();
  await assert.rejects(sync(), /not logged in/);
});
