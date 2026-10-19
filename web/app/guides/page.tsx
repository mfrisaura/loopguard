import { GUIDES } from './guides';

export const metadata = {
  title: 'Guides: controlling AI coding agent costs and loops | LoopGuard',
  description: 'Practical how-to guides for keeping Claude Code, Codex CLI and Cursor from burning money: spending limits for each tool, stopping runaway loops and tracking token costs per session.',
  alternates: { canonical: '/guides' },
};

export default function Guides() {
  return (<main className="prose">
    <h1>Guides</h1>
    <p className="mut">Practical notes on keeping AI coding agents (Claude Code, Codex CLI, Cursor) from quietly burning money or usage limits.</p>
    {GUIDES.map(g => (
      <div className="card" key={g.slug} style={{ marginBottom: 16 }}>
        <h3><a href={`/guides/${g.slug}`}>{g.title}</a></h3>
        <p className="mut" style={{ margin: 0 }}>{g.description}</p>
      </div>
    ))}
  </main>);
}
