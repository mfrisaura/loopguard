import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'claude-code-spending-limit' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 19, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Claude Code has several real spend controls, but each one works at a different level: a monthly limit on your account, or a per-run cap for scripted runs. What it does not have is a dollar cap for the interactive session you leave running. This guide covers the built-in options first, by how you pay, and then how to add per-session and daily caps with a hook.</p>

    <h2>First: how are you paying?</h2>
    <p>The right control depends on where Claude Code’s usage is billed:</p>
    <table>
      <thead><tr><th>You use Claude Code with</th><th>The ceiling you already have</th><th>Native limit you can set</th></tr></thead>
      <tbody>
        <tr><td>An API key / Claude Console</td><td>None by default; billed per token</td><td>Workspace spend limit in the Console</td></tr>
        <tr><td>Claude Pro or Max</td><td>Your plan’s usage limits (5-hour and weekly)</td><td>Monthly spend limit on usage credits, or keep usage credits off</td></tr>
        <tr><td>Claude Team or Enterprise</td><td>Each seat’s allowance</td><td>Admin spend limits on usage credits (organization, group or member)</td></tr>
        <tr><td>Amazon Bedrock, Google Cloud or Microsoft Foundry</td><td>Your cloud account</td><td>Your cloud provider’s budget controls</td></tr>
      </tbody>
    </table>

    <h2>API key users: set a Console workspace spend limit</h2>
    <p>When you first sign Claude Code in with a Claude Console account, the Console creates a workspace called “Claude Code” that all Claude Code usage is billed to. Set a spend limit on that workspace (see Anthropic’s <a href="https://platform.claude.com/docs/en/build-with-claude/workspaces">workspace docs</a>) and Claude Code stops getting responses once the workspace reaches it. You can also set a workspace rate limit there so Claude Code can’t starve your production traffic of rate limit.</p>
    <p>This is the right backstop for a monthly budget. It is not a per-session limit: one bad overnight run can still use the whole month’s allowance before it trips.</p>

    <h2>Pro and Max: decide what happens at your plan limit</h2>
    <p>On a subscription, your plan’s usage limits are already a hard ceiling. You hit them and you wait for the reset. The only way to spend more money is <strong>usage credits</strong> (previously called extra usage), which let you keep working past the limit at a cost:</p>
    <ul>
      <li>Run <code>/usage-credits</code> in Claude Code. It opens <strong>Settings → Usage</strong> on claude.ai, where you turn usage credits on or off and set a <strong>monthly spend limit</strong>.</li>
      <li>Leave usage credits off if you never want to pay beyond the plan. If you turn them on, set a limit. When you reach it with credits still available, Claude Code prompts you to raise or remove the limit rather than spending past it.</li>
      <li><code>/usage</code> (also available as <code>/cost</code>) shows your plan usage bars, a usage-credits row with this month’s spend against your limit, and a breakdown of what is eating your limits.</li>
    </ul>
    <p>Even with no money at stake, a looping session can burn through your 5-hour or weekly limit and lock you out for days. The per-session cap below helps with that too. For what each limit message means and how to watch your usage, see <a href="/guides/claude-code-usage-limit">Claude Code usage limits</a>.</p>

    <h2>Team and Enterprise: admin spend limits</h2>
    <p>Each seat’s allowance is the default ceiling. If admins turn on usage credits so members can keep going, they set spend limits at the organization, group or individual member level in the claude.ai admin settings (<strong>Organization settings → Usage</strong>). Members who hit a limit see a message naming which limit they hit. See Anthropic’s <a href="https://code.claude.com/docs/en/costs">Manage costs</a> page for the full list.</p>

    <h2>Headless runs: --max-budget-usd</h2>
    <p>For scripted or CI runs in print mode (<code>claude -p</code>), Claude Code has a real per-run dollar cap:</p>
    <pre>{`claude -p --max-budget-usd 5.00 "Fix the failing tests in src/billing"
claude -p --max-budget-usd 5.00 --max-turns 30 "..."   # also cap the number of agentic turns`}</pre>
    <p>Once the run’s estimated spend reaches the amount, Claude Code stops it. Subagent spend counts toward the cap, and once the cap is reached Claude Code won’t start new subagents and stops background ones (that part needs v2.1.217 or later). Things to know, from the <a href="https://code.claude.com/docs/en/cli-reference">CLI reference</a>:</p>
    <ul>
      <li>It is <strong>print mode only</strong>. There is no equivalent flag for an interactive session.</li>
      <li>It is checked against Claude Code’s own cost estimate, which can differ from your bill, and the final response can push spend past the cap. Leave headroom.</li>
      <li>When you resume a conversation with <code>--continue</code> or <code>--resume</code>, the cost of earlier runs doesn’t count toward the new cap.</li>
    </ul>
    <p>For a full CI setup across Claude Code, Codex and Cursor (job timeouts, dedicated keys, GitHub Actions), see <a href="/guides/ai-coding-agent-budget-ci">setting a hard budget for AI coding agents in CI</a>. The Agent SDK has the same caps as <code>maxBudgetUsd</code> / <code>max_budget_usd</code> and <code>maxTurns</code> / <code>max_turns</code>.</p>

    <h2>The gap: interactive sessions and daily totals</h2>
    <p>Put together, the native controls give you a monthly ceiling (Console, usage credits, admin limits) and a per-run cap for <code>claude -p</code>. What is missing is a cap on the long interactive session you start in the morning and leave working, and a <em>daily</em> cap across all your sessions (and other agents). You can see the session’s estimated cost in <code>/usage</code> or in a <a href="https://code.claude.com/docs/en/statusline">custom status line</a>, but nothing stops the session when it passes a number.</p>
    <p>A prompt like “stop if this costs more than $10” is not a cap; the model can’t see what it costs. The place to enforce it is a <code>PreToolUse</code> hook. Claude Code runs the hook before every tool call, and the hook can deny the call (<code>permissionDecision: &quot;deny&quot;</code>) or end the session (<code>{`{"continue": false}`}</code>). The hook needs to read the session’s transcript, price the tokens, and compare against your cap.</p>

    <h2>Per-session and daily caps with LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs exactly that hook. It reads Claude Code’s own transcript for the current session, including the <code>subagents/</code> transcripts next to it, prices it at API list prices, and checks it on every tool call. No proxy and no API key, so it works the same on a subscription.</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent claude   # adds PreToolUse + Stop hooks to ~/.claude/settings.json (backed up first)

