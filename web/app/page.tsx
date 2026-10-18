import { GUIDES } from './guides/guides';

export default function Home() {
  return (<main>
    <div className="hero">
      <h1>ccusage tells you what you spent.<br />LoopGuard stops you spending it.</h1>
      <p>Budget fuses and a runaway-loop killer for Claude Code, Codex CLI and Cursor. One install, no proxy, works on subscriptions — and it pings your phone when something trips.</p>
      <div className="row" style={{ marginTop: 20 }}><a className="btn" href="#install">Install free</a><a className="btn ghost" href="/login">Start 14-day Pro trial</a></div>
    </div>
    <section id="install"><pre>{`npm i -g loopguard-cli  # installs the \`loopguard\` command (or try: npx loopguard-cli report)
loopguard init          # hooks into Claude Code, Codex and Cursor (backs up configs)
loopguard config set sessionCapUsd 20
loopguard report --by agent

# Pro: alerts + remote pause → https://tryloopguard.com/login
loopguard login --key lg_…   # then: loopguard sync`}</pre></section>
    <section className="grid">
      <div className="card"><h3>Hard caps</h3><p className="mut">Per-session and daily dollar caps across every agent. When a cap trips, the tool call is denied and the session halts.</p></div>
      <div className="card"><h3>Loop killer</h3><p className="mut">Catches the same tool call repeating and cost spirals ($ per minute), before you notice them in the logs.</p></div>
      <div className="card"><h3>Local first</h3><p className="mut">Reads the logs your agents already write. No API keys, no proxy. Only aggregate numbers ever leave your machine — and only if you turn on sync.</p></div>
      <div className="card"><h3>Away-from-keyboard alerts</h3><p className="mut">Email, Slack or Discord the moment something trips, and pause or resume enforcement from your phone.</p></div>
    </section>
    <section id="guides"><h2>Guides</h2><div className="grid">
      {GUIDES.map(g => (<a key={g.slug} className="card" href={`/guides/${g.slug}`} style={{ textDecoration: 'none' }}><h3>{g.title}</h3><p className="mut" style={{ margin: 0 }}>{g.description}</p></a>))}
    </div></section>
    <section id="pricing"><h2>Pricing</h2><div className="grid">
      <div className="card"><h3>Free</h3><div className="price">$0</div><p className="mut">Open-source CLI (MIT). Caps, loop detection, local reports.</p></div>
      <div className="card"><h3>Pro</h3><div className="price">$9<span className="mut" style={{ fontSize: 15 }}>/mo</span></div><p className="mut">or $79/year. Dashboard, alerts, remote pause, history across machines.</p></div>
      <div className="card"><h3>Team</h3><div className="price">$19<span className="mut" style={{ fontSize: 15 }}>/dev/mo</span></div><p className="mut">Min 3 seats. Everything in Pro for your whole team.</p></div>
    </div></section>
    <p className="mut" style={{ fontSize: 13 }}>Costs are estimates at API list prices. Not affiliated with Anthropic, OpenAI or Anysphere. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
  </main>);
}
