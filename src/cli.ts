#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Agent } from './types';
import { collectRows } from './usage';
import { table, group, GroupBy } from './report';
import { evaluate, normalizeInput, render, dailyCost } from './guard';
import { detectAgents, install, uninstall, configPath } from './install';
import { loadConfig, setConfig, configFile } from './config';
import { lgDir } from './paths';
import { localDay, readJson, writeJson } from './util';

const AGENTS: Agent[] = ['claude', 'codex', 'cursor'];
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (name: string) => args.includes(`--${name}`);
const agentList = (): Agent[] => {
  const a = flag('agent');
  if (!a) return [];
  const list = a.split(',') as Agent[];
  for (const x of list) if (!AGENTS.includes(x)) throw new Error(`unknown agent ${x}`);
  return list;
};

const HELP = `loopguard — budget fuse + loop killer for Claude Code, Codex CLI and Cursor

Usage:
  loopguard init [--agent claude,codex,cursor]   install hooks (backs up configs)
  loopguard uninstall [--agent ...] [--restore]  remove hooks (or restore original files)
  loopguard report [--by day|session|agent|model] [--since YYYY-MM-DD] [--agent ...] [--json]
  loopguard status                               today's spend vs caps, recent trips
  loopguard config [get | set <key> <value>]     e.g. set sessionCapUsd 20, set loop.maxRepeats 6
  loopguard pause [minutes] | resume             temporarily bypass enforcement
  loopguard hook --agent <a> [--event <e>]       (called by agents; reads hook JSON on stdin)
`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const cmd = args[0];
  switch (cmd) {
    case 'hook': {
      const agent = agentList()[0];
      if (!agent) process.exit(0);
      let raw: any = {};
      try { const s = await readStdin(); raw = s.trim() ? JSON.parse(s) : {}; } catch { /* fail-open */ }
      try {
        const inp = normalizeInput(agent, raw, flag('event'));
        const out = render(inp, await evaluate(inp));
        if (out.stdout) process.stdout.write(out.stdout);
        if (out.stderr) process.stderr.write(out.stderr);
        process.exit(out.code);
      } catch (e) {
        try { fs.appendFileSync(path.join(lgDir(), 'errors.log'), `${new Date().toISOString()} ${(e as Error).stack}\n`); } catch {}
        process.exit(0); // fail-open: never break the agent on our bugs
      }
    }
    case 'init': {
      const list = agentList().length ? agentList() : detectAgents();
      if (!list.length) { console.log('No agents detected (~/.claude, ~/.codex, ~/.cursor). Use --agent to force.'); return; }
      for (const a of list) console.log(`✔ ${a}: hooks installed in ${install(a)}`);
      const c = loadConfig();
      console.log(`Caps: session $${c.sessionCapUsd}, daily $${c.dailyCapUsd}. Loop: ${c.loop.maxRepeats} identical calls / ${c.loop.windowSec}s, spiral $${c.loop.spiralUsd}/${c.loop.spiralWindowSec}s.`);
      console.log('Restart running agent sessions for hooks to load.');
      return;
    }
    case 'uninstall': {
      const list = agentList().length ? agentList() : AGENTS;
      for (const a of list) {
        if (!fs.existsSync(configPath(a)) && !has('restore')) continue;
        console.log(`✔ ${a}: ${has('restore') ? 'restored' : 'cleaned'} ${uninstall(a, has('restore') ? 'restore' : 'remove')}`);
      }
      return;
    }
    case 'report': {
      const by = (flag('by') || 'day') as GroupBy;
      if (!['day', 'session', 'agent', 'model'].includes(by)) throw new Error(`bad --by ${by}`);
      let rows = await collectRows({ agents: agentList().length ? agentList() : undefined, noCache: has('no-cache') });
      const since = flag('since');
      if (since) rows = rows.filter(r => r.day >= since);
      if (has('json')) console.log(JSON.stringify(group(rows, by), null, 2));
      else console.log(rows.length ? table(rows, by) : 'No usage found.');
      return;
    }
    case 'status': {
      const c = loadConfig();
      const d = await dailyCost();
      const p = readJson<{ until?: number }>(path.join(lgDir(), 'pause.json'), {});
      console.log(`Today (${localDay(new Date().toISOString())}): $${d.toFixed(2)} of $${c.dailyCapUsd} daily cap; session cap $${c.sessionCapUsd}`);
      if (p.until && p.until > Date.now()) console.log(`PAUSED until ${new Date(p.until).toLocaleTimeString()}`);
      for (const a of AGENTS) {
        const f = configPath(a);
        const on = fs.existsSync(f) && /loopguard[^"]*"? hook --agent/i.test(fs.readFileSync(f, 'utf8'));
        console.log(`  ${a.padEnd(7)} ${on ? 'guarded' : 'not installed'}`);
      }
      let trips: string[] = [];
      try { trips = fs.readFileSync(path.join(lgDir(), 'trips.jsonl'), 'utf8').trim().split('\n').filter(Boolean).slice(-5); } catch {}
      if (trips.length) { console.log('Recent trips:'); for (const t of trips) { const j = JSON.parse(t); console.log(`  ${j.t} ${j.agent} ${j.kind}${j.halt ? ' (halted)' : ''} — ${j.reason}`); } }
      return;
    }
    case 'config': {
      if (args[1] === 'set') { setConfig(args[2], args[3]); console.log(`set ${args[2]} = ${args[3]}`); }
      else console.log(`${configFile()}\n${JSON.stringify(loadConfig(), null, 2)}`);
      return;
    }
    case 'pause': {
      const min = Number(args[1] || 15);
      writeJson(path.join(lgDir(), 'pause.json'), { until: Date.now() + min * 60000 });
      console.log(`Enforcement paused for ${min} min.`); return;
    }
    case 'resume': writeJson(path.join(lgDir(), 'pause.json'), {}); console.log('Enforcement resumed.'); return;
    default: console.log(HELP);
  }
}
main().catch(e => { console.error(`loopguard: ${(e as Error).message}`); process.exit(1); });
