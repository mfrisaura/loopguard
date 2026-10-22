import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'ai-coding-agent-budget-ci' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 22, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">An agent in CI runs with nobody watching: no one presses <code>Esc</code> when it starts retrying the same failing test, and a workflow that fires on every push can run it hundreds of times a month. The fix is layers: a per-run cap inside the agent, a timeout on the job, and a hard spend limit on the key the runner uses. Here is what Claude Code, Codex CLI and Cursor CLI each offer for headless runs as of October 2026, and where the gaps are.</p>

    <h2>The four layers</h2>
    <table>
      <thead><tr><th>Layer</th><th>Stops</th><th>Claude Code (<code>claude -p</code>)</th><th>Codex CLI (<code>codex exec</code>)</th><th>Cursor CLI (<code>agent -p</code>)</th></tr></thead>
      <tbody>
        <tr><td>Per-run dollar cap</td><td>One expensive run</td><td><code>--max-budget-usd</code></td><td>None (experimental token budget only)</td><td>None</td></tr>
        <tr><td>Per-run step cap</td><td>Endless agentic turns</td><td><code>--max-turns</code></td><td>None documented</td><td>None documented</td></tr>
        <tr><td>Job timeout</td><td>Hung or looping jobs</td><td colSpan={3}>Your CI system, e.g. <code>timeout-minutes</code> in GitHub Actions</td></tr>
        <tr><td>Key / account limit</td><td>The monthly total</td><td>Console workspace spend limit</td><td>OpenAI project hard spend limit</td><td>Account spend limit; service-account limits on Enterprise</td></tr>
      </tbody>
    </table>
    <p>The key limit is the only one that is a hard dollar ceiling no matter what the agent does, so set it first. The per-run caps keep any single run from using a large share of it.</p>

    <h2>Give CI its own key with its own limit</h2>
    <ul>
      <li><strong>Claude:</strong> create a separate workspace in the Claude Console for CI, put its API key in your CI secrets, and set a <a href="https://platform.claude.com/docs/en/manage-claude/workspaces">workspace spend limit</a>. (The automatic “Claude Code” workspace can’t issue API keys.) You can also run CI on a subscription with a <code>CLAUDE_CODE_OAUTH_TOKEN</code> from <code>claude setup-token</code>, but then CI draws on that person’s plan limits, and Anthropic recommends an API key for secrets shared across repositories.</li>
      <li><strong>Codex:</strong> a dedicated OpenAI project and key, with <strong>Project settings → Limits → Enforce a hard limit</strong> turned on. Without the checkbox it is only an alert. Requests past the limit fail with <code>project_spend_limit_exceeded</code> (<a href="https://developers.openai.com/api/docs/guides/spend-limits">OpenAI spend limits</a>).</li>
      <li><strong>Cursor:</strong> the CLI authenticates with <code>CURSOR_API_KEY</code> from Dashboard → API Keys, and headless requests draw on that account’s usage like interactive ones, so the account’s monthly spend limit (see <a href="/guides/limit-cursor-agent-costs">limiting Cursor agent costs</a>) is the ceiling. On Enterprise, a <a href="https://cursor.com/docs/account/enterprise/service-accounts">service account</a> keeps CI off a person’s account and has its own per-billing-period spend limit; past it, requests fail with “Service account spend limit reached”.</li>
    </ul>
    <p>Monthly limits are not instant (OpenAI and Cursor both note spend can briefly pass them) and they are monthly, which is why the per-run layers below still matter.</p>

    <h2>Claude Code: --max-budget-usd and --max-turns</h2>
    <p>Print mode has a real per-run cap. From the <a href="https://code.claude.com/docs/en/cli-reference">CLI reference</a>, the run stops once estimated spend reaches the amount, subagent spend counts, and once the cap is hit Claude Code won’t start more subagents and stops background ones (v2.1.217 or later). <code>--max-turns</code> exits with an error after that many agentic turns.</p>
    <pre>{`claude -p --max-budget-usd 3.00 --max-turns 40 \\
  --output-format json "Fix the failing test in src/billing" > result.json
jq '.total_cost_usd' result.json   # the run's estimated cost, for your CI logs`}</pre>
    <p>In the official GitHub Action (<code>anthropics/claude-code-action</code>), <code>claude_args</code> passes any CLI argument, so the same flags go there:</p>
    <pre>{`- uses: anthropics/claude-code-action@v1
  timeout-minutes: 20
  with:
    anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: "--max-turns 30 --max-budget-usd 3"`}</pre>
    <p>Caveats: the cap is checked against Claude Code’s own estimate, the final response can push spend past it (leave headroom), and with <code>--continue</code> or <code>--resume</code> earlier runs’ spend doesn’t count toward the new cap.</p>

    <h2>Codex CLI: no per-run cap, so lean on the project limit</h2>
    <p><code>codex exec</code> has no flag that stops a run at a dollar amount. The config reference lists a token “rollout budget” (<code>features.rollout_budget</code>) that is under development and off by default. What you do get:</p>
    <ul>
      <li><code>--json</code> streams events, and each <code>turn.completed</code> event carries <code>usage</code> with input, cached input and output tokens, so you can log what a run used.</li>
      <li>OpenAI’s <a href="https://developers.openai.com/codex/github-action">Codex GitHub Action</a> (<code>openai/codex-action@v1</code>) runs <code>codex exec</code> behind a proxy so the API key isn’t exposed to the rest of the job. OpenAI’s <a href="https://developers.openai.com/codex/noninteractive">non-interactive docs</a> say not to set <code>OPENAI_API_KEY</code> or <code>CODEX_API_KEY</code> as a job-level variable in workflows that run repository code; if you call the CLI yourself, set <code>CODEX_API_KEY</code> inline for that one command.</li>
      <li>Keep the sandbox narrow (<code>--sandbox workspace-write</code> rather than <code>danger-full-access</code>) and add a job timeout.</li>
    </ul>

    <h2>Cursor CLI: no per-run cap, and no cost in the output</h2>
    <p>Cursor’s <a href="https://cursor.com/docs/cli/reference/parameters">CLI parameters</a> have no budget or turn limit, and the documented <code>--output-format json</code> result reports duration but no cost. So for <code>agent -p</code> in CI, the account or service-account spend limit plus a job timeout are your controls. Cursor recommends restricting what the agent may do in CI with <a href="https://cursor.com/docs/cli/reference/permissions">permission rules</a> (for example denying <code>Shell(git)</code>) and doing pushes and comments in separate deterministic steps.</p>

    <h2>Always set a job timeout</h2>
    <p>A timeout is the one control that works the same for all three agents and costs nothing. GitHub Actions jobs default to a 360-minute limit, far longer than any agent task should take:</p>
    <pre>{`jobs:
  agent-fix:
    runs-on: ubuntu-latest
    timeout-minutes: 20        # whole job
    steps:
      - uses: actions/checkout@v5
      - name: Run agent
        timeout-minutes: 15    # just the agent step
        run: ...`}</pre>
    <p>Also watch the trigger: an agent on every <code>push</code> or <code>synchronize</code> event multiplies cost by how often people push. Run it on a label, a comment, or a failed CI run instead, and use <code>concurrency</code> to cancel superseded runs.</p>

    <h2>Add loop detection and caps with LoopGuard</h2>
    <p>Per-run dollar caps don’t notice that the agent has run the same failing command ten times, and Codex and Cursor don’t have them at all. LoopGuard is an open-source (MIT) CLI that installs <code>PreToolUse</code>/<code>Stop</code> hooks for Claude Code and Codex (and <code>preToolUse</code>/<code>stop</code> for Cursor) and checks every tool call against loop heuristics and session and daily dollar caps. It reads the agents’ own local logs, so it needs no proxy and no extra key. On a fresh runner:</p>
    <pre>{`npm i -g loopguard-cli
loopguard init --agent claude,codex     # writes ~/.claude/settings.json and ~/.codex/hooks.json
loopguard config set sessionCapUsd 3    # estimated $ per agent session
loopguard config set loop.maxRepeats 3  # repeats of the same call (with no progress) allowed within 10 minutes

claude -p --max-budget-usd 3 "..."                        # Claude Code: hooks load from ~/.claude
codex exec --dangerously-bypass-hook-trust \\
  --sandbox workspace-write "..."                         # Codex: see the trust note below
loopguard report --by session                             # estimated cost per session, for the job log`}</pre>
    <p>What to know before relying on it in CI:</p>
    <ul>
      <li><strong>Claude Code <code>--bare</code> skips hooks.</strong> Anthropic recommends <code>--bare</code> for scripted runs, and it doesn’t read <code>~/.claude</code>, so LoopGuard won’t run. Either leave <code>--bare</code> off, or pass the settings file that holds the hooks with <code>--settings ~/.claude/settings.json</code>, which the headless docs list as the way to load settings in bare mode. Don’t use <code>--no-session-persistence</code> either: LoopGuard prices the session from its transcript.</li>
      <li><strong>Codex needs its hooks trusted.</strong> Codex skips new hooks until someone trusts them in <code>/hooks</code>, and a fresh runner has no saved trust, so <code>codex exec</code> would skip LoopGuard without a warning. For a runner you control, <code>--dangerously-bypass-hook-trust</code> runs enabled hooks for that invocation; only use it where you control every hook on the machine. Don’t use <code>--ephemeral</code>, which stops Codex writing the session log LoopGuard reads. Codex hooks can’t end a session, so a tripped cap denies every further tool call.</li>
      <li><strong>Cursor headless runs are not cost-capped.</strong> <code>agent -p</code> doesn’t send token counts to any hook, so LoopGuard’s session and daily caps can’t see that spend. Loop detection still blocks repeated tool calls that make no progress.</li>
      <li><strong>The daily cap is per machine.</strong> It sums spend in that runner’s logs for the local day. On an ephemeral runner that is one job; on a persistent self-hosted runner it covers every job that day.</li>
      <li>Costs are <strong>estimates at API list prices</strong>, and checks happen at tool calls and turn ends, so spend can pass a cap by up to one turn. LoopGuard fails open: on an internal error the agent keeps working and the error goes to <code>~/.loopguard/errors.log</code>. Keep the key limit as the backstop.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