loopguard config set sessionCapUsd 10   # per session (default 25)
loopguard config set dailyCapUsd 40     # per local day, across all guarded agents (default 100)
loopguard status                        # today's spend vs caps, recent trips`}</pre>
    <p>Restart running Claude Code sessions so they load the hook. What happens from then on:</p>
    <ul>
      <li>At 80% of either cap (<code>warnAtPct</code>), Claude Code shows a warning such as <code>LoopGuard: session $8.10/$10.00, today $31.20/$40.00</code>.</li>
      <li>At the cap, the next tool call is denied and the session is ended with a reason: <code>LoopGuard: session spend $10.04 reached cap $10.00. Stopping. Raise with `loopguard config set sessionCapUsd &lt;n&gt;` or `loopguard pause 15`.</code></li>
      <li>The same hook catches loops: the same tool call 5 times within 10 minutes with no change to the files or its output in between is denied, and a $10 jump in 5 minutes halts the session (<code>loop.maxRepeats</code>, <code>loop.spiralUsd</code>).</li>
      <li><code>loopguard pause 15</code> lifts enforcement for 15 minutes when you really do want to keep going. <code>loopguard config set sessionCapUsd 0</code> turns that cap off.</li>
    </ul>
    <p>For headless runs, use both: <code>--max-budget-usd</code> for the run, and LoopGuard’s daily cap so twenty separate $5 runs can’t add up to $100 without you noticing.</p>

    <h2>Limits worth knowing</h2>
    <ul>
      <li>Costs are <strong>estimates at API list prices</strong>. On Pro or Max you aren’t billed per token, but the dollar figure is still a consistent measure of how fast a session is using your limits. Override prices in <code>~/.loopguard/pricing.json</code> if you pay different rates.</li>
      <li>The check runs when Claude calls a tool or finishes a turn, so a single long response isn’t cut off midway. Spend can pass the cap by up to one turn.</li>
      <li>Ending the session relies on Claude Code honoring <code>continue: false</code>, which recent versions do (verified on 2.1.302). Older builds, for example 2.1.197, deny the tool call but keep the session open. Run <code>claude update</code> if yours is old.</li>
      <li>Hooks only see Claude Code’s own requests. If the agent writes a script that calls the Anthropic API with your key, keep a Console spend limit as the backstop.</li>
      <li>LoopGuard fails open: if it has an internal error, Claude Code keeps working and the error goes to <code>~/.loopguard/errors.log</code>. <code>loopguard uninstall --agent claude --restore</code> puts your original settings file back byte-for-byte.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
