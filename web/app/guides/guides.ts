/** Single source of truth for the how-to guides (used by /guides, the footer and sitemap.xml). */
export const GUIDES = [
  {
    slug: 'stop-runaway-ai-coding-agent-loops',
    title: 'How to stop runaway Claude Code, Codex and Cursor agent loops',
    short: 'Stop runaway agent loops',
    description: 'Why AI coding agents get stuck in loops, how to interrupt one now, and how to enforce limits with hooks: repeated-call detection, cost-spiral checks and session/daily dollar caps.',
    updated: '2026-10-18',
  },
  {
    slug: 'track-ai-coding-agent-token-costs',
    title: 'How to track AI coding agent token costs per session',
    short: 'Track token costs per session',
    description: 'Where Claude Code, Codex CLI and Cursor store token usage on your machine, how to turn it into an estimated dollar cost per session, and what the numbers tell you.',
    updated: '2026-10-18',
  },
  {
    slug: 'claude-code-spending-limit',
    title: 'How to set a spending limit for Claude Code',
    short: 'Claude Code spending limit',
    description: 'Every native way to cap Claude Code spend (Console workspace limits, usage-credit limits, --max-budget-usd for headless runs) and how to add a per-session and daily dollar cap to interactive sessions with a hook.',
    updated: '2026-10-19',
  },
  {
    slug: 'limit-cursor-agent-costs',
    title: 'How to limit Cursor agent usage costs',
    short: 'Limit Cursor agent costs',
    description: 'How Cursor bills agent usage, where to set the monthly spend limit (and what it does not cover), and how to add loop detection and per-session caps to the Cursor agent with hooks.',
    updated: '2026-10-19',
  },
  {
    slug: 'codex-cli-spending-limit',
    title: 'How to cap OpenAI Codex CLI spend',
    short: 'Cap Codex CLI spend',
    description: 'Hard spend limits for Codex CLI on an API key, credit and auto-reload limits on a ChatGPT plan, and how to add per-session and daily caps to Codex with hooks.',
    updated: '2026-10-19',
  },
] as const;
export type Guide = (typeof GUIDES)[number];
export const guide = (slug: Guide['slug']) => GUIDES.find(g => g.slug === slug)!;
export const SITE = 'https://tryloopguard.com';

export function guideMetadata(slug: Guide['slug']) {
  const g = guide(slug);
  const url = `/guides/${g.slug}`;
  return {
    title: `${g.title} | LoopGuard`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, type: 'article', siteName: 'LoopGuard' },
  };
}

export function articleJsonLd(slug: Guide['slug']) {
  const g = guide(slug);
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'TechArticle', headline: g.title, description: g.description,
    dateModified: g.updated, datePublished: g.updated, mainEntityOfPage: `${SITE}/guides/${g.slug}`,
    author: { '@type': 'Person', name: 'Marcos Frisaura' }, publisher: { '@type': 'Organization', name: 'LoopGuard' },
  });
}
