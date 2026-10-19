import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'codex-cli-spending-limit' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 19, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">How you cap Codex CLI spend depends on how you sign in. With an API key you can set a hard monthly limit on the OpenAI platform. With a ChatGPT plan your plan limits are the ceiling, and the money risk is credits and automatic reloads. Neither gives you a dollar cap per session. Here is how to set each control, and how to add per-session and daily caps with a hook.</p>

    <h2>Which kind of Codex billing are you on?</h2>
    <p>Run <code>codex login status</code> to see whether the CLI is using a ChatGPT account or an API key.</p>
    <table>
      <thead><tr><th>Signed in with</th><th>How you pay</th><th>Native hard stop</th></tr></thead>
      <tbody>
        <tr><td>ChatGPT plan (Plus, Pro, Business)</td><td>Included usage in 5-hour windows (weekly limits may also apply), then credits if you buy them. Enterprise/Edu with flexible pricing is credit-based.</td><td>Your plan limit, unless you have credits. Optional monthly cap on automatic reloads.</td></tr>
        <tr><td>OpenAI API key</td><td>Per token at API prices</td><td>Organization or project hard spend limit (monthly)</td></tr>
      </tbody>
    </table>

    <h2>API key: set a hard spend limit on a dedicated project</h2>
    <p>Give Codex its own project and API key on the OpenAI platform, then cap that project. From OpenAI’s <a href="https://developers.openai.com/api/docs/guides/spend-limits">spend limits guide</a>:</p>
    <ol>
      <li>Open <strong>Project settings → Limits</strong>.</li>
      <li>Under <strong>Spend</strong>, choose <strong>Edit spend limit</strong> and enter a monthly amount.</li>
      <li>Turn on <strong>Enforce a hard limit</strong> and save. Without this it is only an alert.</li>
    </ol>
    <p>Once the project reaches the limit, its API requests fail with a <code>429</code> and the code <code>project_spend_limit_exceeded</code>, so Codex stops getting responses. You can set the same thing for the whole organization under <strong>Organization limits</strong>. Notes:</p>
    <ul>
      <li><strong>Spend alerts don’t stop anything.</strong> Keep them for early warning (say 50% and 80%), with the hard limit as the actual cap.</li>
      <li><strong>Enforcement isn’t instant.</strong> OpenAI says recorded spend can go slightly over while the limit propagates.</li>
      <li><strong>It’s monthly.</strong> One runaway night can use the whole month before it trips.</li>
      <li>A separate project also makes Codex’s spend easy to see on its own in the usage dashboard.</li>
    </ul>

    <h2>ChatGPT plan: plan limits, credits and automatic reload</h2>
    <p>On a ChatGPT plan, Codex runs against your included usage. When it runs out, Codex stops until the window resets, unless you have <strong>credits</strong>, which let you continue past the limit. So the controls that matter are about credits:</p>
    <ul>
      <li>Check your remaining limits inside the CLI with <code>/status</code>, or in the <a href="https://chatgpt.com/codex/settings/usage">Codex usage dashboard</a>.</li>
      <li>Credits are managed in <strong>Settings → Usage</strong> in ChatGPT (or Usage &amp; Billing in the Codex app). If you don’t want to pay past your plan, don’t keep a credit balance.</li>
      <li>If you use <strong>automatic reload</strong>, set a <strong>maximum monthly spend</strong>. OpenAI applies that cap to automatic reloads only, not to one-time credit purchases (<a href="https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans">OpenAI help</a>).</li>
      <li>Business workspaces manage credits and spend controls in workspace billing settings, as an owner.</li>
    </ul>

    <h2>Keep live API keys away from the agent</h2>
    <p>A Codex user on a subscription <a href="https://community.openai.com/t/my-codex-session-hit-its-subscription-limit-then-wrote-its-own-metered-api-runner-453-in-one-day/1389087">described a session</a> that hit its plan limit, then wrote its own script that called a metered API with a key from the project’s <code>.env</code>, and spent about $453 in one day, even though the organization had a spend limit and alerts configured. Whatever caps you set, don’t run an unattended agent in a folder with live keys it doesn’t need, and keep the keys it does need on their own capped project.</p>

    <h2>Spend less per session</h2>
    <ul>
      <li><strong>Pick the model for the task.</strong> OpenAI notes that switching to a smaller model makes plan limits last much longer; on an API key, it is also cheaper per token.</li>
      <li><strong>Mind speed and reasoning.</strong> Fast mode (<code>/fast</code>) uses included limits and credits faster, and a higher <code>model_reasoning_effort</code> produces more output tokens.</li>
      <li><strong>Keep context small.</strong> <code>/compact</code> replaces earlier turns with a summary; starting a new session for a new task is often cheaper still.</li>
    </ul>

    <h2>The gap: no per-session dollar cap</h2>
    <p>As of this writing, Codex CLI has no setting that stops a session at a dollar amount (the config reference lists an experimental token “rollout budget” that is under development and off by default). The platform limits above are monthly and account-wide, so they won’t stop one looping session at $5 or notice that the agent has run the same failing test twenty times.</p>
    <p>Codex does have <a href="https://developers.openai.com/codex/hooks">hooks</a>. A <code>PreToolUse</code> hook in <code>~/.codex/hooks.json</code> runs before shell commands, <code>apply_patch</code> edits, MCP tools and most other local tools, and can block the call by exiting with code 2 and writing a reason to stderr. That is where a per-session cap belongs.</p>

    <h2>Per-session and daily caps with LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs a <code>PreToolUse</code> and a <code>Stop</code> hook for Codex. It reads the session logs Codex already writes (<code>~/.codex/sessions/**/rollout-*.jsonl</code>), sums tokens per turn with cached input priced separately, and checks your caps on every tool call. It works with ChatGPT sign-in or an API key.</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent codex    # adds hooks to ~/.codex/hooks.json (backed up first)

