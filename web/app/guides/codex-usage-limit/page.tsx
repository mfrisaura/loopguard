import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'codex-usage-limit' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 23, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">“You’ve hit your usage limit” in Codex means one of your ChatGPT plan’s allowances is used up. Which one, and what you can do about it, depends on your plan and on the exact wording of the message. This guide covers the windows Codex meters, what each message means, how a usage limit differs from a rate limit, where to watch your remaining usage, and why a single long or looping session can empty a window early.</p>

    <h2>The limits on a ChatGPT plan</h2>
    <p>From OpenAI’s <a href="https://developers.openai.com/codex/pricing">Codex pricing page</a> and help articles on <a href="https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan">using Codex with your ChatGPT plan</a> and <a href="https://help.openai.com/en/articles/20001498-how-resets-work-in-codex">resets</a>:</p>
    <ul>
      <li><strong>Plus and Standard Business: a 5-hour window and a weekly window.</strong> The same usage counts against both, and you need room in both to keep working. The two can end at different times.</li>
      <li><strong>Pro ($100, $200, $500): currently no 5-hour limit</strong>, only the weekly allowance.</li>
      <li><strong>Go: a monthly allowance.</strong></li>
      <li><strong>Enterprise/Edu with flexible pricing:</strong> no fixed rate limits; usage draws on workspace credits.</li>
      <li><strong>Shared pool.</strong> Codex in the CLI, IDE extension, desktop app and cloud shares one allowance, along with ChatGPT Work and other agentic features where they apply. Cloud tasks may use more of it than local messages.</li>
    </ul>
    <p>OpenAI doesn’t publish a fixed number of messages. Its estimates for local messages per 5-hour window on Plus are 15–160 with GPT-6.1 Sol, 5–45 with GPT-6 Astra and 350–3,000 with GPT-6 Luna, and it stresses that these are not fixed limits: model, context, reasoning, tool use and caching all change how much a message uses. Fast mode uses included usage at 2.5× the Standard rate, and Ultrafast at 8×.</p>
    <p>On an API key none of this applies. You pay per token at API prices, and the controls are spend limits on the OpenAI platform (see <a href="/guides/codex-cli-spending-limit">capping Codex CLI spend</a>).</p>

    <h2>Which message did you get?</h2>
    <p>The wording depends on your plan. These are the strings in the Codex CLI source (<a href="https://github.com/openai/codex/blob/main/codex-rs/protocol/src/error.rs"><code>codex-rs/protocol/src/error.rs</code></a>, checked October 23, 2026):</p>
    <table>
      <thead><tr><th>Message starts with</th><th>What it means</th></tr></thead>
      <tbody>
        <tr><td><code>You’ve hit your usage limit. Upgrade to Pro …, visit https://chatgpt.com/settings/usage to purchase more credits or try again at …</code></td><td>Plus: an allowance is used up. Buy credits, upgrade or wait.</td></tr>
        <tr><td><code>You’ve hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits or try again at …</code></td><td>Pro: your allowance is used up (Pro currently has only the weekly window). Buy credits or wait.</td></tr>
        <tr><td><code>You’ve hit your usage limit. Upgrade to Plus to continue using Codex …</code></td><td>Free or Go.</td></tr>
        <tr><td><code>You’ve hit your usage limit. To get more access now, send a request to your admin …</code></td><td>Business and other workspace plans: an admin controls more access.</td></tr>
        <tr><td><code>You’ve hit your usage limit for &lt;name&gt;. Switch to another model now, …</code></td><td>A limit for one model or feature only. Another model still works: switch with <code>/model</code>.</td></tr>
        <tr><td><code>Your workspace is out of credits.</code> / <code>You hit your spend cap set in your workspace.</code></td><td>Credit-based workspace: the credits or a spend cap set by the owner ran out.</td></tr>
      </tbody>
    </table>
    <p>The time after “try again at” is when the exhausted window refreshes, in your computer’s local time: just a clock time if it’s today, a full date otherwise. A date several days out means it’s the weekly window, not the 5-hour one.</p>

    <h2>Usage limit or rate limit?</h2>
    <p>They are different errors in the source, and Codex treats them differently:</p>
    <ul>
      <li><strong>Usage limit</strong> (the messages above): your plan allowance is gone. Codex does not retry; the turn stops until you act or the window resets.</li>
      <li><strong>Rate limit</strong> (<code>rate limit exceeded: …</code>): a short-term throttle on requests. Codex retries it on its own with the server’s suggested delay or exponential backoff. It is not your quota.</li>
      <li><strong><code>Quota exceeded. Check your plan and billing details.</code></strong> is also terminal, and points at billing rather than a plan window.</li>
    </ul>
    <p>If you hit the limit in the middle of a turn, OpenAI says Codex can keep working on that turn, subject to fair-use limits. The next turn is the one that stops.</p>

    <h2>How to see where you stand</h2>
    <ul>
      <li><strong><code>/status</code></strong> in an active CLI session shows the chat ID, context usage and your remaining rate limits. This is the check OpenAI’s help center points to during a CLI session.</li>
      <li><strong><code>/usage</code></strong> opens the usage menu: daily, weekly or cumulative token activity (<code>/usage daily</code>, <code>/usage weekly</code>, <code>/usage cumulative</code>), or redeeming an earned reset (<a href="https://developers.openai.com/codex/cli/slash-commands">slash commands</a>).</li>
      <li><strong><code>/statusline</code></strong> can add a rate-limits item to the footer, so you see it without asking.</li>
      <li>The <a href="https://chatgpt.com/codex/settings/usage">Codex usage dashboard</a> shows current limits, reset times and credits. OpenAI suggests checking it every week or two to learn your pace.</li>
    </ul>

    <h2>What to do when you hit it</h2>
    <ul>
      <li><strong>Wait</strong> for the time in the message.</li>
      <li><strong>Use a banked reset</strong> if your account has one (<code>/usage</code>, or the usage summary that says “1 reset available”). A full reset refreshes your windows and moves your weekly reset date. It’s only consumed if it actually restores something.</li>
      <li><strong>Buy credits</strong> (Plus and Pro) to keep going past the limit without changing plans. Credits are a separate pay-as-you-go balance used after your included usage.</li>
      <li><strong>Buy an instant reset</strong>, where offered on Plus and Pro, from Usage settings in the desktop app or the weekly-limit banner. It applies immediately even if you have usage left, can’t be saved, restarts your weekly period from your next request, and OpenAI generally doesn’t refund it (<a href="https://help.openai.com/en/articles/20001507-paid-weekly-work-and-codex-rate-limit-resets">help article</a>).</li>
      <li><strong>Upgrade</strong>, or run local sessions on an API key at API rates.</li>
    </ul>
    <p>OpenAI Support doesn’t reset usage limits. Contact them only if the numbers look wrong or access hasn’t returned after the stated reset time.</p>

    <h2>Why one session empties a window</h2>
    <p>A Codex turn sends your prompt, files, chat history and tool results, and OpenAI notes that long-running tasks and sessions that hold a lot of context use far more per message. A few things make it worse:</p>
    <ul>
      <li><strong>Long sessions.</strong> Every turn re-sends a growing history. <code>/compact</code> replaces earlier turns with a summary; <code>/new</code> starts a fresh chat in the same CLI session.</li>
      <li><strong>Heavier models and speed modes.</strong> Compare the Luna and Astra estimates above: model choice changes how far a window goes by an order of magnitude. Fast and Ultrafast multiply usage.</li>
      <li><strong>Context you didn’t mean to send.</strong> A large <code>AGENTS.md</code> and every enabled MCP server add to each message. OpenAI recommends trimming both.</li>
      <li><strong>Loops.</strong> An agent that reruns the same failing command, or keeps compacting without progress, spends a full context’s worth of usage per attempt. OpenAI’s own advice when Codex repeatedly shows “Context automatically compacted” without progress: stop the task and start a new chat with a short summary of the goal and the work done. (A new chat doesn’t reset your limits.)</li>
    </ul>

    <h2>Catch a looping Codex session before it eats the window</h2>
    <p>Plan limits stop you after the usage is gone. To stop one bad session early, something has to check on every tool call. Codex CLI runs hooks for that, and LoopGuard is an open-source (MIT) CLI that installs them. It needs no proxy and no API key, so it works on a ChatGPT plan.</p>
    <pre>{`npm i -g loopguard-cli         # puts \`loopguard\` on your PATH
loopguard init --agent codex   # adds PreToolUse, PostToolUse and Stop hooks (original config backed up)
codex                          # then run /hooks and trust the three LoopGuard hooks

loopguard config set sessionCapUsd 10   # estimated $ per session (default 25)
loopguard report --agent codex --by session   # what recent sessions would have cost at API prices`}</pre>
    <ul>
      <li><strong>Trust the hooks.</strong> Codex asks you to trust new hooks. Until you do, it skips them without saying so in <code>codex exec</code>.</li>
      <li><strong>Loops:</strong> the same tool call 5 times within 10 minutes with no change to the git working tree or to the call’s output in between is denied. Cosmetic rewrites of a shell command (<code>bash -lc &apos;…&apos;</code>, <code>2&gt;&amp;1</code>, <code>| tail -50</code>) count as the same call. The block message tells Codex to stop rerunning it, write down the goal, what it tried, the exact failing output and its hypotheses, and find the root cause first.</li>
      <li><strong>Spend:</strong> LoopGuard reads the token counts Codex writes to <code>~/.codex/sessions/**/rollout-*.jsonl</code>, prices them at API list prices, and denies tool calls past a per-session cap, a daily cap, or a $10 jump within 5 minutes.</li>
      <li><strong>How it stops Codex:</strong> a denied call exits with code 2 and the reason on stderr. Codex hooks have no field to end a session, so LoopGuard ends it by denying every further tool call.</li>
    </ul>
    <p>Be clear about what this measures. LoopGuard does not read your plan percentage; the dollar figure is an estimate at API prices, which OpenAI says not to use to estimate included usage. Treat it as a consistent measure of how heavy a session is, and calibrate it against <code>/status</code> after a few days (if about $15 of estimated spend is your 5-hour window, set <code>sessionCapUsd</code> below that). Checks run at each tool call, so a single long model response isn’t cut off mid-stream.</p>

    <Related slug={SLUG} />
  </main>);
}
