import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'claude-code-usage-limit' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 22, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">“You’ve hit your session limit” in the middle of a task usually means one long or looping session used far more of your plan than it looked like. This guide covers which limits Claude Code has on Pro and Max, what each message means, why usage climbs faster than you expect, how to keep an eye on it while you work, and how to stop a runaway session before it eats your week.</p>

    <h2>The limits on a Claude subscription</h2>
    <p>From Anthropic’s <a href="https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan">Claude Code with Pro or Max</a> and <a href="https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work">usage limits</a> help articles:</p>
    <ul>
      <li><strong>A session limit that resets every five hours.</strong></li>
      <li><strong>A weekly limit.</strong> On Max it resets at a fixed time each week assigned to your account, not seven days after you start; <strong>Settings → Usage</strong> on claude.ai shows your next reset.</li>
      <li><strong>A separate weekly limit for Fable</strong> on Max plans.</li>
      <li><strong>Shared across products.</strong> claude.ai, Claude Code and Claude Desktop all count against the same limits, so a long chat in the browser leaves less for the terminal.</li>
      <li>Usage counts against the session and weekly allowances at the same time, so one heavy burst can use up the week before the 5-hour window even resets.</li>
    </ul>
    <p>Team and Enterprise seats work the same way: a per-seat allowance with a rolling five-hour window and a weekly window, shared with Claude chat and Cowork, sized by seat tier (<a href="https://code.claude.com/docs/en/costs">Manage costs</a>). On an API key there is no plan limit at all; you are billed per token, and the controls are in the <a href="/guides/claude-code-spending-limit">spending limit guide</a>.</p>

    <h2>Which limit did you hit?</h2>
    <p>The message tells you. From Claude Code’s <a href="https://code.claude.com/docs/en/errors">error reference</a>:</p>
    <table>
      <thead><tr><th>Message</th><th>What it means</th><th>Does <code>/model</code> help?</th></tr></thead>
      <tbody>
        <tr><td><code>You've hit your session limit · resets 3:45pm</code></td><td>The 5-hour window is used up</td><td>No, it is shared across models</td></tr>
        <tr><td><code>You've hit your weekly limit · resets Mon 12:00am</code></td><td>The weekly allowance is used up</td><td>No</td></tr>
        <tr><td><code>You've hit your Opus limit</code> / <code>Sonnet limit</code></td><td>A limit for that model family only</td><td>Yes: switch to a model outside that family</td></tr>
        <tr><td><code>You've hit your monthly spend limit</code> (and the individual, org and team variants)</td><td>You are past the plan and on usage credits, and the credits hit a spend limit</td><td>No; raise the limit or wait for the plan reset</td></tr>
        <tr><td><code>Server is temporarily limiting requests (not your usage limit)</code></td><td>A short server-side throttle, retried automatically</td><td>Not needed; it isn’t your quota</td></tr>
      </tbody>
    </table>
    <p>A context or auto-compact warning is also not a usage limit: the conversation is close to the size where Claude Code summarizes older history.</p>

    <h2>Why usage climbs faster than you expect</h2>
    <p>Claude Code sends your full conversation with every request, and each tool call sends another request carrying the results. Anthropic’s cost docs list the usual reasons a session that has been open for hours draws more than your activity suggests:</p>
    <ul>
      <li><strong>Long context.</strong> Even a one-line question in an all-day session re-reads the whole conversation (at the cached rate when the cache is warm).</li>
      <li><strong>Cache misses.</strong> The first message after a break longer than the cache lifetime reprocesses your full context.</li>
      <li><strong>Things that run while you aren’t typing:</strong> session-scoped scheduled tasks such as <code>/loop</code>, goal check-ins, and messages from your other sessions, each sending the full context.</li>
      <li><strong>Subagents, workflows and agent teams.</strong> Each one makes its own requests on top of the main conversation.</li>
      <li><strong>Compaction.</strong> <code>/compact</code> reads the conversation it summarizes, so compacting a huge context is itself a large request. <code>/clear</code> costs nothing.</li>
    </ul>
    <p>And the one the docs can’t list: an agent stuck retrying the same failing command. Every retry re-sends the growing context, so a loop gets more expensive with each turn.</p>

    <h2>How to monitor it while you work</h2>
    <ul>
      <li><strong><code>/usage</code></strong> shows your plan usage bars with reset times, a usage-credits row if credits are on, and a breakdown of what is using your limits: shares for skills, subagents, plugins and individual MCP servers, the heaviest <code>/loop</code> tasks, and recommendations such as trimming a large <code>CLAUDE.md</code>. Press <code>d</code> or <code>w</code> to switch between the last 24 hours and 7 days. On v2.1.305 or later, <code>f</code> applies the recommendations it can. The breakdown is approximate and only covers sessions on this machine.</li>
      <li><strong>Warnings.</strong> Before a window runs out Claude Code warns you, for example <code>You've used 85% of your session limit · resets 3:45pm</code>.</li>
      <li><strong>A status line.</strong> For Pro and Max, Claude Code passes a <code>rate_limits</code> object to your <a href="https://code.claude.com/docs/en/statusline">status line</a> script after the first response, with <code>five_hour</code> and <code>seven_day</code> windows, each carrying <code>used_percentage</code> and <code>resets_at</code>. A minimal script:</li>
    </ul>
    <pre>{`#!/bin/bash
# ~/.claude/statusline.sh  (chmod +x), then in ~/.claude/settings.json:
# "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" }
input=$(cat)
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
OUT=""
[ -n "$FIVE_H" ] && OUT="5h: $(printf '%.0f' "$FIVE_H")%"
[ -n "$WEEK" ] && OUT="\${OUT:+$OUT }7d: $(printf '%.0f' "$WEEK")%"
echo "\${OUT:-no plan data yet}"`}</pre>
    <p>In the Desktop app, the usage ring next to the model picker shows the same thing.</p>

    <h2>What to do when you hit it</h2>
    <ul>
      <li><strong>Wait.</strong> The message gives the reset time. Since v2.1.234, an interactive session signed in with a subscription waits in place and continues the interrupted task after the reset on its own (it re-arms at most twice in a row). Press <code>Esc</code> to cancel the wait, or turn off <strong>Continue automatically at usage limit</strong> in <code>/config</code>.</li>
      <li><strong>Switch models</strong> with <code>/model</code>, but only for an Opus or Sonnet limit. The first request after a switch re-reads the whole conversation with no cache hits.</li>
      <li><strong>Turn on usage credits</strong> with <code>/usage-credits</code> to keep going at standard API rates, billed on top of your plan, until your monthly spend limit or balance runs out. Set that monthly limit if you do. The monthly API credits included with Max can’t be used for this.</li>
      <li><strong>Upgrade</strong> (Pro to Max 5x, or Max 5x to 20x) if you hit the limit every week doing normal work.</li>
    </ul>
    <p>Before you continue, look at what the session was doing. Automatic continue means a session that was looping when it ran out will pick up the loop again after the reset, and spend the next window the same way.</p>

    <h2>Use less of your limit per task</h2>
    <ul>
      <li><code>/clear</code> between unrelated tasks (use <code>/rename</code> first so you can <code>/resume</code> it later).</li>
      <li>Use Sonnet for most coding and keep Opus for hard problems; give simple subagents <code>model: haiku</code>.</li>
      <li>Lower <code>/effort</code> for routine work; thinking tokens count as output.</li>
      <li>Disable MCP servers you aren’t using (<code>/mcp</code>) and keep <code>CLAUDE.md</code> short, since it loads into every session.</li>
      <li>Press <code>Esc</code> as soon as Claude heads the wrong way, instead of letting it finish.</li>
    </ul>

    <h2>Stop runaway sessions before they eat the week</h2>
    <p>Plan limits stop you <em>after</em> the usage is gone. To stop one bad session early, the check has to run on every step. Claude Code’s <code>PreToolUse</code> hook does that, and LoopGuard is an open-source (MIT) CLI that installs one. It reads the session transcript Claude Code already writes (subagent transcripts included), prices the tokens at API list prices, and on every tool call checks a per-session cap, a daily cap and loop heuristics. No proxy and no API key, so it works on Pro and Max.</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent claude   # adds PreToolUse + Stop hooks to ~/.claude/settings.json (backed up first)

