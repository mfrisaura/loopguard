import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'claude-code-stuck-in-loop' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 23, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Claude Code runs the same failing command again, gets the same error, and runs it again. Or it flips a file back and forth between two versions. Every one of those turns re-sends the whole conversation, so a loop costs more the longer it goes. This guide covers how to stop one right now, how to undo what it did, how to restart without walking back into it, and how to make Claude Code refuse the next repeat on its own.</p>

    <h2>What the loop usually looks like</h2>
    <ul>
      <li><strong>The same failing command, unchanged.</strong> A <a href="https://github.com/anthropics/claude-code/issues/19699">bug report on the Claude Code repo</a> shows Claude running <code>ssh … &quot;make run-runner&quot; 2&gt;&amp;1</code> seven times in a row, each time getting <code>make: *** No rule to make target</code>, until the user interrupted.</li>
      <li><strong>The same command, reworded.</strong> <code>npm test</code>, then <code>npm run test 2&gt;&amp;1 | tail -50</code>, then <code>bash -lc &apos;npm test&apos;</code>. Different text, same run, same failure.</li>
      <li><strong>Edit ping-pong.</strong> Two edits that undo each other, or the same line rewritten each turn while the test keeps failing.</li>
      <li><strong>Re-reading.</strong> Opening the same files and running the same searches because the useful context was compacted away.</li>
    </ul>
    <p>The common shape: nothing changes between attempts, so the next attempt can’t go differently. A healthy fix-and-rerun cycle (run the test, edit the code, run the test) is not a loop, and you don’t want to stop that.</p>

    <h2>Stop it now</h2>
    <p>From Claude Code’s <a href="https://code.claude.com/docs/en/interactive-mode">interactive mode reference</a>:</p>
    <ul>
      <li><strong><code>Esc</code></strong> stops the current response or tool call mid-turn so you can redirect it. Claude keeps the work done so far.</li>
      <li><strong><code>Ctrl+C</code></strong> interrupts a running operation (useful for a hung command). With nothing running, a first press clears the input and a second press exits.</li>
      <li><strong>Background commands keep going</strong> until they finish or you stop them. Open <code>/tasks</code> to stop one; Claude Code also cleans up background tasks when it exits.</li>
    </ul>
    <p>Then, before typing anything, read the last few tool calls. If the same command produced the same error three times, the next attempt needs new information (the real error, a file it hasn’t read, a decision from you), not another run.</p>

    <h2>Undo what the loop changed</h2>
    <p>Press <code>Esc</code> twice with an empty prompt, or run <code>/rewind</code>, to open the rewind menu (<a href="https://code.claude.com/docs/en/checkpointing">checkpointing docs</a>). Pick the prompt from before the loop started, then restore code, conversation, or both. Two limits:</p>
    <ul>
      <li><strong>Files changed only by Bash commands aren’t tracked.</strong> If the loop ran a script or a migration that wrote files Claude never edited with its edit tools, rewind won’t revert them. Use git.</li>
      <li><strong>Most subagent edits aren’t captured</strong> in your session’s checkpoints either. Again, git is the reliable undo.</li>
    </ul>
    <p>That is the practical argument for committing (or at least <code>git stash</code>-ing) before you hand Claude a long debugging task.</p>

    <h2>Restart without walking back into it</h2>
    <ul>
      <li><strong>Give it the missing fact.</strong> “The last command exited non-zero with this error: … Read it and tell me the cause before running anything.” Paste the exact output; don’t paraphrase it.</li>
      <li><strong>Forbid the rerun explicitly.</strong> “Don’t run the tests again until you’ve changed the code and can explain why the change fixes this failure.”</li>
      <li><strong>Narrow the scope.</strong> “Only edit <code>src/auth/login.ts</code>.” Ping-pong between two files stops when one of them is off limits.</li>
      <li><strong>Start clean when the context is polluted.</strong> In the rewind menu, <strong>Summarize from here</strong> compresses the loop into a summary and keeps your earlier instructions. If the whole session is noise, ask Claude for a five-line summary (goal, what was tried, the exact failing output, best hypothesis), then <code>/clear</code> and paste it into a fresh session.</li>
    </ul>
    <p>One more trap: if the session hits your plan’s usage limit mid-loop, Claude Code can wait and continue the interrupted task on its own after the reset (see <a href="/guides/claude-code-usage-limit">Claude Code usage limits</a>). A looping session will pick the loop back up and spend the next window the same way, so check what it was doing before you let it continue.</p>

    <h2>Why “stop after 3 tries” in CLAUDE.md doesn’t hold</h2>
    <p>An instruction in <code>CLAUDE.md</code> or the prompt is context, not a rule. The model can miss that it is on try number four, especially after compaction, and it can’t see that <code>npm run test | tail</code> is the same run as <code>npm test</code>. A limit you can rely on has to run outside the model, on every tool call, and be able to refuse it. In Claude Code that is a <a href="https://code.claude.com/docs/en/hooks"><code>PreToolUse</code> hook</a>: it runs before each tool call and can return <code>permissionDecision: &quot;deny&quot;</code> with a reason Claude reads, or <code>{`{"continue": false}`}</code> to end the session. <code>PostToolUse</code> and <code>PostToolUseFailure</code> hooks see each call’s result, which is how a guard can tell “same command, same output” from “same command, new output”.</p>

    <h2>Make Claude Code refuse the repeat: LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs those hooks. It needs no proxy and no API key, so it works on Pro and Max as well as API billing.</p>
    <pre>{`npm i -g loopguard-cli          # puts \`loopguard\` on your PATH
loopguard init --agent claude   # adds PreToolUse, PostToolUse, PostToolUseFailure and Stop hooks
                                # to ~/.claude/settings.json (original backed up first)
loopguard status                # caps, guarded agents, last 5 trips`}</pre>
    <p>Restart running Claude Code sessions so they load the hooks. What it does on a loop (version 0.1.3):</p>
    <ul>
      <li><strong>It counts only repeats with no progress.</strong> The same tool call 5 times within 10 minutes is denied (<code>loop.maxRepeats</code> 5, <code>loop.windowSec</code> 600), but only if nothing changed in between. With <code>loop.progressAware</code> on (the default), LoopGuard fingerprints the git working tree on every tool call (<code>git status</code> plus a hash of each changed file) and hashes each tool’s output with timestamps, durations, temp paths and pids stripped. If you or Claude edited a file, or the output changed (<code>3 failed</code> → <code>2 failed</code>), the count starts over. So run tests → fix → run tests keeps working.</li>
      <li><strong>It sees through cosmetic rewording.</strong> With <code>loop.normalizeShell</code> on (the default), <code>npm test</code>, <code>npm run test 2&gt;&amp;1 | tail -50</code>, <code>bash -lc &apos;npm test&apos;</code>, <code>cd &lt;current dir&gt; &amp;&amp; npm test</code> and <code>timeout 300 npm test</code> count as the same call. Different tools stay different: <code>npx jest</code> and <code>npm test</code> are not merged.</li>
      <li><strong>The block message says what to do instead.</strong> Claude is told the call was blocked, not to rerun it through a different command, to write down the goal, what it tried, the exact failing output and its hypotheses (in its reply or in <code>.loopguard/checkpoint.md</code>), and to find the root cause before running it again. The point is to turn a blind retry into a diagnosis.</li>
      <li><strong>The 3rd loop block in a row ends the session</strong>, with a message asking Claude to hand what it knows back to you.</li>
    </ul>
    <p>It also caps spend: an estimated $10 jump within 5 minutes ends the session (<code>loop.spiralUsd</code>), and there are per-session and daily caps ($25 and $100 by default), priced at API list prices from the transcripts Claude Code writes, subagents included.</p>
    <pre>{`loopguard config set loop.maxRepeats 4      # stricter
loopguard config set loop.progressAware false   # count every identical call, progress or not
loopguard pause 15                          # bypass enforcement for 15 minutes
tail ~/.loopguard/trips.jsonl               # every block, with the reason`}</pre>

    <h2>What it won’t catch</h2>
    <ul>
      <li><strong>Output that changes every run</strong> for reasons the normalizer doesn’t strip (random seeds, shuffled test order) reads as progress, so that loop isn’t caught. A polling command whose output never changes is.</li>
      <li><strong>Outside a git repo</strong> there is no file signal, and repeats are counted on the output signal alone.</li>
      <li><strong>Scripts and aliases.</strong> Normalization doesn’t look inside a script, or notice a different test runner invoked on the same tests.</li>
      <li><strong>Work outside Claude’s tool calls.</strong> A background process or a script the agent wrote that loops on its own runs outside the hooks. Stop those from <code>/tasks</code> and keep live API keys away from unattended sessions.</li>
      <li>Checks run at each tool call, so a single long response isn’t cut off mid-stream.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
