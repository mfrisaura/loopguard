import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'track-ai-coding-agent-token-costs' as const;
export const metadata = guideMetadata(SLUG);

const SAMPLE = `$ loopguard report --by session
SESSION                                     AGENT   INPUT  OUTPUT  CACHE R  CACHE W    COST
------------------------------------------  ------  -----  ------  -------  -------  ------
claude:sess-claude-1                        claude   3.0k    1.5k    10.0k     2.0k   $0.13
cursor:comp-1                               cursor   4.0k    1.8k        0        0  $0.04*
codex:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b  codex   14.0k    3.0k    18.0k        0   $0.02
TOTAL                                                                                 $0.19
* includes estimated tokens (Cursor bubbles without token counts)
Costs are estimates at API list prices; subscription plans are billed differently.`;

export default function Page() {
  const g = guide(SLUG);
  const loops = guide('stop-runaway-ai-coding-agent-loops');
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 18, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Claude Code, Codex CLI and Cursor all record token usage on your own machine. Once you know where those records live and how to read them, you can see which session, model or agent is actually eating your budget or your usage limit, without a proxy and without handing anyone an API key.</p>

    <h2>Where each agent keeps its usage data</h2>
    <table>
      <thead><tr><th>Agent</th><th>Location</th><th>What is in it</th></tr></thead>
      <tbody>
        <tr><td>Claude Code</td><td><code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code> (or <code>$CLAUDE_CONFIG_DIR/projects</code>)</td><td>One JSON line per event. Assistant messages carry <code>message.usage</code>: <code>input_tokens</code>, <code>output_tokens</code>, <code>cache_read_input_tokens</code>, <code>cache_creation_input_tokens</code>, plus the model.</td></tr>
        <tr><td>Codex CLI</td><td><code>~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl</code> (or <code>$CODEX_HOME</code>)</td><td><code>token_count</code> events with <code>last_token_usage</code> (this turn) and <code>total_token_usage</code> (running total). The model is in the preceding <code>turn_context</code> / <code>session_meta</code>.</td></tr>
        <tr><td>Cursor</td><td><code>state.vscdb</code> (SQLite) in Cursor’s <code>User/globalStorage</code> folder</td><td>Chat “bubbles” in the <code>cursorDiskKV</code> table (<code>bubbleId:*</code> keys). Some carry a <code>tokenCount</code>; many do not.</td></tr>
      </tbody>
    </table>

    <h2>Three mistakes that make totals wrong</h2>
    <ol>
      <li><strong>Double counting Claude Code messages.</strong> A streamed response can be written to the transcript more than once. De-duplicate by message id + request id before summing.</li>
      <li><strong>Summing Codex’s running total.</strong> <code>total_token_usage</code> is cumulative, so adding it up per event inflates the number wildly. Sum <code>last_token_usage</code> per turn instead, and skip repeated events where the total did not change. Also note that Codex’s <code>input_tokens</code> already <em>includes</em> <code>cached_input_tokens</code>; split them before pricing, because cached input is much cheaper.</li>
      <li><strong>Pricing cache tokens like fresh input.</strong> Cache reads are typically billed at a fraction of the input price, and Claude’s cache writes at a premium over it. On long sessions most input tokens are cache reads, so getting this wrong can swing the estimate by several times.</li>
    </ol>

    <h2>From tokens to dollars</h2>
    <p>For each request: tokens in each category × that model’s price per million tokens, summed. Group the results by session id and you have cost per session. Two caveats:</p>
    <ul>
      <li>This is the <strong>API list-price equivalent</strong>. On a subscription you are not billed per token, but the number is still a useful, consistent measure of how hard a session is pushing your limits.</li>
      <li>When Cursor stores no token count for a response, the best you can do is estimate from text length (about 4 characters per token), and you should label that row as an estimate.</li>
    </ul>

    <h2>Doing it with one command</h2>
    <p>LoopGuard’s open-source CLI reads all three sources, de-duplicates and prices them, and keeps an incremental index so repeat reports are fast:</p>
    <pre>{`npm i -g loopguard-cli   # puts \`loopguard\` on your PATH (one-off: npx loopguard-cli <command>)

loopguard report --by session            # or --by day | agent | model
loopguard report --since 2026-10-01 --agent codex
loopguard report --by model --json       # machine-readable, for scripts and spreadsheets`}</pre>
    <p>Example output (from LoopGuard’s test fixtures, one small session per agent):</p>
    <pre>{SAMPLE}</pre>
    <p>Default prices are a built-in list-price table. If you pay different rates or use a model it does not know, override it in <code>~/.loopguard/pricing.json</code>:</p>
    <pre>{`{ "my-model": { "input": 2, "output": 8, "cacheRead": 0.2, "cacheWrite": 0 } }`}</pre>

    <h2>Reading the numbers</h2>
    <ul>
      <li><strong>One session dominates the total.</strong> Very common: a session left open for days keeps growing its context and re-sending it. Start fresh sessions more often, and consider a per-session cap.</li>
      <li><strong>High CACHE R relative to INPUT</strong> means prompt caching is working. High fresh INPUT on every turn usually means the cache keeps expiring (long pauses between turns) or the context is being rebuilt.</li>
      <li><strong>Large CACHE W</strong> on Claude means a lot of new context is being cached: big files pasted in, many tools/skills loaded, or frequent context changes.</li>
      <li><strong>Compare --by model.</strong> Routine work on the most expensive model is the easiest saving there is.</li>
    </ul>

    <h2>From tracking to limits</h2>
    <p>A report tells you what happened. If you also want something to stop the next expensive session, the same CLI installs hooks that deny tool calls once a session or daily dollar cap is reached, and catches repeated identical tool calls. See <a href={`/guides/${loops.slug}`}>{loops.title}</a>, or the per-tool guides: <a href="/guides/claude-code-spending-limit">Claude Code spending limit</a>, <a href="/guides/limit-cursor-agent-costs">limiting Cursor agent costs</a> and <a href="/guides/codex-cli-spending-limit">capping Codex CLI spend</a>.</p>
    <p>Other good tools: <a href="https://github.com/ryoppippi/ccusage">ccusage</a> is a popular reporting CLI if you only need reports, and Claude Code’s built-in <code>/cost</code> command shows the current session. For history across several machines, LoopGuard Pro’s dashboard receives aggregate numbers only (tokens and cost per agent, session, model and day; never prompts or code) when you run <code>loopguard sync</code>; <code>loopguard sync --dry-run</code> prints the exact payload first.</p>

    <Related slug={SLUG} />
  </main>);
}
