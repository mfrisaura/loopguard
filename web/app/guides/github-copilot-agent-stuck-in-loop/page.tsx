import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'github-copilot-agent-stuck-in-loop' as const;
export const metadata = guideMetadata(SLUG);

const HOOK_JSON = `{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "type": "command", "command": "node .github/hooks/repeat-guard.cjs", "timeoutSec": 10 }
    ]
  }
}`;

const HOOK_SCRIPT = `// Deny the 4th identical tool call within 10 minutes in the same session.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX = 3, WINDOW_MS = 10 * 60 * 1000;
const ev = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = crypto.createHash('sha1')
  .update(String(ev.toolName) + JSON.stringify(ev.toolArgs ?? null)).digest('hex');
const file = path.join(os.tmpdir(), 'copilot-repeat-' + String(ev.sessionId || 'x').replace(/\\W/g, '') + '.json');

let seen = {};
try { seen = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const now = Date.now();
const hits = (seen[key] || []).filter(t => now - t < WINDOW_MS);

if (hits.length >= MAX) {
  process.stdout.write(JSON.stringify({
    permissionDecision: 'deny',
    permissionDecisionReason: 'Same tool call ' + hits.length + ' times in 10 minutes with no change. ' +
      'Stop rerunning it. Summarize the goal, what you tried and the exact error, then fix the root cause.',
  }));
} else {
  seen[key] = [...hits, now];
  fs.writeFileSync(file, JSON.stringify(seen));
  process.stdout.write('{}');
}`;

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 25, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Copilot’s agent edits a file, runs the tests, gets the same failure, and edits the file again. Or it keeps rewriting one function back and forth. After a couple of dozen steps VS Code stops and asks whether you want it to keep going. This guide covers how to stop the loop, undo what it did, restart so it doesn’t walk straight back in, which settings bound it, and how to make the agent refuse an identical repeat with a hook.</p>

    <h2>Signs the agent is looping, not iterating</h2>
    <ul>
      <li><strong>Same command, same output.</strong> The terminal tool runs <code>npm test</code> three times and the failure is identical each time.</li>
      <li><strong>Edit ping-pong.</strong> The agent changes a line, then changes it back a few steps later, then changes it again.</li>
      <li><strong>The “continue?” prompt.</strong> The agent hit its request limit for this turn (below) and the task still isn’t done.</li>
      <li><strong>“I see the issue now.”</strong> Followed by the fix it already tried.</li>
    </ul>
    <p>Edit, test, a <em>different</em> result, edit again: that’s normal work. It’s a loop when nothing changes between attempts, so the next attempt can’t turn out differently.</p>

    <h2>Stop it now</h2>
    <ul>
      <li><strong>Click Stop</strong> in the Chat view (the stop button replaces Send while the agent works).</li>
      <li><strong>At the “continue?” prompt, don’t just click Continue.</strong> If the last steps were the same command and the same error, continuing buys more of the same. Stop and give it a new fact instead.</li>
      <li><strong>Read the last few tool calls first.</strong> If the same command failed the same way three times, the agent needs something it doesn’t have: the full error, a file it hasn’t opened, or a decision from you. Another attempt won’t supply it.</li>
    </ul>

    <h2>Undo what the loop changed</h2>
    <p>VS Code takes a <a href="https://code.visualstudio.com/docs/agents/run/review-code-edits">checkpoint</a> before each chat request (<code>chat.checkpoints.enabled</code>, on by default). Hover over an earlier request and choose <strong>Restore Checkpoint</strong>. That restores the files the agent changed <em>and</em> removes the later requests from the conversation, which is what you want after a loop: the failed attempts are gone from the context too. <strong>Redo</strong> brings them back if you went too far.</p>
    <ul>
      <li><strong>Terminal commands aren’t undone.</strong> Installs, migrations, files written by scripts and anything sent over the network stay. Check <code>git status</code> and clean up with git.</li>
      <li><strong>Checkpoints are temporary.</strong> Commit or stash before a long debugging task so you have a point to return to that doesn’t depend on the chat.</li>
      <li><strong>Edit the request instead.</strong> Editing an earlier prompt reverts that request’s changes and everything after, then resends your new wording. Handy when the original instruction is what sent it in circles.</li>
    </ul>

    <h2>Restart without walking back into it</h2>
    <ul>
      <li><strong>Ask for a handoff note</strong> before you stop: “In five lines: the goal, what you tried, the exact failing output, your best hypothesis.” Then start a new chat session with that note. A fresh, short chat also uses far less context per step.</li>
      <li><strong>Paste the real error.</strong> Loops often start because the agent read a truncated tail of the output. Copy the whole failing block.</li>
      <li><strong>Forbid the rerun.</strong> “Don’t run the tests again until you have changed the code and can explain why the change fixes this failure.”</li>
      <li><strong>Narrow the scope.</strong> Attach only the files that matter with <code>#file</code>, and say which files it may edit. Ping-pong between two files stops when one is off limits.</li>
      <li><strong>Switch models deliberately.</strong> A different model sometimes spots what the first keeps missing. Check the model’s premium-request multiplier before you do.</li>
    </ul>

    <h2>The settings that bound a loop</h2>
    <ul>
      <li><strong><code>chat.agent.maxRequests</code></strong> (default <code>25</code>): the most requests the agent makes in one turn before VS Code asks whether to continue. Lower it if you’d rather be asked sooner; raising it lets a loop run longer unattended.</li>
      <li><strong>Terminal auto-approve.</strong> If you’ve auto-approved terminal commands, the agent can rerun them without asking. Keep test and build commands on manual approval while you’re debugging something stubborn, and you’ll see each repeat before it runs.</li>
      <li><strong><code>github.copilot.chat.agent.autoFix</code></strong> (default on): the agent automatically tries to fix problems in the code it just generated. Usually helpful; worth knowing about when you see unrequested follow-up edits.</li>
    </ul>

    <h2>What a loop costs on Copilot</h2>
    <p>Copilot bills <a href="https://docs.github.com/en/copilot/concepts/billing/copilot-requests">premium requests</a>, not tokens. In agent mode, each prompt <em>you</em> send counts as one premium request multiplied by the model’s rate; the tool calls the agent makes on its own don’t add requests. So a loop inside one turn mostly costs time, but each “try again” you type, on a model with a high multiplier, eats into your allowance, and after that into paid usage.</p>
    <p>To cap the money side, open <a href="https://github.com/settings/billing">github.com/settings/billing</a> → <strong>Budgets and alerts</strong>, create a budget for Copilot premium requests (or a bundled premium requests budget), and tick <strong>Stop usage when budget limit is reached</strong>. Without that box ticked, a budget only sends emails. For organizations, the “Premium request paid usage” policy decides whether users can go past their allowance at all.</p>

    <h2>Why “stop after 3 tries” in your instructions doesn’t hold</h2>
    <p>A line in <code>.github/copilot-instructions.md</code> is context, not enforcement. In a long chat the model loses count, and it won’t notice that <code>npm test</code> and <code>npx vitest run</code> on the same file are the same attempt. A limit you can rely on has to run outside the model, on every tool call, and be able to refuse one. Copilot has that: <a href="https://code.visualstudio.com/docs/agent-customization/hooks">agent hooks</a> (in preview).</p>

    <h2>Make Copilot refuse an identical repeat with a hook</h2>
    <p>In the Copilot harness, a <code>preToolUse</code> hook receives the tool name and arguments as JSON on stdin and can answer <code>{`{"permissionDecision": "deny"}`}</code> with a reason the agent reads. Hooks load from <code>.github/hooks/*.json</code> in the repository or <code>~/.copilot/hooks/</code> for all your projects. Here’s a minimal repeat guard. Create <code>.github/hooks/repeat-guard.json</code>:</p>
    <pre>{HOOK_JSON}</pre>
    <p>and <code>.github/hooks/repeat-guard.cjs</code> (needs Node.js):</p>
    <pre>{HOOK_SCRIPT}</pre>
    <p>Start a new Copilot session so it picks up the hook, and test it on something harmless first. Things to know:</p>
    <ul>
      <li><strong>It counts exact repeats only.</strong> <code>npm test</code> and <code>npm test 2&gt;&amp;1 | tail -40</code> look different to it, and a legitimate test → fix → test cycle with the same command will trip it after three runs. A better guard also checks whether files or the output changed between calls.</li>
      <li><strong>Failure behavior matters.</strong> GitHub documents that a <code>preToolUse</code> command that errors denies the tool call, while a timeout falls through to normal permissions. Keep the script fast and test it with a sample event.</li>
      <li><strong>Hooks run as code on your machine.</strong> Review any hook before you enable it, especially ones that come with a repository.</li>
    </ul>

    <h2>Where LoopGuard fits</h2>
    <p>LoopGuard is an open-source CLI that does this properly for Claude Code, Codex CLI and Cursor: it only counts repeats when nothing changed (it fingerprints the git working tree and each tool’s output), treats reworded commands as the same call, and adds per-session and daily dollar caps. It doesn’t install into Copilot yet, so for Copilot use the settings, budget and hook above. If you also run one of those agents, see <a href="/guides/stop-runaway-ai-coding-agent-loops">how to stop runaway agent loops</a> or <a href="/guides/cursor-agent-stuck-in-loop">Cursor agent stuck in a loop</a>.</p>

    <Related slug={SLUG} />
  </main>);
}
