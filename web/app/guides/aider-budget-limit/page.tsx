import { articleJsonLd, guide, guideMetadata } from '../guides';
import { Related } from '../related';

const SLUG = 'aider-budget-limit' as const;
export const metadata = guideMetadata(SLUG);

export default function Page() {
  const g = guide(SLUG);
  return (<main className="prose">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(SLUG) }} />
    <p className="mut"><a href="/guides">Guides</a> · Updated October 25, 2026</p>
    <h1>{g.title}</h1>
    <p className="lead">Aider is bring-your-own-key: every message goes straight to your model provider and lands on your API bill. Aider has no setting that stops a session at a dollar amount. What it does have is a live cost readout, a few settings that control how many tokens each message sends, and a built-in cap on its own fix-and-retry cycles. The hard limit has to live at the provider. This guide covers all three layers and how to set them up so a long session can’t surprise you.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>Hard cap:</strong> set it on the API key or project at your provider (OpenRouter key credit limit, Anthropic Console workspace limit, OpenAI project budget). Aider can’t spend past what the key is allowed to.</li>
      <li><strong>Watch:</strong> read the <code>Cost: $x message, $y session.</code> line Aider prints after every reply, and run <code>/tokens</code> before a big request.</li>
      <li><strong>Shrink each message:</strong> <code>/drop</code> files you’re done with, <code>/clear</code> between tasks, and set <code>--max-chat-history-tokens</code>.</li>
      <li><strong>Scripts and CI:</strong> wrap <code>aider --message</code> in <code>timeout</code> and give the job its own key with its own limit.</li>
    </ul>

    <h2>1. Put the hard limit on the API key</h2>
    <p>Because Aider calls the provider directly with your key, the only place a real dollar limit can be enforced is the provider. Give Aider its own key so the limit applies to Aider alone and its usage shows up separately on the bill:</p>
    <ul>
      <li><strong>OpenRouter:</strong> when you create a key you can give it a credit limit. Once the key has spent that much, requests with it fail. Good for a per-project or per-month Aider budget, and it works with any model OpenRouter routes to.</li>
      <li><strong>Anthropic:</strong> in the Claude Console, create a workspace for Aider, set a spend limit on the workspace, and create the API key inside it.</li>
      <li><strong>OpenAI:</strong> create a project for Aider, set its budget, and use a key from that project. Check in the dashboard whether the budget on your account blocks requests or only sends alerts, and set alerts either way.</li>
      <li><strong>Prepaid credit</strong> is the bluntest cap there is: with auto-reload off, a key can’t spend more than the balance.</li>
    </ul>
    <p>When the limit trips, Aider shows the provider’s error and the request fails. Nothing is lost: your files and Aider’s git commits are still there.</p>

    <h2>2. Read the cost line, and know when it’s missing</h2>
    <p>After each reply Aider prints something like:</p>
    <pre>{`Tokens: 18k sent, 6.1k cache hit, 412 received. Cost: $0.03 message, $1.84 session.`}</pre>
    <p>The session figure is the running total since you launched Aider. It resets when you quit, so it is a per-session meter, not a history. Two caveats:</p>
    <ul>
      <li><strong>No pricing, no cost.</strong> Aider only prints a dollar figure when it knows the model’s per-token price. For a model it doesn’t recognize, you get the token counts only. Add the price yourself in <code>.aider.model.metadata.json</code> (or point <code>--model-metadata-file</code> at one) so the estimate shows up.</li>
      <li><strong>It’s an estimate.</strong> It comes from public list prices and the usage the provider reports. Your provider’s billing page is the real number.</li>
    </ul>
    <p>For what the <em>next</em> message will cost, run <code>/tokens</code>. It breaks the request down into system prompt, chat history, repo map and each added file. Every part is re-sent with every message, so the biggest line on that list is what to cut.</p>

    <h2>3. Make every message smaller</h2>
    <p>Aider sends the files in the chat, the repo map and the chat history with each request. A session gets more expensive per message as it goes, even if your prompts stay short. The settings that matter most:</p>
    <ul>
      <li><strong>Only add files that need editing.</strong> Use <code>/read-only</code> for reference files, and <code>/drop</code> a file as soon as you’re done with it. Aider warns when you add a lot of files for a reason.</li>
      <li><strong><code>/clear</code> between tasks.</strong> It drops the chat history but keeps the files. <code>/reset</code> drops both.</li>
      <li><strong><code>--max-chat-history-tokens</code>.</strong> A soft limit: when the history passes it, Aider summarizes the older messages with the weak model. Lower it to keep long sessions lean, for example <code>aider --max-chat-history-tokens 8000</code>.</li>
      <li><strong><code>--map-tokens</code>.</strong> The repo map defaults to 1024 tokens and grows when no files are in the chat. Lower it in huge repos, or set it to <code>0</code> when you’re adding the right files yourself. Large repos also benefit from <code>--subtree-only</code> and an <code>.aiderignore</code>.</li>
      <li><strong><code>--cache-prompts</code></strong> on models that support prompt caching (Anthropic, DeepSeek and others). Re-sent context that hits the cache is billed at a fraction of the normal input price.</li>
      <li><strong>Cheaper models where they’re good enough.</strong> <code>--weak-model</code> handles commit messages and summaries. In architect mode, <code>--editor-model</code> can be a cheaper model than the one doing the planning.</li>
      <li><strong>Thinking budgets.</strong> <code>--thinking-tokens</code> and <code>--reasoning-effort</code> (or <code>/think-tokens</code> and <code>/reasoning-effort</code> mid-chat) cap how much a reasoning model thinks per reply. Thinking tokens are billed as output.</li>
    </ul>

    <h2>4. Aider’s own retry limit</h2>
    <p>Aider loops less than agentic tools because you drive each turn. Its one automatic cycle is the fix-and-retry after an edit: if the edit didn’t apply cleanly, or lint fails, or tests fail with <code>--auto-test</code> and <code>--test-cmd</code> set, Aider sends the error back to the model and tries again. That cycle is capped at three reflections per message; after that you see <code>Only 3 reflections allowed, stopping.</code> Lint and test fixes also ask first (“Attempt to fix lint errors?”) unless you run with <code>--yes-always</code>.</p>
    <p>The loop you actually pay for is the human one: you type “still failing, try again”, the model makes the same change, and the chat gets longer each time. When the cost line climbs and the error doesn’t change:</p>
    <ul>
      <li><code>/undo</code> the last Aider commit (or several) to get back to a clean state.</li>
      <li>Run the failing command with <code>/run</code> or <code>/test</code> so the model sees the full, real output instead of your summary.</li>
      <li><code>/clear</code>, then restate the problem with the new fact. The old attempts in the history pull the model toward the same fix.</li>
      <li>Ask before editing: <code>/ask why does this test still fail? Don’t change any code yet.</code></li>
    </ul>

    <h2>5. Scripted and CI runs</h2>
    <p><code>aider --message "..."</code> runs one instruction and exits, and <code>--yes-always</code> approves every prompt. In a script that means nobody is watching the cost line. Put the limits around the process:</p>
    <pre>{`# one key per pipeline, with its own credit limit at the provider
export OPENROUTER_API_KEY="$AIDER_CI_KEY"

timeout 15m aider --yes-always --no-auto-commits \\
  --max-chat-history-tokens 6000 --map-tokens 512 \\
  --message "Fix the failing test in tests/test_parser.py" src/parser.py tests/test_parser.py`}</pre>
    <ul>
      <li><code>timeout</code> (or your CI job’s timeout) bounds the wall-clock time, and with it the number of requests.</li>
      <li>A dedicated key with a small credit limit bounds the money, whatever the script does.</li>
      <li>Don’t put <code>aider --message</code> in a shell <code>while</code> loop that retries until tests pass. That is the runaway loop, just written by you.</li>
    </ul>
    <p>More on per-run caps for headless agents in <a href="/guides/ai-coding-agent-budget-ci">setting a hard budget for AI coding agents in CI</a>.</p>

    <h2>Where LoopGuard fits</h2>
    <p>LoopGuard enforces session and daily caps and blocks no-progress repeats through the hook systems of Claude Code, Codex CLI and Cursor. Aider has no tool-call hooks to attach to, so LoopGuard doesn’t guard Aider sessions. For Aider, the key-level limit above is the hard stop. If you also use one of those three agents, <code>npm i -g loopguard-cli && loopguard init</code> adds per-session and daily caps to them in a minute, and <code>loopguard report</code> shows what they spent.</p>

    <Related slug={SLUG} />
  </main>);
}
