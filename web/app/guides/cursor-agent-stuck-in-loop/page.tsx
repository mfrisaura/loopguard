import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'cursor-agent-stuck-in-loop' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 24, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Cursor’s agent “fixes” the bug, runs the test, gets the same failure, and fixes it again. Or it rewrites the same file back and forth. Cursor puts <a href="https://cursor.com/docs/agent/overview">no limit on the number of tool calls</a> the agent can make in a task, so nothing stops it but you. Each pass re-sends the growing chat, which burns your included usage first and then paid usage. This guide covers how to stop it, roll back what it did, restart without walking back into the same loop, and make the agent refuse the next pointless repeat on its own.</p>

    <h2>Signs the agent is looping, not iterating</h2>
    <ul>
      <li><strong>Same command, same output.</strong> <code>npm test</code> fails with the identical error three runs in a row, and no file changed in between.</li>
      <li><strong>Same command, reworded.</strong> <code>npm test</code>, then <code>npm run test 2&gt;&amp;1 | tail -40</code>, then <code>npx vitest run</code> on the same file. It looks like a new attempt and is the same one.</li>
      <li><strong>Edit ping-pong.</strong> The agent applies a change, then reverts it a few steps later, then applies it again.</li>
      <li><strong>“I see the issue now.”</strong> Every few steps, followed by the same fix.</li>
    </ul>
    <p>Edit, run the test, see a <em>different</em> result, edit again: that is normal work, and you don’t want to stop it. A loop is the case where nothing changes between attempts, so the next attempt can’t go differently.</p>

    <h2>Stop it now</h2>
    <ul>
      <li><strong>In the editor:</strong> click <strong>Stop</strong> in the agent panel. Cursor’s docs also describe <strong>steering</strong> instead of stopping (<a href="https://cursor.com/docs/agent/overview">Agent overview</a>): press <code>Cmd+Enter</code> (<code>Ctrl+Enter</code> on Windows and Linux) to send a message immediately, and it is attached to the current tool results instead of waiting in the queue. Plain <code>Enter</code> only queues it for after the current task, which is too late for a loop.</li>
      <li><strong>In the CLI (<code>cursor-agent</code>):</strong> pressing <code>Enter</code> while the agent works steers the run at a safe boundary; pressing <code>Enter</code> again interrupts the turn. If the session is running a <code>/goal</code>, <code>Ctrl+C</code> pauses the goal.</li>
      <li><strong>Check for a <code>/goal</code> or <code>/loop</code>.</strong> A goal keeps the agent working until it decides the objective is met, and <code>/loop</code> re-runs a prompt on an interval. Both are useful, and both will happily keep going in circles overnight. Stop the loop explicitly when you want it to end.</li>
    </ul>
    <p>Before you type the next instruction, scroll back through the last few tool calls. If the same command produced the same error three times, the agent needs a new fact (the real error, a file it hasn’t read, a decision from you), not another run.</p>

    <h2>Roll back what the loop changed</h2>
    <p>Cursor creates <a href="https://cursor.com/docs/agent/overview">checkpoints</a> automatically before significant changes. Click a checkpoint in the chat timeline to preview the files at that point, then restore it, or use <strong>Restore Checkpoint</strong> on an earlier request. Three things to know:</p>
    <ul>
      <li><strong>Restoring reverts files only.</strong> The looping messages stay in the conversation, so the agent still “remembers” its failed attempts and may repeat them. Restore, then start a new chat (below).</li>
      <li><strong>Checkpoints are local and separate from git.</strong> Cursor says to use them for undoing agent changes and git for everything else.</li>
      <li><strong>Commands aren’t undone.</strong> A checkpoint snapshots files the agent modified. If the loop ran a migration, installed packages or wrote files through a script, check <code>git status</code> and clean up with git. Committing or stashing before a long debugging task makes this a one-liner.</li>
    </ul>

    <h2>Restart without walking back into it</h2>
    <ul>
      <li><strong>Get a handoff note first.</strong> Ask: “Before we stop: in five lines, write the goal, what you tried, the exact failing output, and your best hypothesis.” Then open a <strong>new chat</strong> and paste it. A fresh chat is also much cheaper per step than a long one.</li>
      <li><strong>Paste the real error.</strong> Copy the exact terminal output; don’t paraphrase it. Loops often come from the agent reading a truncated tail of the output and missing the line that matters.</li>
      <li><strong>Ban the rerun.</strong> “Don’t run the tests again until you have changed the code and can explain why the change fixes this failure.”</li>
      <li><strong>Narrow the scope.</strong> “Only edit <code>src/auth/session.ts</code>.” Ping-pong between two files stops when one of them is off limits.</li>
      <li><strong>Switch models deliberately.</strong> A different model sometimes sees the problem the first one keeps missing, but on The X Subscription, Claude and GPT models in Cursor bill at API list price from the first request (see <a href="/guides/limit-cursor-agent-costs">limiting Cursor agent costs</a>), so don’t let a loop continue on the expensive one.</li>
    </ul>

    <h2>Why a rule saying “stop after 3 tries” doesn’t hold</h2>
    <p>A line in <code>.cursor/rules</code> or <code>AGENTS.md</code> is context, not enforcement. The model can lose track of which attempt it is on in a long chat, and it won’t see that <code>npm run test | tail</code> is the same run as <code>npm test</code>. A limit you can rely on has to run outside the model, on every tool call, and be able to refuse one.</p>
    <p>Cursor has exactly that: <a href="https://cursor.com/docs/hooks">hooks</a>. A <code>preToolUse</code> hook in <code>~/.cursor/hooks.json</code> runs before every agent tool call and can return <code>{`{"permission": "deny"}`}</code> with a message the agent reads. A <code>postToolUse</code> hook sees each call’s result, which is how a guard can tell “same command, same output” from “same command, new output”. Cursor also caps how many automatic follow-ups a <code>stop</code> hook can trigger (<code>loop_limit</code>, default 5).</p>

    <h2>Make Cursor refuse the repeat: LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs those hooks. No proxy, no API key.</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent cursor   # adds preToolUse, postToolUse, postToolUseFailure and stop hooks
                                # to ~/.cursor/hooks.json (original backed up first)
