import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'claude-code-token-usage' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 24, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">You asked for a few bug fixes and half your 5-hour window is gone, or the API bill for one afternoon is bigger than last week’s. Claude Code’s token use is driven less by what you type than by how much context gets re-sent and how many requests a task fans out into. Here is where the tokens actually go, how to see which one is hitting you, and the changes that cut usage the most.</p>

    <h2>Where the tokens go</h2>
    <p>From Anthropic’s <a href="https://code.claude.com/docs/en/costs">Manage costs effectively</a> page, plus what that means in practice:</p>
    <ul>
      <li><strong>Every request re-sends the whole conversation.</strong> Each time Claude uses a tool, Claude Code sends another request carrying the conversation plus that batch of tool results. Prompt caching bills most of the repeated history at the cheaper cache-read rate, but it still counts, so a one-line question in a session that has been open all day draws usage for the whole conversation.</li>
      <li><strong>Cache misses after a break.</strong> Your first message after a pause longer than the cache lifetime reprocesses the full context at the normal input rate.</li>
      <li><strong>Subagents and parallel work.</strong> Every subagent sends its own requests with its own context, on top of the main conversation. Ask an agent to “fix all 12 issues” and it may fan out into many subagents at once; each one is roughly a session’s worth of usage. Agent teams, per the same docs, use about 7x more tokens than a standard session when teammates run in plan mode.</li>
      <li><strong>Extended thinking.</strong> Thinking tokens are billed as output tokens, and the default budget can be tens of thousands of tokens per request. Output costs several times more than input.</li>
      <li><strong>Opus as the default.</strong> Anthropic names “long sessions that were never cleared” and “Opus left as the default model” as the usual causes of unexpectedly high spend. A switch to Opus also applies to subagents that inherit the session’s model.</li>
      <li><strong>Always-loaded context.</strong> <code>CLAUDE.md</code> is loaded at session start and sent with every request, as are MCP server instructions and tool names.</li>
      <li><strong>Work while you are idle.</strong> Session-scoped scheduled tasks (<code>/loop</code>) fire on their interval and send the full context each time; so do goal check-ins and messages from your other sessions.</li>
      <li><strong>Loops.</strong> The same failing command rerun ten times is ten full-context requests that produce nothing. This is the multiplier on all of the above.</li>
    </ul>

    <h2>Find out which one is hitting you</h2>
    <ul>
      <li><strong><code>/usage</code></strong>: on Pro, Max, Team and Enterprise it shows plan usage bars plus an <strong>attribution</strong> breakdown (skills, subagents, plugins, individual MCP servers as a share of recent usage) and <strong>recommendations</strong>, one per row, for anything behind 10% or more of your usage, such as <code>Trim ~/code/api/CLAUDE.md · 49k tokens per request</code>. Press <code>d</code> or <code>w</code> to switch between the last 24 hours and 7 days. On recent versions, <code>f</code> applies the recommendations it can. On API billing, the Session block shows token counts and an estimated dollar cost for the current session, plus a prompt-cache line with the hit rate and misses.</li>
      <li><strong><code>/context</code></strong>: what is taking up the context window right now (system prompt, <code>CLAUDE.md</code>, MCP, conversation).</li>
      <li><strong>Per session, after the fact:</strong> Claude Code writes every session’s token counts to local transcripts. See <a href="/guides/track-ai-coding-agent-token-costs">tracking token costs per session</a> to turn those into an estimated cost per session, or run <code>loopguard report --by session</code>.</li>
    </ul>

    <h2>The changes that save the most</h2>
    <ol>
      <li><strong><code>/clear</code> between unrelated tasks.</strong> Stale context is re-sent with every later message. <code>/clear</code> costs nothing; <code>/compact</code> has to read the whole conversation to summarize it, so compacting a huge context is itself a big request. Use <code>/rename</code> first if you want to <code>/resume</code> it later.</li>
      <li><strong>Match the model to the job.</strong> Sonnet for routine edits, Opus for hard design problems. Switch with <code>/model</code>; set <code>model: haiku</code> for simple subagents.</li>
      <li><strong>Turn thinking down for simple work.</strong> Lower the effort with <code>/effort</code> (or in <code>/model</code>). On models that allow it, thinking can be disabled in <code>/config</code>.</li>
      <li><strong>Bound the fan-out.</strong> Say how many subagents you want (“use at most 2 subagents”) or ask it to fix issues one at a time. “Fix everything you flagged, be extra careful” on Opus is the most expensive sentence you can type.</li>
      <li><strong>Trim what is always loaded.</strong> Keep <code>CLAUDE.md</code> under about 200 lines and move workflow-specific instructions into skills, which load only when used. Disable MCP servers you aren’t using with <code>/mcp</code>; a CLI like <code>gh</code> costs no context until it runs.</li>
      <li><strong>Keep verbose output out of the main context.</strong> Ask for failures only (<code>pytest -q</code>, <code>grep</code> the log) or have a subagent read the 10,000-line log and return a summary. Anthropic’s docs include a <code>PreToolUse</code> hook that rewrites test commands to show only failures.</li>
      <li><strong>Plan first, correct early.</strong> Plan mode (<code>Shift+Tab</code>) before a big change avoids paying for a wrong implementation. If it heads the wrong way, press <code>Esc</code> and <code>/rewind</code> instead of letting it finish.</li>
      <li><strong>Watch idle features.</strong> Stop <code>/loop</code> tasks you no longer need, and remember a session left open over lunch will miss the cache on your next message.</li>
    </ol>

    <h2>Stop the expensive mistakes automatically</h2>
    <p>The habits above reduce normal usage. The spikes, the session that eats a whole window in 30 minutes, usually come from a loop or a fan-out nobody was watching. Claude Code’s native caps are coarse: plan windows, monthly usage-credit and Console workspace limits, and <code>--max-budget-usd</code> for headless <code>claude -p</code> runs only (see <a href="/guides/claude-code-spending-limit">Claude Code spending limit</a>). Nothing native stops an interactive session at $10, or notices the same test run with the same result for the eighth time.</p>
    <p>LoopGuard is an open-source (MIT) CLI that adds those checks as Claude Code hooks. It needs no proxy and no API key, so it works on Pro and Max as well as API billing:</p>
    <pre>{`npm i -g loopguard-cli
loopguard init --agent claude      # PreToolUse, PostToolUse, PostToolUseFailure and Stop hooks
loopguard config set sessionCapUsd 10   # estimated $ per session (default 25)
loopguard config set dailyCapUsd 40     # estimated $ per local day (default 100)
loopguard report --by session           # what your recent sessions cost, estimated`}</pre>
    <ul>
      <li><strong>Loops:</strong> the same tool call repeated 5 times in 10 minutes with no progress in between (no file changed, same output) is denied, and Claude is told to diagnose instead of rerunning. The 3rd loop block in a row ends the session.</li>
      <li><strong>Spirals:</strong> an estimated $10 jump within 5 minutes ends the session (<code>loop.spiralUsd</code>). That is the “13 subagents at once” case.</li>
      <li><strong>Caps:</strong> past the session or daily cap, Claude Code stops. Costs are estimated at API list prices from the transcripts Claude Code writes, subagents included. On a subscription that is “API-equivalent” spend, which is still a good proxy for how fast you are burning your window.</li>
    </ul>
    <p>Checks run at each tool call, so a single long response isn’t cut off mid-stream, and work outside Claude’s tool calls (a background process it started, another app calling the API) isn’t seen. Keep your billing-side limits set too.</p>

    <Related slug={SLUG} />
  </main>);
}
