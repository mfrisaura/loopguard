import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'cline-stuck-in-loop' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 26, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Cline runs on your own API key (or Cline credits), and with auto-approve on it keeps going on its own: read a file, edit, run the tests, read the error, edit again. When the model keeps making the same fix and the same test keeps failing, every turn re-sends the whole conversation and the task cost in the header climbs fast. This guide covers how to stop it now, how to get your code back, how to restart without walking back into the same loop, and the limits that keep the next one small.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>Stop it:</strong> hit Cancel on the running task. Nothing else runs until you send a message.</li>
      <li><strong>Get your code back:</strong> restore the checkpoint from before the loop started (or use git).</li>
      <li><strong>Restart clean:</strong> start a new task with what you learned, not “try again” in the same one.</li>
      <li><strong>Bound the next one:</strong> keep command auto-approval narrow, use a key with its own spend limit, and keep an eye on the task cost.</li>
    </ul>

    <h2>1. What a Cline loop looks like</h2>
    <p>The common shapes:</p>
    <ul>
      <li>The same terminal command (usually a test or build) runs again and again with the same error, with a small edit in between that doesn’t change the outcome.</li>
      <li>Two edits undo each other: the model fixes A and breaks B, then fixes B and breaks A.</li>
      <li>A tool call keeps failing the same way (a file path that doesn’t exist, an edit block that doesn’t match the file, a malformed tool call from a weaker model) and the model keeps retrying it.</li>
      <li>The task keeps reading the same large files to “re-check” them. Each read adds them to the context again.</li>
    </ul>
    <p>Recent versions of Cline have some built-in protection. They watch for repeated identical tool calls and nudge the model to change course, and after a run of consecutive errors the task stops with a message that Cline ran into several errors in a row and asks you for guidance. That catches the obvious cases, like the same failing call over and over. It doesn’t catch a loop where each attempt is slightly different but nothing improves, and it doesn’t put a dollar limit on a task. Older versions had a “max requests” setting in the auto-approve menu; it was removed in v3.35, so don’t rely on finding it.</p>

    <h2>2. Stop it now</h2>
    <ul>
      <li><strong>Cancel the task.</strong> The Cancel button stops the current request and leaves the task paused. You can read what happened and decide what to do next.</li>
      <li><strong>If a terminal command is hanging</strong> (a dev server, a watch-mode test runner, an interactive prompt), stop it in the terminal too. A command that never exits is a common reason a task sits there or retries.</li>
      <li><strong>Don’t answer with “try again”.</strong> The failed attempts are all still in the context. The model sees them and tends to repeat them.</li>
    </ul>

    <h2>3. Get your code back</h2>
    <p>With checkpoints enabled, Cline snapshots your workspace as the task goes, in a shadow git repository kept separate from your own. Find a message from before the loop started:</p>
    <ul>
      <li><strong>Review the changes</strong> since that point first, so you know what the loop actually touched.</li>
      <li><strong>Restore</strong> the code to that checkpoint. Depending on your version you can roll back the files, the conversation, or both. Rolling back the files while keeping the conversation is usually what you want after a loop: you keep the record of what was tried and lose the edits.</li>
    </ul>
    <p>Checkpoints track file changes in the workspace. They don’t undo what commands did outside it: installed packages, database migrations, files written elsewhere, anything pushed. If the loop made git commits, recent versions of Cline refuse to restore a checkpoint older than those commits rather than rewriting your branch. Use <code>git reset</code> or <code>git revert</code> yourself in that case. If checkpoints are turned off in settings, git is your rollback, which is another reason to commit before a long auto-approved task.</p>

    <h2>4. Restart without walking back into it</h2>
    <p>Open a <strong>new task</strong> and give it the facts the loop uncovered:</p>
    <pre>{`The test in tests/parser.test.ts fails with "Unexpected token }" at line 42.
Changing the regex in src/parser.ts did not fix it (tried 4 times).
Before editing anything: read src/parser.ts and the test, explain the root cause,
and propose one fix. Don't run the tests more than twice.`}</pre>
    <ul>
      <li><strong>Start in Plan mode.</strong> Have it explain the cause before it gets to edit. A loop is often a wrong theory being retried; Plan mode makes the theory visible.</li>
      <li><strong>Give it the real output.</strong> Paste the full error, or have it run the failing command once and read the whole output instead of a truncated summary.</li>
      <li><strong>Switch models if the model is the problem.</strong> Malformed tool calls and edits that don’t match the file are more common on smaller models. A stronger model for the fix, then back to the cheaper one, often costs less than the loop did.</li>
      <li><strong>Narrow the files.</strong> Mention the two or three files that matter with <code>@</code> instead of letting it search and re-read the whole repo.</li>
    </ul>

    <h2>5. Limits that keep the next loop small</h2>
    <ul>
      <li><strong>Put the hard cap on the key.</strong> Cline can’t spend past what the key allows. Give it a dedicated key: a credit limit on an OpenRouter key, a spend limit on an Anthropic Console workspace, or a budget on an OpenAI project (check whether it blocks requests or only alerts). Prepaid credit with auto-reload off is the bluntest cap. If you use Cline’s own provider, check your Cline account or organization for spend limits; Cline shows a dedicated error when one is hit.</li>
      <li><strong>Keep command auto-approval narrow.</strong> Auto-approving file reads and edits is low risk. Auto-approving every terminal command is what lets a test-fix loop run unattended. Approving commands yourself, or only safe ones, puts you back in the loop every time it reruns the tests.</li>
      <li><strong>Watch the task cost.</strong> The task header shows tokens and the estimated API cost for the current task. If the cost keeps climbing and the error hasn’t changed in three or four turns, stop. The estimate depends on known model pricing; your provider’s billing page is the real number.</li>
      <li><strong>Keep context small.</strong> Long tasks re-send everything with every request. Start new tasks for new problems, and use compaction or a fresh task when a long one starts to drag.</li>
      <li><strong>Hooks.</strong> Cline supports hooks (scripts in <code>.clinerules/hooks</code> and a global hooks folder) that run at points like task start and before a tool runs, and a <code>PreToolUse</code> hook can cancel the call. That’s the place for a project-specific rule such as refusing to run the same test command a fifth time. Check the hooks documentation for your Cline version for the exact payload and output format before relying on one.</li>
    </ul>
    <p>For unattended runs (the Cline CLI in scripts or CI), also bound wall-clock time with <code>timeout</code> or your CI job’s timeout and give the job its own key with a small limit. More in <a href="/guides/ai-coding-agent-budget-ci">setting a hard budget for AI coding agents in CI</a>.</p>

    <h2>Where LoopGuard fits</h2>
    <p>LoopGuard enforces per-session and daily dollar caps and blocks no-progress repeats through the hook systems of Claude Code, Codex CLI and Cursor. It doesn’t guard Cline today, so for Cline the key-level limit above is the hard stop. If you also use one of those three agents, <code>npm i -g loopguard-cli && loopguard init</code> adds the caps in about a minute, and <code>loopguard report</code> shows what each session spent. The general patterns are in <a href="/guides/stop-runaway-ai-coding-agent-loops">how to stop runaway agent loops</a>.</p>

    <Related slug={SLUG} />
  </main>);
}
