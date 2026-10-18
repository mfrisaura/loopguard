import './globals.css';
import type { ReactNode } from 'react';
import { GUIDES } from './guides/guides';
export const metadata = {
  metadataBase: new URL(process.env.APP_URL || 'https://tryloopguard.com'),
  title: 'LoopGuard — stop runaway AI coding agents',
  description: 'ccusage tells you what you spent. LoopGuard stops you spending it. Budget caps and loop killer for Claude Code, Codex and Cursor.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>
    <div className="nav"><a href="/" className="logo" style={{ textDecoration: 'none' }}>Loop<span>Guard</span></a>
      <div className="row"><a href="/guides">Guides</a><a href="/#pricing">Pricing</a><a className="btn ghost" href="/dashboard">Dashboard</a></div></div>
    {children}
    <footer className="foot">
      <div><strong>Guides</strong>{GUIDES.map(g => <a key={g.slug} href={`/guides/${g.slug}`}>{g.short}</a>)}</div>
      <div><strong>Product</strong><a href="/#install">Install</a><a href="/#pricing">Pricing</a><a href="/login">Sign in</a><a href="https://github.com/mfrisaura/loopguard">GitHub</a></div>
      <div><strong>Legal</strong><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
    </footer>
  </body></html>);
}
