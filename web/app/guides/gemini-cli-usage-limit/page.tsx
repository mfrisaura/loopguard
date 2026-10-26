import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'gemini-cli-usage-limit' as const;
export const metadata = guideMetadata(SLUG);

const SETTINGS = `{
  "model": {
    "maxSessionTurns": 60,
    "compressionThreshold": 0.5,
    "summarizeToolOutput": {
      "run_shell_command": { "tokenBudget": 2000 }
    }
  }
}`;

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 26, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Gemini CLI limits work differently from most coding agents: on a Google sign-in you get a number of model <em>requests</em> per day, not a dollar budget, and one prompt can use many requests. On an API key there is no daily ceiling at all, just a per-token bill. And since June 18, 2026, which one you’re on also decides whether Gemini CLI works for you at all. This guide covers the current limits, what to do when you hit them, and how to keep an API-key session from running up the bill.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>Free, Google AI Pro and Ultra sign-ins</strong> no longer work in Gemini CLI. Google moved those users to Antigravity CLI on June 18, 2026.</li>
      <li><strong>Code Assist Standard / Enterprise</strong> (and Workspace AI Ultra): 1,500 / 2,000 model requests per user per day.</li>
      <li><strong>Gemini API key:</strong> the unpaid tier is 250 requests a day on Flash only; paid usage has no daily request cap and is billed per token.</li>
      <li><strong>Check usage</strong> with <code>/stats model</code>. Bound sessions with <code>model.maxSessionTurns</code> and leave loop detection on.</li>
    </ul>

    <h2>1. The limits, by how you sign in</h2>
    <p>Gemini CLI’s quota depends on the authentication method, per Google’s quotas and pricing page:</p>
    <table>
      <thead><tr><th>Sign-in</th><th>Tier</th><th>Requests per user per day</th></tr></thead>
      <tbody>
        <tr><td>Google Workspace / Google Cloud</td><td>Code Assist Standard</td><td>1,500</td></tr>
        <tr><td>Google Workspace / Google Cloud</td><td>Code Assist Enterprise, Workspace AI Ultra</td><td>2,000</td></tr>
        <tr><td>Gemini API key</td><td>Free (unpaid)</td><td>250, Flash only</td></tr>
        <tr><td>Gemini API key</td><td>Paid</td><td>Varies by tier; billed per token</td></tr>
        <tr><td>Vertex AI</td><td>Express mode / paid</td><td>Varies by account; paid is billed per token</td></tr>
      </tbody>
    </table>
    <p>There are also per-minute limits, and requests can be throttled when demand is high. Two details catch people out:</p>
    <ul>
      <li><strong>A request is a model call, not a prompt.</strong> In agent mode one prompt can turn into many requests: read files, run a command, read its output, edit, run it again. A long agentic task can use dozens.</li>
      <li><strong>The daily quota is shared.</strong> For Code Assist licenses, Gemini CLI and Code Assist agent mode in the IDE draw from the same per-user daily count, across all Gemini models.</li>
    </ul>

    <h2>2. What changed on June 18, 2026</h2>
    <p>Google announced in May 2026 that Gemini CLI would stop serving requests for Gemini Code Assist for individuals (the free Google sign-in) and for Google AI Pro and Ultra subscribers on June 18, 2026. Those users are now pointed to Antigravity CLI, which keeps Gemini CLI’s core features (skills, hooks, subagents, and extensions as plugins) but isn’t a one-to-one copy. Gemini CLI still works with Code Assist Standard and Enterprise licenses, Google Cloud projects, and paid Gemini API keys.</p>
    <p>So if Gemini CLI suddenly stopped working on a personal Google account, it’s not your daily quota. Your options are to move to Antigravity CLI on the same account, or keep Gemini CLI and sign in with an API key or Vertex AI instead, which means paying per token.</p>

    <h2>3. When you hit the limit</h2>
    <ul>
      <li><strong>Daily quota on a license:</strong> requests stop until the quota resets. Nothing is lost. Your files and history are where they were.</li>
      <li><strong>Per-minute limits or capacity errors:</strong> wait a minute and retry, or switch to a lighter model for the rest of the task.</li>
      <li><strong>Switch to pay-as-you-go:</strong> Google’s recommended route for uninterrupted use is a Gemini API key or Vertex AI. That removes the daily cap, which also removes the thing that was stopping a runaway session. Put a limit back before you switch (section 5).</li>
    </ul>

    <h2>4. Check what a session is using</h2>
    <p><code>/stats model</code> shows the current session’s token usage per model and information about the limits on your current quota. Gemini CLI also prints a usage summary when you exit. On an API key, multiply the tokens by your model’s price for an estimate; the billing page in Google Cloud or AI Studio is the real number.</p>
    <p>Large input-token counts with a small output usually mean the same context is being re-sent many times: big files read repeatedly, long command output, or a long session that hasn’t been compressed.</p>

    <h2>5. Bound sessions and spending</h2>
    <p>Gemini CLI has a few settings in <code>settings.json</code> (user-level <code>~/.gemini/settings.json</code> or project-level <code>.gemini/settings.json</code>) that limit how far one session can run:</p>
    <pre>{SETTINGS}</pre>
    <ul>
      <li><strong><code>model.maxSessionTurns</code></strong>: the maximum number of turns in a session. The default is <code>-1</code> (unlimited). A finite number puts a ceiling on how long a runaway session can go.</li>
      <li><strong>Loop detection</strong> is on by default and tries to catch the agent repeating itself. Leave <code>model.disableLoopDetection</code> at <code>false</code>.</li>
      <li><strong><code>model.compressionThreshold</code></strong>: the fraction of the context window at which Gemini CLI compresses the history. Compression keeps each request smaller in long sessions.</li>
      <li><strong><code>model.summarizeToolOutput</code></strong>: summarize long tool output (for example shell commands) to a token budget instead of feeding all of it back to the model.</li>
    </ul>
    <p>On a paid API key or Vertex AI, the daily request cap is gone, so the money limit has to come from somewhere else:</p>
    <ul>
      <li><strong>Use a dedicated key and project</strong> for the CLI so its usage is separate on the bill and you can turn it off without breaking anything else.</li>
      <li><strong>Set a budget with alerts</strong> in Google Cloud Billing on that project. By default a Cloud Billing budget sends alerts; it doesn’t stop spending by itself, so watch the alerts or check what spend controls your account offers.</li>
      <li><strong>Bound headless runs.</strong> For <code>gemini -p</code> in scripts or CI, wrap the command in <code>timeout</code> (or set the CI job timeout) and use a project-level settings file with a finite <code>maxSessionTurns</code>. More in <a href="/guides/ai-coding-agent-budget-ci">setting a hard budget for AI coding agents in CI</a>.</li>
    </ul>
    <p>When a session does loop, stop it (Esc cancels the current request, Ctrl+C twice exits), undo the edits with git or <code>/restore</code> if you have checkpointing on, and start a fresh session with what you learned rather than asking it to try again in the same context.</p>

    <h2>Where LoopGuard fits</h2>
    <p>LoopGuard enforces per-session and daily dollar caps and blocks no-progress repeats through the hook systems of Claude Code, Codex CLI and Cursor. It doesn’t guard Gemini CLI or Antigravity CLI today, so for Gemini the settings and billing controls above are the limits to use. If you also use one of those three agents, <code>npm i -g loopguard-cli && loopguard init</code> adds the caps in about a minute. Related: <a href="/guides/codex-usage-limit">Codex usage limits</a> and <a href="/guides/claude-code-usage-limit">Claude Code usage limits</a>.</p>

    <Related slug={SLUG} />
  </main>);
}
