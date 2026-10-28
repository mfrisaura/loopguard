import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'codex-stuck-in-loop' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 28, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Codex reruns the same failing command, reads the same error, makes a small edit that changes nothing, and runs it again. Each attempt re-sends the whole chat, so on a ChatGPT plan a loop eats your 5-hour or weekly window, and on an API key it eats dollars. This guide covers how to stop a looping Codex CLI session, undo what it did, restart without walking back into it, and make Codex refuse the next no-progress repeat on its own.</p>

    <h2>What a Codex loop looks like</h2>
    <ul>
      <li><strong>The same command, same failure.</strong> <code>npm test</code> fails, Codex edits a line, the test fails the same way, and it runs again.</li>
      <li><strong>The same command in different clothes.</strong> <code>bash -lc &apos;npm test&apos;</code>, then <code>npm run test 2&gt;&amp;1 | tail -50</code>, then <code>npm test</code>. Different text, same run.</li>
      <li><strong>Compaction without progress.</strong> The chat keeps showing “Context automatically compacted” while the task doesn’t move. After each compaction Codex has less of what it already tried, so it tries it again.</li>
      <li><strong>Polling.</strong> Checking a server, a build or a background terminal over and over for a result that isn’t coming.</li>
    </ul>
    <p>The common shape: nothing changes between attempts, so the next attempt can’t go differently. Run tests → fix → run tests is not a loop, and you don’t want to stop that.</p>

    <h2>Stop it now</h2>
    <ul>
      <li><strong><code>Esc</code></strong> interrupts the current turn in the Codex CLI. The chat and the edits made so far stay.</li>
      <li><strong><code>Ctrl+C</code></strong> also interrupts a running task; on an idle prompt it closes the session (same as <code>/exit</code>).</li>
      <li><strong>Steer instead of stopping.</strong> Pressing <code>Enter</code> while Codex is working adds your message to the current turn. “Stop rerunning the tests. Read the full error and explain the cause first” is often enough.</li>
      <li><strong>Background terminals keep running</strong> after you interrupt. <code>/ps</code> lists them with their recent output; <code>/stop</code> stops them all.</li>
      <li><strong>Long-running goals.</strong> If the loop is inside a <code>/goal</code> run, <code>/goal pause</code> stops Codex from picking it straight back up.</li>
    </ul>
    <p>Source: OpenAI’s <a href="https://learn.chatgpt.com/docs/developer-commands">Codex CLI command reference</a> and <a href="https://learn.chatgpt.com/docs/cli/slash-commands">slash commands</a>. Then read the last few tool calls before typing anything. If the same command produced the same error three times, the next attempt needs new information, not another run.</p>

    <h2>Undo what the loop changed</h2>
    <p>The Codex CLI has no file checkpoint to rewind to. Pressing <code>Esc</code> twice on an empty composer lets you edit your previous message and fork the chat from that point, but that rewinds the conversation, not your files. For files, use git:</p>
    <ul>
      <li><strong><code>/diff</code></strong> shows everything Codex changed, including untracked files, without leaving the session.</li>
      <li><strong><code>git restore &lt;file&gt;</code></strong> (or <code>git stash</code>) throws away a loop’s edits; <code>git clean -n</code> lists new files it created.</li>
      <li><strong>Commands with side effects</strong> (migrations, package installs, files written outside the repo) aren’t undone by git. Check what the loop actually ran.</li>
    </ul>
    <p>That is the practical case for committing before a long debugging task, or starting it with <code>codex --worktree</code> so the loop happens in a separate checkout.</p>

    <h2>Restart without walking back into it</h2>
    <ul>
      <li><strong>Give it the missing fact.</strong> Paste the exact failing output and ask for the cause before any rerun: “Don’t run the tests again until you’ve changed the code and can say why the change fixes this failure.”</li>
      <li><strong>Narrow the scope.</strong> “Only edit <code>src/auth/login.ts</code>.” Edit ping-pong between two files stops when one of them is off limits.</li>
      <li><strong>Require approval for commands.</strong> <code>/permissions</code> → Read Only (or launch with <code>--ask-for-approval on-request</code>) makes every rerun wait for you while you work out what’s wrong.</li>
      <li><strong>Start a clean chat when the context is polluted.</strong> OpenAI’s own advice for repeated compaction without progress is to stop the task and start a new chat with a short summary of the goal and the work done. Ask for a five-line summary (goal, what was tried, the exact failing output, best hypothesis), then <code>/new</code> and paste it in. <code>/fork</code> keeps the old chat if you want to compare.</li>
    </ul>

    <h2>Why “stop after 3 tries” in AGENTS.md doesn’t hold</h2>
    <p>An instruction in <code>AGENTS.md</code> is context, not a rule. The model can lose count, especially after compaction, and it can’t tell that <code>npm run test | tail</code> is the same run as <code>npm test</code>. A limit you can rely on runs outside the model, on every tool call, and can refuse it. Codex CLI has that: a <code>PreToolUse</code> hook runs before each tool call, and exiting with code 2 blocks the call and shows the reason on stderr to the model. <code>PostToolUse</code> hooks see each call’s result, which is how a guard can tell “same command, same output” from “same command, new output”.</p>

    <h2>Make Codex refuse the repeat: LoopGuard</h2>
    <p>LoopGuard is an open-source (MIT) CLI that installs those hooks. It needs no proxy and no API key, so it works on a ChatGPT plan as well as an API key. It has been tested against Codex CLI 0.163.</p>
    <pre>{`npm i -g loopguard-cli         # puts \`loopguard\` on your PATH
loopguard init --agent codex   # adds PreToolUse, PostToolUse and Stop hooks (original config backed up)
codex                          # then run /hooks and trust the three LoopGuard hooks
loopguard status               # caps, guarded agents, last 5 trips`}</pre>
    <p><strong>Trust the hooks.</strong> Codex asks you to trust new hooks. Until you do, it skips them, and in <code>codex exec</code> it does so without saying anything. What LoopGuard does on a loop (version 0.1.3):</p>
    <ul>
      <li><strong>It counts only repeats with no progress.</strong> The 5th identical tool call within 10 minutes is denied (<code>loop.maxRepeats</code> 5, <code>loop.windowSec</code> 600), but only if nothing changed in between. LoopGuard fingerprints the git working tree on every tool call and hashes each tool’s output with timestamps, durations, temp paths and pids stripped. If a file changed or the output changed (<code>3 failed</code> → <code>2 failed</code>), the count starts over.</li>
      <li><strong>It sees through cosmetic rewording.</strong> <code>npm test</code>, <code>bash -lc &apos;npm test&apos;</code>, <code>npm run test 2&gt;&amp;1 | tail -50</code> and <code>timeout 300 npm test</code> count as the same call. Different tools stay different.</li>
      <li><strong>The block message says what to do instead:</strong> stop rerunning it (including through a different command), write down the goal, what was tried, the exact failing output and the hypotheses, and find the root cause before running it again.</li>
      <li><strong>How it stops Codex.</strong> Codex hooks have no field to end a session, so LoopGuard denies the call (exit code 2, reason on stderr) and keeps denying further repeats. It can block tool calls, not force-quit the session.</li>
    </ul>
    <p>It also caps spend: LoopGuard reads the token counts Codex writes to <code>~/.codex/sessions/**/rollout-*.jsonl</code>, prices them at API list prices, and denies tool calls past a per-session cap ($25 default), a daily cap across agents ($100), or an estimated $10 jump within 5 minutes. On a ChatGPT plan that dollar figure is an estimate of how heavy a session is, not your plan percentage (see <a href="/guides/codex-usage-limit">Codex usage limits</a>).</p>
    <pre>{`loopguard config set loop.maxRepeats 4         # stricter
loopguard config set sessionCapUsd 10          # estimated $ per session
loopguard pause 15                             # bypass enforcement for 15 minutes
loopguard report --agent codex --by session    # what recent sessions would have cost at API prices`}</pre>

    <h2>What it won’t catch</h2>
    <ul>
      <li><strong>Output that changes every run</strong> for reasons the normalizer doesn’t strip (random seeds, shuffled test order) reads as progress.</li>
      <li><strong>Outside a git repo</strong> there is no file signal; repeats are judged on output alone.</li>
      <li><strong>Scripts and aliases.</strong> A script that reruns the tests, or a different runner on the same tests, looks like a different call.</li>
      <li><strong>Hooks you haven’t trusted</strong>, and Codex cloud tasks, which run remotely, outside the hooks in your local <code>~/.codex</code>.</li>
      <li>Checks run at each tool call, so a single long model response isn’t cut off mid-stream.</li>
    </ul>

    <Related slug={SLUG} />
  </main>);
}
