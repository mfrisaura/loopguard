import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'limit-cursor-agent-costs' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 19, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Cursor’s agent can run through your included usage surprisingly fast, especially on expensive third-party models or in long chats. Cursor gives you one real money control, a monthly limit on paid usage, plus a hook system you can use for finer limits. Here is what each one does, and what it doesn’t.</p>

    <h2>How Cursor charges for agent usage</h2>
    <p>Cursor currently has two families of plans, and the controls differ, so check which one you are on (your billing dashboard says):</p>
    <ul>
      <li><strong>The X Subscription</strong> (the current plans, shared with Grok): Cursor and Grok draw from one <strong>weekly included pool</strong>. Third-party models in Cursor, such as Claude or GPT, are <em>not</em> included: they are billed at API list prices from the first request, paid from your prepaid credit. Anything beyond the pool is <strong>additional usage</strong>.</li>
      <li><strong>Legacy Cursor plans</strong> (Pro, Pro+, Ultra, older Teams seats): each plan includes a monthly amount of usage. Past that, <strong>on-demand usage</strong> is billed if it is enabled.</li>
    </ul>
    <p>Either way, the agent itself has no idea what it is spending. A long agent chat re-sends its growing context on every step, and a loop (the same failing command, the same file read) repeats that cost each time.</p>

    <h2>Set the monthly spend limit</h2>
    <p>This is the control that actually stops Cursor from charging you more. From Cursor’s <a href="https://cursor.com/help/account-and-billing/spend-limits">spend limits help page</a>:</p>
    <table>
      <thead><tr><th>Plan</th><th>Where</th><th>What it caps</th></tr></thead>
      <tbody>
        <tr><td>The X Subscription, individual</td><td>Billing dashboard → <strong>Additional usage credits</strong> → <strong>Monthly additional usage limit</strong> → Edit</td><td>Paid additional usage you consume each month. Buying credit (manually or with Auto Top-up) doesn’t count toward it and doesn’t raise it.</td></tr>
        <tr><td>The X Subscription, Teams</td><td>Same setting, admins only</td><td>One limit for the whole team, fixed or per seat</td></tr>
        <tr><td>Legacy individual plans</td><td><a href="https://cursor.com/dashboard/spending">Dashboard → Spending</a> (on-demand usage must be enabled to see it)</td><td>Monthly on-demand spend</td></tr>
        <tr><td>Legacy Teams</td><td>Spending tab; turn on <strong>Only Admins Can Edit Usage Settings</strong> so members can’t raise it</td><td>Team-wide on-demand spend. When it is reached, everyone using on-demand usage loses AI features.</td></tr>
        <tr><td>Enterprise</td><td>Spending, Members and Groups tabs, or the Admin API</td><td>Team, group and per-member limits (the highest applicable one applies)</td></tr>
      </tbody>
    </table>
    <p>When a limit is reached, paid usage stops for that user until the next period or until the limit is raised; included usage keeps working. Two caveats from Cursor’s docs: enforcement isn’t instant, so usage can briefly go over, and on The X Subscription the limit pauses additional usage <em>even if prepaid credit remains</em>. If you never want to pay beyond your plan, the simplest option on a legacy plan is to leave on-demand usage off.</p>

    <h2>Spend less per session</h2>
    <ul>
      <li><strong>Watch the model.</strong> On The X Subscription, picking Claude or GPT in Cursor bills API list price from the first request. Use them deliberately, not as the default for routine edits.</li>
      <li><strong>Start new chats.</strong> A chat that has been going for hours re-sends a large context on every agent step. A fresh chat with a two-line summary is usually cheaper than continuing.</li>
      <li><strong>Stop loops early.</strong> If the agent runs the same command or edit three times, click Stop and give it the missing information instead of letting it retry.</li>
      <li><strong>Check usage regularly.</strong> Your Cursor dashboard shows usage and spend for the current period; looking once a day catches a bad week while it is still cheap.</li>
    </ul>

    <h2>What the spend limit can’t do</h2>
    <p>The spend limit is monthly and account-wide. It won’t stop one runaway chat at $5, won’t notice that the agent has run <code>npm test</code> forty times with the same result, and does nothing for the included usage you burn before paid usage begins. For that you need something that runs on every agent step.</p>
    <p>Cursor has that: <a href="https://cursor.com/docs/hooks">hooks</a>. A <code>preToolUse</code> hook in <code>~/.cursor/hooks.json</code> runs before every agent tool call and can return <code>{`{"permission": "deny"}`}</code> to block it (exit code 2 also blocks). Cursor also caps how many automatic follow-ups a <code>stop</code> hook can trigger (<code>loop_limit</code>, default 5), so a hook can’t keep the agent going forever on its own.</p>

    <h2>Loop detection and caps with LoopGuard (early Cursor support)</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs a <code>preToolUse</code> and a <code>stop</code> hook for Cursor (and the equivalent hooks for Claude Code and Codex CLI if you use them too):</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent cursor   # adds hooks to ~/.cursor/hooks.json (backed up first)

