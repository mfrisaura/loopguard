export const metadata = { title: 'Privacy Policy — LoopGuard' };
export default function Privacy() {
  return (<main style={{ maxWidth: 760 }}>
    <h1>Privacy Policy</h1>
    <p className="mut">Last updated: October 16, 2026</p>
    <h2>The CLI is local-first</h2>
    <p>The free LoopGuard CLI reads usage logs that Claude Code, Codex and Cursor already keep on your machine, and stores its own index, settings and trip log in <code>~/.loopguard</code>. It sends nothing anywhere unless you run <code>loopguard login</code> and <code>loopguard sync</code>.</p>
    <h2>What <code>loopguard sync</code> uploads</h2>
    <p>Only aggregate numbers. You can see the exact payload with <code>loopguard sync --dry-run</code>.</p>
    <ul>
      <li>A hashed machine identifier (derived from the hostname, not reversible to it).</li>
      <li>Per agent, per <em>hashed</em> session ID, per day and per model name: input, output and cache token counts, estimated cost, event count, and whether figures were estimated.</li>
      <li>Trip events: time, agent, hashed session ID, trip type (session cap, daily cap, loop, cost spiral), whether the session was halted, the tool name (e.g. &ldquo;Bash&rdquo;), and the session and daily cost at that moment.</li>
    </ul>
    <p><strong>Never uploaded:</strong> prompts, model responses, source code, file paths or project names, tool inputs or command lines, raw session IDs, or API keys for AI providers. The server also discards any field outside this list.</p>
    <h2>Account data</h2>
    <p>Your email address; hashed sign-in tokens, session tokens and API keys; plan and Stripe customer/subscription IDs; alert settings (including Slack/Discord webhook URLs you add); and a remote-pause time if you set one.</p>
    <h2>Processors</h2>
    <ul>
      <li>Railway — hosting and database.</li>
      <li>Stripe — payments. We never see or store your card number.</li>
      <li>Resend — sending sign-in and alert emails.</li>
      <li>Slack / Discord — only if you add a webhook, alerts are posted there.</li>
    </ul>
    <p>We don&apos;t sell your data, run ads, or use your data to train models. No third-party analytics or tracking cookies; the only cookie is the sign-in session cookie.</p>
    <h2>Retention and deletion</h2>
    <p>Data is kept while your account is active. To delete your account and all synced data, email us; revoking an API key stops further uploads immediately.</p>
    <h2>Contact</h2>
    <p>Questions or deletion requests: reply to any LoopGuard email.</p>
  </main>);
}
