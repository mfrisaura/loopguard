import { articleJsonLd, guide, guideMetadata, GUIDES } from '../guides';

const SLUG = 'stop-runaway-ai-coding-agent-loops' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  const other = GUIDES.find(x => x.slug !== SLUG)!;
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 18, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">A coding agent that keeps retrying the same failing step can spend more in one unattended hour than in a normal day. Here is how to stop one that is running now, why “please stop after 3 tries” in a prompt is not a real limit, and how to put limits outside the model using the hook systems Claude Code, Codex CLI and Cursor all ship.</p>

    <h2>What a runaway loop looks like</h2>
    <ul>
      <li><strong>The retry loop.</strong> Run the tests, see the same failure, make the same edit (or none), run the tests again. The tool call is literally identical each time.</li>
      <li><strong>The re-read loop.</strong> The agent keeps re-opening the same files or re-running the same search because it lost track of what it already knows.</li>
      <li><strong>The cost spiral.</strong> No single call looks wrong, but every turn re-sends a large context, so spend climbs fast. Long sessions are the usual culprit: the context grows each turn and you pay for it again on every request.</li>
    </ul>
    <p>On an API key each of those turns is billed. On a subscription (Claude Pro/Max, ChatGPT plans, Cursor plans) the same loop burns your 5-hour or weekly usage limit instead, which is how people end up locked out mid-week.</p>

    <h2>Stop it right now</h2>
    <ul>
      <li><strong>Claude Code / Codex CLI:</strong> press <code>Esc</code> to interrupt the current turn, or <code>Ctrl+C</code> to exit.</li>
      <li><strong>Cursor:</strong> click Stop in the agent panel.</li>
    </ul>
    <p>Then look at what it was doing before you restart it. If the same command failed several times in a row, the agent usually needs new information (the real error, a missing file, a decision from you), not another attempt. Starting a fresh session with a short summary is often cheaper than continuing a huge one.</p>

    <h2>Why a prompt is not a limit</h2>
    <p>Instructions such as “stop after three attempts” or “don’t spend more than $5” live inside the model’s context. The model can forget them, reinterpret them, or never see them again after the conversation is compacted. It also has no idea what anything costs. A limit you can rely on has to be enforced by something that runs <em>outside</em> the model and can refuse to let it continue.</p>

    <h2>The enforcement point: agent hooks</h2>
    <p>All three agents can run a command of yours before every tool call, and that command can refuse the call:</p>
    <table>
      <thead><tr><th>Agent</th><th>Config file</th><th>Block a tool call</th><th>End the session</th></tr></thead>
      <tbody>
        <tr><td>Claude Code</td><td><code>~/.claude/settings.json</code></td><td><code>PreToolUse</code> hook returns <code>permissionDecision: &quot;deny&quot;</code></td><td>Return <code>{`{"continue": false}`}</code></td></tr>
        <tr><td>Codex CLI</td><td><code>~/.codex/hooks.json</code></td><td><code>PreToolUse</code> hook exits with code 2, reason on stderr</td><td>Keep denying tool calls</td></tr>
        <tr><td>Cursor</td><td><code>~/.cursor/hooks.json</code></td><td><code>preToolUse</code> hook returns <code>{`{"permission": "deny"}`}</code></td><td>Keep denying tool calls</td></tr>
      </tbody>
    </table>
    <p>The logic a loop guard needs is simple to describe: fingerprint each tool call (tool name + exact input), count identical fingerprints in a recent time window, and deny once the count passes a threshold. For spend, read the agent’s own usage log, price the tokens, and deny once the session or the day passes a dollar cap. The hard parts are the details: three different log formats, de-duplicating streamed messages, staying fast enough to run on every tool call, and never breaking the agent when your hook itself has a bug.</p>

    <h2>Doing it with LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that does exactly the above for Claude Code, Codex CLI and Cursor at once. It reads the usage logs the agents already write (no proxy, no API keys, works on subscriptions) and installs itself as a hook in each agent.</p>
    <pre>{`npm i -g loopguard-cli   # puts \`loopguard\` on your PATH (one-off: npx loopguard-cli <command>)

loopguard init      # detects ~/.claude, ~/.codex, ~/.cursor; backs up each config first
loopguard status    # today's spend vs caps, which agents are guarded, last 5 trips`}</pre>
    <p>Restart any running agent sessions so they pick up the hooks. The default rules (stored in <code>~/.loopguard/config.json</code>):</p>
    <table>
      <thead><tr><th>Rule</th><th>Default</th><th>What happens</th></tr></thead>
      <tbody>
        <tr><td>Identical tool call repeated</td><td>5× within 10 min</td><td>The call is denied with a message telling the agent to try a different approach. The 3rd denial in a row ends the session.</td></tr>
        <tr><td>Cost spiral</td><td>$10 within 5 min</td><td>Denied and the session is halted.</td></tr>
        <tr><td>Session cap</td><td>$25</td><td>Denied and the session is halted.</td></tr>
        <tr><td>Daily cap (all agents, local day)</td><td>$100</td><td>Denied and the session is halted.</td></tr>
        <tr><td>Warning</td><td>80% of a cap</td><td>Claude Code shows a warning message.</td></tr>
      </tbody>
    </table>
    <p>Tune them to how you work:</p>
    <pre>{`loopguard config set sessionCapUsd 10
loopguard config set dailyCapUsd 40
loopguard config set loop.maxRepeats 4
loopguard pause 15   # bypass enforcement for 15 minutes when you really mean it
loopguard resume`}</pre>
    <p>When a rule trips, the agent sees a plain reason, for example <code>LoopGuard: loop detected — identical Bash call 5x in 600s. Blocked; try a different approach.</code> Every trip is logged to <code>~/.loopguard/trips.jsonl</code>. <code>loopguard uninstall</code> removes only LoopGuard’s hook entries; <code>loopguard uninstall --restore</code> puts the original config files back byte-for-byte.</p>

    <h2>For overnight and unattended runs</h2>
    <ul>
      <li>Set a session cap you would be comfortable losing while asleep, and a daily cap below your real budget.</li>
      <li>Give long jobs one clear milestone and a test command that decides “done”, so the agent has a stop condition other than your patience.</li>
      <li>With the optional Pro dashboard, run <code>loopguard sync</code> on a schedule (for example from cron every few minutes). Each sync uploads aggregate usage and new trips, sends trip alerts by email, Slack or Discord, and applies a pause you set from your phone. <code>loopguard sync --dry-run</code> prints exactly what would be sent; prompts and code never leave your machine.</li>
    </ul>

    <h2>Limits worth knowing</h2>
    <ul>
      <li>Costs are <strong>estimates</strong> at API list prices, computed from local logs. They will not match a subscription bill, but they are a consistent measure of how hard a session is pushing your limits.</li>
      <li>Checks run when the agent calls a tool or finishes a turn. A single long model response is not cut off mid-stream; the limit applies at the next step.</li>
      <li>Codex CLI and Cursor have no documented “halt” field for this, so LoopGuard ends their sessions by repeatedly denying tool calls.</li>
      <li>Hooks only see the agent’s own tool calls. A script the agent wrote that calls a model API in a loop is outside their reach; use your provider’s spend limits for API keys too.</li>
      <li>LoopGuard fails open: if it hits an internal error, your agent keeps working and the error goes to <code>~/.loopguard/errors.log</code>.</li>
    </ul>

    <h2>Related</h2>
    <p><a href={`/guides/${other.slug}`}>{other.title}</a> · <a href="https://github.com/mfrisaura/loopguard">LoopGuard on GitHub</a> · <a href="/#pricing">Pricing</a></p>
  </main>);
}