loopguard config set loop.maxRepeats 4   # identical tool calls allowed in the window (default 5)
loopguard config set sessionCapUsd 10    # estimated $ per chat (default 25)
loopguard config set dailyCapUsd 40      # estimated $ per local day, across all guarded agents (default 100)
loopguard report --agent cursor --by session   # what your recent Cursor chats cost, estimated`}</pre>
    <p>Restart Cursor (or reload the window) so it picks up the hooks. With them installed:</p>
    <ul>
      <li>Once the agent makes the same tool call (same tool, same input) 4 times within 10 minutes with the setting above, that call is denied: <code>LoopGuard: loop detected — identical Shell call 4x in 600s. Blocked; try a different approach.</code></li>
      <li>Past the session or daily cap, or after a $10 jump within 5 minutes, every tool call is denied, so the agent can’t run commands or edit files any further (it can still reply in text). Cursor’s hooks have no documented “end the chat” field, so repeated denial is how LoopGuard stops it.</li>
      <li><code>loopguard pause 15</code> lifts enforcement for 15 minutes; <code>loopguard uninstall --agent cursor --restore</code> puts your original <code>hooks.json</code> back.</li>
    </ul>

    <h2>Be clear about what is tested</h2>
    <p>LoopGuard’s Cursor support is <strong>early</strong>. The hook install and Cursor’s documented hook protocol are covered by LoopGuard’s automated tests, and its Claude Code and Codex hooks have been run against the real CLIs, but the Cursor hooks have <strong>not yet been verified in a real Cursor session</strong>. Treat them as a second line of defense and keep your monthly spend limit set. More specifically:</p>
    <ul>
      <li><strong>Dollar figures for Cursor are rough.</strong> LoopGuard reads Cursor’s local chat database (<code>state.vscdb</code>). Many responses there carry no token counts; for those it estimates output tokens from text length (about 4 characters per token) and has no input count at all, so it tends to <em>under</em>estimate. Cursor’s own billing is the source of truth. Prices for Cursor model names that LoopGuard doesn’t recognize use a fallback rate; override them in <code>~/.loopguard/pricing.json</code>.</li>
      <li><strong>Loop detection doesn’t depend on cost data</strong>, so it is the more dependable part for Cursor today.</li>
      <li><strong>Cloud agents aren’t covered.</strong> Cursor doesn’t load user-level hooks (<code>~/.cursor/hooks.json</code>) in cloud agents; this only guards the agent running on your machine.</li>
      <li>LoopGuard fails open: if it hits an internal error, Cursor keeps working and the error goes to <code>~/.loopguard/errors.log</code>. If something looks wrong, please <a href="https://github.com/mfrisaura/loopguard/issues">open an issue</a>.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
