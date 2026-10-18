# LoopGuard — Product Spec & MVP Plan (draft, 2026-10-16)

## 1. One-liner
One install that puts a budget fuse and runaway-loop kill switch on Claude Code, Codex CLI and Cursor at the same time, and pings your phone when something trips.

## 2. How each agent exposes data (researched)
| Agent | Usage data (read) | Enforcement point (act) |
|---|---|---|
| Claude Code | JSONL transcripts `~/.claude/projects/**/*.jsonl` (also `$CLAUDE_CONFIG_DIR/projects`), with exact tokens + cache reads/writes | Hooks in `~/.claude/settings.json` / `.claude/settings(.local).json`: `PreToolUse` can block, `Stop` returns `continue:false` to halt, `PostToolBatch` stops loop before next model call. Stop-hook block cap = 8 by default (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Source: code.claude.com/docs/en/hooks, anthropics/claude-code#85547 |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (`$CODEX_HOME`); `event_msg` → `token_count`; use `last_token_usage` (per turn), NOT `total_token_usage` (cumulative); model comes from preceding `turn_context`/`session_meta`; `input_tokens` includes cached. Rate-limit info in session metadata. Sources: openai/codex rollout.rs, issue #22354, docs.rs/burnwall |
| Codex hooks | — | `~/.codex/hooks.json` or `[hooks]` in `config.toml` (project `.codex/` too): PreToolUse (exit 2 / `permissionDecision:"deny"`), PostToolUse, Stop, SessionStart/End, Subagent*, Interrupt. Source: learn.chatgpt.com/docs/hooks, openai/codex PR #18893 |
| Cursor | `state.vscdb` (SQLite) in workspace storage; tokens when present, else chars/4 estimate; `~/.cursor/projects` transcripts; Cursor Admin API for team billing rows | Native hooks `~/.cursor/hooks.json` / `.cursor/hooks.json`: `preToolUse`, `postToolUse`, `stop`, `beforeSubmitPrompt`, etc.; also loads Claude Code hook configs. Source: cursor.com/docs/reference/third-party-hooks |
| Pricing | LiteLLM / OpenRouter model price tables (24h cache) — same approach TokenMonitor uses |

Key insight: all three agents now have command hooks with a pre-tool "deny" and a stop event, so ONE local enforcement engine can serve all three with no proxy and no API keys (works on subscriptions, incl. Codex ChatGPT-login, which proxies like Burnwall can't route).

## 3. Competitors
| Tool | What | Gap LoopGuard exploits |
|---|---|---|
| ccusage (MIT, ~16–19k stars) | De-facto CLI cost reports, ~15–18 agents | Reporting only; re-parses every run; no enforcement |
| CodeBurn (MIT) | Cost by tool/project/branch/PR, 37 tools | Reporting/optimization, no kill switch |
| agentsview (MIT) | Indexed session search + cost dashboard, Cursor Admin API | Reporting |
| Tokscale, OpenUsage, TokenMonitor, Token Use (MIT) | TUI / tray / menu-bar usage + quota gauges | Passive monitoring |
| codex-usage-tracker | Codex-only SQLite + MCP | Single agent |
| **burnstop** (phuryn) | Claude Code Stop-hook budget fuse, $50 auto-cap on /goal, loop detection | **Claude Code only**; closest competitor |
| **Burnwall** (intbot) | Local proxy: daily budget, loop detection, security checks | Proxy; can't protect Codex ChatGPT-login or Cursor subscription; setup friction |
| PointFive, TokenShift | Enterprise/team spend platforms with caps | Enterprise sales, expensive; not for indie devs/small teams |
| Vendor native (`/usage`, Anthropic Analytics API) | After-the-fact, single vendor | Won't stop anything |

Honest read: reporting is commoditized and free (MIT). We should NOT compete on reports. Wedge = **cross-agent enforcement + away-from-keyboard alerts + small-team budgets**, built to read the same files the others do.

## 4. Positioning
"ccusage tells you what you spent. LoopGuard stops you spending it." — budget fuses + loop killer for Claude Code, Codex and Cursor, one install, no proxy, works on subscriptions, alerts to phone/Slack/Discord.

## 5. MVP features
Free / OSS CLI (npm package `loopguard-cli`, command `loopguard`: `npm i -g loopguard-cli` or `npx loopguard-cli`):
- `loopguard init` — detects installed agents, writes hook entries to the agents' config files (backup + `loopguard uninstall` restore).
- Hook handler (fast Node script, <50 ms): on PreToolUse/Stop computes session spend from local logs (incremental SQLite index), applies rules, returns deny/halt.
- Rules: per-session $/token cap, daily cap, per-goal auto-cap, loop detection (same tool+args N times in window; cost spiral $/min; no file diff over N turns), quota % warnings (5-hour block).
- `loopguard status` / `report` — compact cross-agent spend table (basic, enough to not need ccusage).
- Local event log of every trip with reason.
Pro (paid, license key):
- Push alerts when trips/thresholds hit: email, Slack/Discord webhook, ntfy/Pushover phone push; "approve continue" link.
- Hosted dashboard (opt-in sync of derived metadata only, never prompts/code): history, trips, per-project/per-repo spend.
- Remote kill/pause from phone.
Team (paid):
- Shared budgets per dev/team, policy pushed to members' machines, weekly digest, Cursor Admin API import.

## 6. Pricing & licensing
- Open-core. CLI + local enforcement MIT (needed to compete with all-MIT field and earn trust for a tool that edits agent configs).
- Pro $9/mo or $79/yr per dev (alerts, dashboard, remote kill).
- Team $19/dev/mo (min 3), budgets/policies/digests.
- 14-day Pro trial, no card. Stripe Checkout + Customer Portal; license key validated by dashboard API, cached offline 7 days (enforcement never depends on network — fail-open for alerts, fail-closed for local caps).

## 7. Tech stack
- CLI: TypeScript, Node 20+, published to npm; `better-sqlite3` (or `node:sqlite`) for local index; chokidar file watching for optional daemon (`loopguard watch`); pricing from LiteLLM JSON cached.
- Dashboard/API: Next.js (App Router) + Prisma + Postgres on Railway; Stripe (Checkout, webhooks, portal); Auth via email magic link (Resend/Postmark); ingestion endpoint for metadata events.
- Notifications: Slack/Discord webhooks, ntfy, email.
- Repo: GitHub monorepo (`packages/cli`, `apps/web`), GitHub Actions CI + npm provenance publish.
- Telemetry: opt-in only.

## 8. Distribution (no paid ads)
- Launch posts: Show HN, r/ClaudeAI, r/ChatGPTCoding, r/cursor, X (reply to "hit my limit"/"agent loop" posts like the ones found in research), dev.to write-up.
- "Awesome Claude Code / awesome hooks" lists, Claude Code plugin marketplace + Cursor/Codex hook listings.
- SEO pages: "how to stop Claude Code runaway loop", "Codex token usage location", "Cursor hooks budget" — real docs, not pSEO spam.
- README comparison table vs ccusage/burnstop/Burnwall; integration that can import ccusage JSON.
- Buffer-scheduled weekly "agent spend tips" posts (each first post needs owner OK).

## 9. Two-week build milestones
Week 1
- D1: repo scaffold, parsers for Claude Code + Codex JSONL with fixtures; pricing loader.
- D2: Cursor `state.vscdb` parser; incremental SQLite index; `report`.
- D3: hook handler + rules engine (session/daily caps, loop detection); Claude Code hook install/uninstall.
- D4: Codex hooks.json/config.toml + Cursor hooks.json install; cross-agent e2e tests on box.
- D5: `status`, trip log, README, MIT license; private npm dry-run (no publish).
Week 2
- D6–7: Next.js dashboard on Railway (staging), auth, ingestion API, license keys.
- D8: Stripe products/prices (test mode), Checkout, webhooks, portal.
- D9: alerts (Slack/Discord/ntfy/email), remote pause.
- D10: landing page + docs, comparison page, pricing page.
- D11–12: beta with Marcos's own agents (dogfood on box), fix bugs.
- D13–14: launch prep — posts drafted for approval, npm publish + prod deploy pending approval.

## 10. Owner approvals needed
1. Domain (purchase). RDAP check 2026-10-16: loopguard.com, loopguard.dev, loopguard.ai, loopguard.app, getloopguard.com = REGISTERED. tryloopguard.com, loopguard.io, loopguard.sh returned no RDAP record (likely available; .io/.sh RDAP coverage unreliable — confirm at registrar). Alternatives to check: loopguard.run, useloopguard.com.
2. Name collision: GitHub user/org `loopguard` exists (taken); `loopguard-dev` free. npm: `loopguard`, `loopguard-cli`, `tokentripwire` unclaimed; `agentfuse` taken. Scope `@loopguard` appears unregistered (npm org creation needs approval). Consider trademark search before committing to the name.
3. Stripe: which account (main vs pick5ai) or a new account/entity; product + price creation in live mode.
4. GitHub org creation (`loopguard-dev`) and making repo public.
5. npm account/org + first publish.
6. Railway project + production deploy; email provider signup (Resend/Postmark).
7. All public posts (HN, Reddit, X, Buffer) and any outreach replies.
8. Spend: est. $15–60 domain/yr + ~$10–30/mo infra.
