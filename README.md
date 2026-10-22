# LoopGuard

Budget fuse + runaway-loop killer for **Claude Code**, **Codex CLI** and **Cursor**.
`ccusage` tells you what you spent. LoopGuard stops you spending it.

- Reads the usage logs your agents already write (no proxy, no API keys, works on subscriptions).
- Installs native hooks into each agent; on every tool call it checks session spend, today's spend across
  all agents, and loop heuristics, and **denies the call / halts the session** when a limit trips.
- Fails open: if LoopGuard itself errors, your agent keeps working (error logged to `~/.loopguard/errors.log`).

## Install
```bash
npm i -g loopguard-cli     # installs the `loopguard` command
loopguard init             # auto-detects ~/.claude, ~/.codex, ~/.cursor; backs up configs
loopguard report --by agent
```
Try it without installing: `npx loopguard-cli report` (any command works the same way: `npx loopguard-cli <command>`).

Hooks call the global `loopguard` binary when it's on PATH and points at this install; otherwise `node /abs/path/dist/cli.js`. Never pinned to temporary `npx` caches: if you run `npx loopguard-cli init` without a global install, hooks call `npx -y loopguard-cli@<version>` (works, but slower — install globally for ~0.1 s hooks).

Dashboard, sync API, Stripe billing and landing page live in [`web/`](web/README.md).

## Develop from source
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
| `init [--agent claude,codex,cursor]` | Adds `PreToolUse`, `PostToolUse`, `PostToolUseFailure` and `Stop` hooks (Codex: `PreToolUse`, `PostToolUse`, `Stop`; Cursor: `preToolUse`, `postToolUse`, `postToolUseFailure`, `stop`). Re-run after upgrading to pick up new hooks. Original file backed up once to `~/.loopguard/backups/`. Idempotent. Refuses to edit invalid JSON. |
| `--version` | Prints the installed version. |
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
| `loop.maxRepeats` / `windowSec` | 5 / 600 | Same tool call N× in window with no progress in between → deny; 3rd consecutive deny → halt |
| `loop.progressAware` | true | A repeat doesn't count if the git working tree or the tool's output changed since the last identical call (see below) |
| `loop.normalizeShell` | true | Shell commands match after stripping cosmetic wrappers (`bash -c '…'`, `\| tail -50`, `2>&1`, `npm run test` = `npm test`) |
| `loop.spiralUsd` / `spiralWindowSec` | 10 / 300 | Session spend rises ≥ $X within window → deny + halt |
| `warnAtPct` | 80 | Claude Code shows a warning message near a cap |

Trips are logged to `~/.loopguard/trips.jsonl`.

