# LoopGuard launch posts — DRAFTS, NOT POSTED (each needs Marcos's approval)

Links used: GitHub https://github.com/mfrisaura/loopguard · Dashboard https://web-production-41ec4f.up.railway.app
Pre-flight before posting: npm package published, Stripe test→live flipped, Resend domain verified, real-session smoke test on all 3 agents.

---

## Show HN

**Title:** Show HN: LoopGuard – budget caps and a loop killer for Claude Code, Codex and Cursor

**Body:**
I kept coming back to agent sessions that had burned through my quota (or real API dollars) retrying the same failing command for twenty minutes. Usage trackers like ccusage are great at telling you what you spent afterwards; I wanted something that stops the session while it's happening.

LoopGuard is a small MIT-licensed Node CLI that installs native hooks into Claude Code, Codex CLI and Cursor (all three now support pre-tool-use hooks). On every tool call it:

- computes session spend from the logs the agent already writes (no proxy, no API keys, works on subscriptions),
- checks today's spend across all three agents,
- detects loops (same tool call N times in a window) and cost spirals ($ per minute),

and denies the call / halts the session when a limit trips. `npx loopguard init` backs up your agent configs; `loopguard uninstall --restore` puts them back byte-for-byte. It fails open if LoopGuard itself breaks.

Limits I'd like feedback on: costs are list-price estimates; Cursor often doesn't store token counts so some numbers are estimated; Codex and Cursor can only block tool calls, not force-stop a session, the way Claude Code can.

There's an optional paid dashboard ($9/mo) for phone/Slack/Discord alerts and remote pause — it only receives aggregate numbers (`loopguard sync --dry-run` shows the exact payload). The CLI is fully usable without it.

Repo: https://github.com/mfrisaura/loopguard

---

## r/ClaudeAI

**Title:** I built a budget fuse for Claude Code that halts runaway sessions (also covers Codex + Cursor)

**Body:**
If you've ever come back to a /goal or long agent run that ate your whole 5-hour block looping on the same failing test — this is for that.

LoopGuard installs a PreToolUse + Stop hook in Claude Code. Each tool call it reads the session transcript, prices it, and if you've hit your session or daily cap (or the agent has called the same tool with the same input 5× in 10 minutes) it denies the call and returns `continue: false` so the session actually stops.

- `npx loopguard init` (backs up ~/.claude/settings.json; uninstall restores it)
- `loopguard config set sessionCapUsd 20`
- `loopguard report --by session` for a cross-agent cost table

Free and MIT. Not affiliated with Anthropic. Costs are API-list-price estimates — on Pro/Max they're a proxy for quota burn, not a bill. Feedback very welcome, especially on loop-detection false positives.

https://github.com/mfrisaura/loopguard

---

## r/cursor

**Title:** Open-source spend caps + loop detection for Cursor agent (via Cursor hooks)

**Body:**
Cursor's hooks (`~/.cursor/hooks.json`) let a script approve or deny each agent tool call. I built LoopGuard on top of that: it reads Cursor's local usage data, and denies tool calls when you hit a session/daily dollar cap or when the agent repeats the same call over and over.

Honest caveats: Cursor often doesn't store token counts locally, so some costs are estimated (marked with `*`), and hooks can block tool calls but can't force-end a chat. It also covers Claude Code and Codex if you use those alongside Cursor, with one daily cap across all three.

`npx loopguard init --agent cursor` · MIT · not affiliated with Anysphere.
https://github.com/mfrisaura/loopguard

---

## X (thread)

1/ ccusage tells you what you spent.
LoopGuard stops you spending it.

Open-source budget caps + runaway-loop killer for Claude Code, Codex and Cursor. One install, no proxy. 🧵

2/ It hooks into each agent's native pre-tool-use hooks. Every tool call: session $, today's $ across all agents, repeated-call + cost-spiral checks. Trip → call denied, session halted.

3/ Local-first: reads the logs your agents already write. `npx loopguard init`, `loopguard report`. Uninstall restores your configs byte-for-byte.

4/ Optional $9/mo dashboard: Slack/Discord/email alert the moment something trips + pause from your phone. Only aggregate numbers leave your machine.

5/ MIT, feedback welcome → https://github.com/mfrisaura/loopguard

**Reply template** (for "hit my Claude limit" / "agent loop" posts — each reply individually approved):
"Built an open-source thing for exactly this — caps + loop detection via Claude Code/Codex/Cursor hooks: https://github.com/mfrisaura/loopguard (free, MIT)"
