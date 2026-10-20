# Changelog

## 0.1.2 (unreleased, not yet on npm)

Cursor, checked against Cursor's own hook runner (`cursor-agent` 2026.10.19) and Cursor 3.25.9's source:
- **Cursor session and daily caps now see real token counts.** Cursor sends each turn's tokens to the `stop` hook;
  LoopGuard records them in `~/.loopguard/cursor-usage.jsonl` (cache reads/writes split out of `input_tokens`), prices
  them, and uses them for caps and `report`. Per chat, the larger of this and the `state.vscdb` estimate is used, so
  nothing is counted twice. Before, the `cursor-agent` CLI (which never writes `state.vscdb`) always read as $0.
- **No more duplicate denies inside Cursor.** Cursor also runs Claude Code hooks from `~/.claude/settings.json`. With
  LoopGuard installed for both, the Claude hook now stands down for Cursor payloads (one deny message and one trip
  instead of two). With only the Claude hook installed, it enforces for Cursor, in Cursor's reply format.
- Cursor `stop` hook replies with `{}` instead of empty output, which Cursor logged as a failed hook (`empty_stdout`).
  The fail-open path also answers Cursor with valid JSON.
- Cursor sessions are keyed by `conversation_id` (the composerId used in `state.vscdb`) even if `session_id` differs.
- A deny on a hook event that can't block anything (Cursor/Codex `stop`) is no longer logged as a trip.

Pricing (checked against Anthropic, OpenAI and Cursor pricing pages on 2026-10-20):
- Added Claude Opus 4.8 / 5 / 5.5 (+ fast mode), Sonnet 4.6 / 5 / 5.5, Haiku 5.5 (>100k-token prompt tier), Fable and
  Mythos 5 / 5.1, Cursor's Claude 4 Sonnet 1M ($6/$22.50), and correct per-model cache-read rates.
- Added OpenAI gpt-5.1 / 5.2 / 5.3-codex / 5.4 (+ mini, nano, pro) / 5.5 / 5.6 (sol, terra, luna) / gpt-6 (astra,
  sol, luna) / gpt-6.1-sol, `*-codex-mini`/`-max`, gpt-4.1 mini/nano, gpt-4o, o1/o3 variants; OpenAI cache-write prices
  where they exist; long-context (>272k) tiers.
- Added Cursor's Composer 1 / 1.5 / 2 / 2.5 (+ fast), Grok 4.5 / 4.6 / 4.7 (+ fast, 500k), Auto, and the Gemini, Kimi,
  GLM and Muse models Cursor offers.
- Model names are normalized (`claude-4.5-sonnet` = `claude-sonnet-4-5`, `gpt-5.4` = `gpt-5-4`); unknown variants fall
  back to their family (e.g. a new `gpt-6.x` prices like gpt-6-sol), then to $3/$15. `-fast` variants without their
  own row cost 2x. `~/.loopguard/pricing.json` overrides still win.

Other:
- `loopguard report --agent X` no longer shows other agents' cached rows.
- README: dropped the stale version from the heading; documented Cursor behavior and pricing coverage.
- `scripts/cursor-hooks-e2e.js`: runs LoopGuard's hooks through an installed `cursor-agent`'s hook runner (dev only, not
  shipped in the npm package).

## 0.1.1
- Claude subagent spend counts toward the session cap; Cursor caps ignore `transcript_path` (use `state.vscdb`); other
  agents stay in the usage index on partial scans; Codex hook-trust hint in `init`; warning omits disabled caps.

## 0.1.0
- First npm release as `loopguard-cli` (command `loopguard`).