loopguard status                # caps, guarded agents, last 5 trips`}</pre>
    <p>Restart Cursor (or reload the window) so it loads the hooks. What happens on a loop (version 0.1.3):</p>
    <ul>
      <li><strong>Only no-progress repeats count.</strong> The same tool call 5 times within 10 minutes is denied (<code>loop.maxRepeats</code> 5, <code>loop.windowSec</code> 600), but only if nothing changed in between. LoopGuard fingerprints the git working tree on each call and hashes each tool’s output (timestamps, durations and temp paths stripped). If a file changed or the output changed (<code>3 failed</code> → <code>2 failed</code>), the count starts over, so test → fix → test keeps working.</li>
      <li><strong>Cosmetic rewording doesn’t reset it.</strong> <code>npm test</code>, <code>npm run test 2&gt;&amp;1 | tail -50</code>, <code>bash -lc &apos;npm test&apos;</code> and <code>timeout 300 npm test</code> count as the same call. Different tools stay different: <code>npx jest</code> and <code>npm test</code> are not merged.</li>
      <li><strong>The deny message tells the agent what to do instead:</strong> don’t rerun it through a different command, write down the goal, what it tried, the exact failing output and its hypotheses, and find the root cause before running it again.</li>
      <li><strong>Spend caps too.</strong> An estimated $10 jump within 5 minutes, or crossing the per-chat ($25) or daily ($100) cap, denies every further tool call. Cursor’s hooks have no documented “end the chat” field, so the agent can still reply in text, but it can’t run commands or edit files.</li>
    </ul>
    <pre>{`loopguard config set loop.maxRepeats 3      # stricter
loopguard config set sessionCapUsd 10       # estimated $ per chat
loopguard pause 15                          # bypass enforcement for 15 minutes
loopguard uninstall --agent cursor --restore   # put your original hooks.json back`}</pre>

    <h2>Limits worth knowing</h2>
    <ul>
      <li><strong>Cursor support is early.</strong> It has been tested in a live <code>cursor-agent</code> session; the Cursor editor itself hasn’t been tested live yet. Loop detection doesn’t depend on cost data, so it is the more dependable part today. Details in <a href="/guides/limit-cursor-agent-costs">limiting Cursor agent costs</a>.</li>
      <li><strong>Cloud agents aren’t covered.</strong> They only load project hooks (<code>.cursor/hooks.json</code> in the repo), not <code>~/.cursor/hooks.json</code>.</li>
      <li><strong>Output that changes every run</strong> for reasons the normalizer doesn’t strip (random seeds, shuffled test order) reads as progress. Outside a git repo, only the output signal is used.</li>
      <li><strong>Keep Cursor’s monthly spend limit set.</strong> Hooks are a second line of defense, not a replacement for the billing-side limit.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
