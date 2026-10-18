# LoopGuard (v0.1.0, pre-release)

Budget fuse + runaway-loop killer for **Claude Code**, **Codex CLI** and **Cursor**.
`ccusage` tells you what you spent. LoopGuard stops you spending it.

- Reads the usage logs your agents already write (no proxy, no API keys, works on subscriptions).
- Installs native hooks into each agent; on every tool call it checks session spend, today's spend across
  all agents, and loop heuristics, and **denies the call / halts the session** when a limit trips.
- Fails open: if LoopGuard itself errors, your agent keeps working (error logged to `~/.loopguard/errors.log`).

Hooks call the global `loopguard` binary when it's on PATH and points at this install (e.g. `npm i -g loopguard`); otherwise `node /abs/path/dist/cli.js`. Never pinned to temporary `npx` caches.

Dashboard, sync API, Stripe billing and landing page live in [`web/`](web/README.md).

## Install (local dev)
```bash
npm install && npm run build
node dist/cli.js init            # auto-detects ~/.claude, ~/.codex, ~/.cursor; backs up configs
node dist/cli.js report --by day # or --by session|agent|model, --since 2026-10-01, --json
node dist/cli.js status
node dist/cli.js uninstall       # removes only LoopGuard entries; --restore puts original files back
```

## Commands
| Command | What it does |
|---|---|
| `init [--agent claude,codex,cursor]` | Adds `PreToolUse`+`Stop` hooks (Cursor: `preToolUse`+`stop`). Original file backed up once to `~/.loopguard/backups/`. Idempotent. Refuses to edit invalid JSON. |
| `uninstall [--agent …] [--restore]` | Strips LoopGuard hooks (keeps your other hooks/settings) or restores the original file byte-for-byte. Deletes files LoopGuard created. |
| `report` | Cross-agent token + estimated $ table. Incremental index in `~/.loopguard/index.json`. |
| `status` | Today's spend vs caps, which agents are guarded, last 5 trips. |
| `config` / `config set <key> <value>` | e.g. `sessionCapUsd 20`, `dailyCapUsd 60`, `loop.maxRepeats 6`, `loop.enabled false`. |
| `pause [min]` / `resume` | Temporarily bypass enforcement (default 15 min). |
| `login --key lg_… --url <dashboard>` | Save dashboard API key (default https://tryloopguard.com) (`~/.loopguard/cloud.json`, mode 600). |
| `sync [--dry-run]` | Upload aggregate usage + trips (Pro); applies remote pause. `--dry-run` prints exactly what would be sent. |
| `hook --agent <a> --event <e>` | Called by the agents (JSON on stdin). ~0.1 s per call. |

## Rules (defaults, `~/.loopguard/config.json`)
| Rule | Default | Effect |
|---|---|---|
| `sessionCapUsd` | 25 | Session spend ≥ cap → deny + halt |
| `dailyCapUsd` | 100 | Today's spend across all agents (local day) ≥ cap → deny + halt |
| `loop.maxRepeats` / `windowSec` | 5 / 600 | Identical tool call (name+input) N× in window → deny; 3rd consecutive deny → halt |
| `loop.spiralUsd` / `spiralWindowSec` | 10 / 300 | Session spend rises ≥ $X within window → deny + halt |
| `warnAtPct` | 80 | Claude Code shows a warning message near a cap |

Trips are logged to `~/.loopguard/trips.jsonl`.

## How each agent is enforced
| Agent | Data read | Block | Halt |
|---|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` (dedup by message id + request id); session spend from hook's `transcript_path` | `hookSpecificOutput.permissionDecision: "deny"` | `{"continue": false, "stopReason": …}` |
| Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl`, `token_count.last_token_usage` per turn, cached input split out, rate-limit re-emits skipped | exit code 2 + reason on stderr | Repeated denies (no documented halt field used yet) |
| Cursor | `state.vscdb` → `cursorDiskKV` `bubbleId:*` rows (`tokenCount`; chars/4 estimate when absent) | `{"permission":"deny", …}` | Repeated denies |

Pricing: built-in list-price table per 1M tokens (`src/pricing.ts`); override with `~/.loopguard/pricing.json`,
e.g. `{"my-model": {"input": 2, "output": 8, "cacheRead": 0.2, "cacheWrite": 0}}`. Costs are **estimates**;
subscription plans (Claude Max, ChatGPT, Cursor Pro) are not billed per token.

## Tests
`npm test` → 24 tests: parsers against fixture logs (`test/fixtures/`), pricing, install/uninstall/restore for all three
agents, caps, loop + spiral detection, pause, and end-to-end hook calls through the compiled CLI.

Env overrides (used by tests): `LOOPGUARD_USER_HOME`, `LOOPGUARD_DIR`, `LOOPGUARD_CURSOR_DB`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `LOOPGUARD_BIN`.

License: MIT (see LICENSE).