loopguard config set sessionCapUsd 10   # estimated $ per session (default 25)
loopguard config set dailyCapUsd 40     # estimated $ per local day, across all guarded agents (default 100)
loopguard report --agent codex --by session`}</pre>
    <p><strong>Then trust the hooks, or they won’t run.</strong> Codex skips new or changed hooks until you review them. Open <code>codex</code>, run <code>/hooks</code>, and trust the two LoopGuard hooks. Until you do, <code>codex exec</code> skips them without any warning. Codex tracks trust by the hook’s exact definition, so if you re-run <code>loopguard init</code> from a different install (say, after switching from <code>npx</code> to a global install), trust them again. For one-off automation that already vets its hook sources, Codex also has <code>--dangerously-bypass-hook-trust</code>.</p>
    <p>With the hooks trusted:</p>
    <ul>
      <li>Past the session or daily cap, or after a $10 jump within 5 minutes, every tool call is denied with a reason such as <code>LoopGuard: today's spend across agents $40.12 reached daily cap $40.00. Stopping.</code> Codex hooks have no “end session” field, so repeated denial is how the session stops making progress.</li>
      <li>The same identical tool call 5 times within 10 minutes is denied (<code>loop.maxRepeats</code>, <code>loop.windowSec</code>).</li>
      <li><code>loopguard pause 15</code> lifts enforcement for 15 minutes; <code>loopguard uninstall --agent codex --restore</code> puts your original <code>hooks.json</code> back.</li>
    </ul>

    <h2>Limits worth knowing</h2>
    <ul>
      <li>Costs are <strong>estimates at API list prices</strong> from a built-in table. Newer model names may fall back to a related model’s price, so if your numbers matter, set your actual rates in <code>~/.loopguard/pricing.json</code>. On a ChatGPT plan you aren’t billed per token; the figure is a consistent measure of how hard a session is pushing your limits.</li>
      <li>Checks happen when Codex calls a tool or finishes a turn, so one long response isn’t cut off midway. Hosted tools such as web search don’t go through local hooks.</li>
      <li>Hooks only see Codex’s own tool calls. A script the agent writes that calls an API in a loop is outside their reach, which is why the hard project limit and the key hygiene above still matter.</li>
      <li>LoopGuard fails open: if it has an internal error, Codex keeps working and the error goes to <code>~/.loopguard/errors.log</code>.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
