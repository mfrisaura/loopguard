import './globals.css';
import type { ReactNode } from 'react';
export const metadata = {
  metadataBase: new URL(process.env.APP_URL || 'https://tryloopguard.com'),
  title: 'LoopGuard — stop runaway AI coding agents',
  description: 'ccusage tells you what you spent. LoopGuard stops you spending it. Budget caps and loop killer for Claude Code, Codex and Cursor.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>
    <div className="nav"><a href="/" className="logo" style={{ textDecoration: 'none' }}>Loop<span>Guard</span></a>
      <div className="row"><a href="/#pricing">Pricing</a><a className="btn ghost" href="/dashboard">Dashboard</a></div></div>
    {children}
  </body></html>);
}