loopguard config set sessionCapUsd 10   # estimated $ per session (default 25)
loopguard config set dailyCapUsd 40     # estimated $ per local day, all guarded agents (default 100)
loopguard report --by session           # what your recent sessions would have cost at API prices`}</pre>
    <ul>
      <li>The same tool call 5 times within 10 minutes is denied, and a $10 jump within 5 minutes ends the session (<code>loop.maxRepeats</code>, <code>loop.spiralUsd</code>), which is the usual shape of a session that quietly burns a 5-hour window.</li>
      <li>At 80% of a cap Claude Code shows a warning; at the cap the next tool call is denied and the session is ended with a reason.</li>
      <li><code>loopguard pause 15</code> lifts enforcement for 15 minutes when you do want to keep going.</li>
    </ul>
    <p>Be clear about what this measures. On a subscription you aren’t billed per token, and Anthropic doesn’t publish how many tokens a 5-hour window holds, so LoopGuard does not read your plan percentage. The dollar figure is an estimate at API list prices: a consistent measure of how heavy a session is, which you can calibrate against <code>/usage</code> after a few days (for example, if $15 of estimated spend is roughly your 5-hour window, set <code>sessionCapUsd</code> below that). Checks run when Claude calls a tool or finishes a turn, so a cap can be passed by up to one turn.</p>

    <Related slug={SLUG} />
  </main>);
}
