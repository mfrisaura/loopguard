import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { sandbox } from './helpers';
import { install, uninstall, configPath, addHooks, removeHooks } from '../src/install';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('claude: preserves user hooks + settings, idempotent, uninstall removes only ours', () => {
  sandbox();
  const f = configPath('claude');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const orig = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './mine.sh' }] }] } };
  fs.writeFileSync(f, JSON.stringify(orig));
  install('claude'); install('claude');
  const c = read(f);
  assert.equal(c.model, 'opus');
  assert.equal(c.hooks.PreToolUse.length, 2);
  assert.equal(c.hooks.Stop.length, 1);
  assert.match(c.hooks.PreToolUse[1].hooks[0].command, /loopguard\/dist\/cli\.js" hook --agent claude --event PreToolUse/);
  uninstall('claude');
  assert.deepEqual(read(f), orig);
});

test('claude: --restore returns the original bytes even after later edits', () => {
  sandbox();
  const f = configPath('claude');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{ "theme": "dark" }');
  install('claude');
  install('claude'); // re-install must not overwrite the original backup
  uninstall('claude', 'restore');
  assert.equal(fs.readFileSync(f, 'utf8'), '{ "theme": "dark" }');
});

test('codex: creates hooks.json and deletes it on uninstall when it did not exist', () => {
  const d = sandbox();
  fs.mkdirSync(path.join(d, '.codex'), { recursive: true });
  const f = install('codex');
  const c = read(f);
  assert.equal(c.hooks.PreToolUse[0].matcher, '.*');
  assert.equal(c.hooks.PreToolUse[0].hooks[0].type, 'command');
  uninstall('codex');
  assert.equal(fs.existsSync(f), false);
});

test('cursor: flat hooks format with version', () => {
  sandbox();
  const c = addHooks('cursor', { version: 1, hooks: { preToolUse: [{ command: 'other' }] } }, 'x loopguard hook --agent cursor');
  assert.equal(c.version, 1);
  assert.equal(c.hooks.preToolUse.length, 2);
  assert.equal(c.hooks.stop[0].command, 'x loopguard hook --agent cursor --event stop');
  assert.deepEqual(removeHooks('cursor', c), { version: 1, hooks: { preToolUse: [{ command: 'other' }] } });
});

test('refuses to touch invalid JSON config', () => {
  sandbox();
  const f = configPath('claude');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{ broken');
  assert.throws(() => install('claude'), /not valid JSON/);
  assert.equal(fs.readFileSync(f, 'utf8'), '{ broken');
});