## Loop detection
A call is "the same" when the tool and its input match. For shell tools (Claude Code/Codex `Bash`, Cursor `Shell`) only
the command (and Cursor's `working_directory`) counts, after a narrow normalization: whitespace, a `bash -c`/`sh -lc`
wrapper, a leading `cd <current dir> &&` or `timeout N`, trailing `2>&1`, `| tail …`, `| head …` or `| cat`, and
`npm run test`/`npm t` → `npm test` (also `pnpm run test`, `yarn run test`). Claude's Bash `description` is ignored.
Different tools are never merged (`npx jest` and `npm test` stay different).

With `loop.progressAware` on, a repeat only counts if nothing changed since the previous identical call:
- **Files:** on every `PreToolUse`, LoopGuard fingerprints the git working tree of the hook's `cwd`: `git status`
  (tracked changes and untracked files) plus a hash of each changed file's contents. It runs with `GIT_OPTIONAL_LOCKS=0`
  (never takes the index lock) and a 1.5 s timeout, adding about 10 ms in a typical repo. If an edit happened between
  two identical calls, the count starts over. `.loopguard/` (where the block message suggests a checkpoint note) is
  ignored. Not a git repo, or git fails/times out → no file signal; repeats count as before.
- **Output:** the post-tool hooks store a hash of the tool's result after stripping ANSI codes, timestamps, clock
  times, durations, temp paths, hex ids and pids (other numbers are kept, so `3 failed` → `2 failed` is progress).
  If the last two identical calls produced different output, the count starts over. What each agent sends:

| Agent | Working dir (files signal) | Output signal |
|---|---|---|
| Claude Code | `cwd` on every hook | `PostToolUse` `tool_response`; failed calls via `PostToolUseFailure` `error`. Installed with `async: true`, so they add no latency. |
| Codex CLI | `cwd` on every hook | `PostToolUse` `tool_response` (fires for failing Bash commands too). Runs synchronously (~0.1 s per tool call). |
| Cursor | `cwd`, else `tool_input.working_directory`, else `workspace_roots[0]` | `postToolUse` `tool_output` (JSON string), `postToolUseFailure` `error_message`. Synchronous. HTTP MCP tools send a redacted output, so only the files signal applies to them. |

The block message tells the agent why it tripped and what to do: stop rerunning it (including through a different
command), write down the goal, what was tried, the exact failing output and its hypotheses (in its reply or in
`.loopguard/checkpoint.md`), then find the root cause before running it again. The 3rd consecutive loop block still halts.

Limits: output that changes on every run for reasons the normalizer doesn't strip (random seeds, shuffled test order)
reads as progress, so that loop isn't caught; a polling command whose output never changes is caught as before.
Normalization doesn't see through scripts, aliases, or a different test runner invoked for the same tests.

## How each agent is enforced
| Agent | Data read | Block | Halt |
|---|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` (dedup by message id + request id); session spend from hook's `transcript_path` plus its `subagents/agent-*.jsonl` | `hookSpecificOutput.permissionDecision: "deny"` | `{"continue": false, "stopReason": …}` |
| Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl`, `token_count.last_token_usage` per turn, cached input split out, rate-limit re-emits skipped | exit code 2 + reason on stderr | Repeated denies (Codex hooks have no session-halt field) |
| Cursor | Token counts Cursor sends to the `stop` hook at the end of each turn (logged to `~/.loopguard/cursor-usage.jsonl`), plus `state.vscdb` → `cursorDiskKV` `bubbleId:*` rows (`tokenCount`; chars/4 estimate when absent). Per chat, the larger of the two is used. | `{"permission":"deny", …}` | Repeated denies |

Notes from testing against the real CLIs (Claude Code 2.1.302, Codex 0.163, Cursor CLI 2026.10.19):
- **Codex asks you to trust new hooks.** After `loopguard init`, open `codex`, run `/hooks` and trust the three LoopGuard
  hooks. Until you do, Codex skips them without saying anything in `codex exec`.
- **Claude Code halts on `continue: false` in recent versions** (verified on 2.1.302). Older builds (for example 2.1.197,
  which npm still installs on Node 20) honor the deny but keep the session going.
- **Cursor was tested live** with `cursor-agent` 2026.10.19 (Composer 2.5, interactive mode, 2026-10-20): Cursor ran the
  hooks from `~/.cursor/hooks.json`, the `stop` hook reported each turn's tokens, LoopGuard's session total matched the
  per-turn token counts, and with `sessionCapUsd` at $0.05 the first tool call after the turn that crossed it was
  rejected ("session spend $0.06 reached cap $0.05"); the model then stopped and reported the cap. The hook's
  `conversation_id` equals Cursor's `session_id`/chat id, which is the session key LoopGuard uses.
  `scripts/cursor-hooks-e2e.js` also exercises Cursor's hook runner offline (no model calls).
- **Headless `cursor-agent -p` runs are not cost-capped.** In print mode Cursor fires `sessionStart`, `preToolUse`,
  `postToolUse` and `sessionEnd`, but not `stop` or `afterAgentResponse`, and no hook payload or local file carries token
  counts. Loop detection still blocks repeated calls there; session and daily caps only see interactive CLI and editor
  turns. Use Cursor's own spend limit for scripted runs.
- **Cursor spend updates once per turn.** Cursor reports token usage to the `stop` hook when a turn ends, so a cap is
  enforced from the next tool call after the turn that crossed it. The `cursor-agent` CLI keeps chats in
  `~/.cursor/chats/` rather than `state.vscdb`, so for the CLI the `stop` hook is the only cost source. Loop
  detection doesn't depend on cost data. Spend inside Cursor subagents (Task tool) isn't reported to hooks.
- **Cursor also runs Claude Code hooks** from `~/.claude/settings.json` ("third-party hooks"). When LoopGuard is set
  up for both, the Claude hook stands down inside Cursor so you get one deny, not two; with only the Claude hook
  installed, it enforces for Cursor.
- **Cursor cloud agents** only load project hooks (`.cursor/hooks.json` in the repo), so `loopguard init`'s user-level
  hooks don't cover them.

Pricing: built-in API list-price table per 1M tokens (`src/pricing.ts`, checked against Anthropic, OpenAI and Cursor's
pricing pages on 2026-10-20): Claude (Opus 4 → 5.5, Sonnet 4 → 5.5, Haiku, Fable/Mythos), OpenAI/Codex (gpt-4.1 → gpt-6.1-sol,
`*-codex*`, o-series), Cursor's Composer and Grok models, Auto, and the Gemini/Kimi/GLM/Muse models Cursor offers. Model
names are normalized first, so `claude-4.5-sonnet` (Cursor) and `claude-sonnet-4-5-20250929` (Claude Code) price the same.
Fast/priority variants without their own row cost 2x; long-context tiers (OpenAI >272k, Haiku 5.5 >100k) apply per
request. Unknown models fall back to their family, then to $3 in / $15 out. Override with `~/.loopguard/pricing.json`
(substring match), e.g. `{"my-model": {"input": 2, "output": 8, "cacheRead": 0.2, "cacheWrite": 0}}`. Costs are
**estimates**; subscription plans (Claude Max, ChatGPT, Cursor) are not billed per token, and Teams/Enterprise surcharges
are not included.

## Tests
`npm test` → 44 tests: parsers against fixture logs (`test/fixtures/`), pricing, install/uninstall/restore for all three
agents, caps, loop + spiral detection, pause, the Cursor usage ledger, and end-to-end hook calls through the compiled CLI
(build first). With `cursor-agent` installed, `node scripts/cursor-hooks-e2e.js` runs LoopGuard's hooks through
Cursor's own hook runner in a throwaway HOME (no login needed).

Env overrides (used by tests): `LOOPGUARD_USER_HOME`, `LOOPGUARD_DIR`, `LOOPGUARD_CURSOR_DB`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `LOOPGUARD_BIN`.

License: MIT (see LICENSE).
