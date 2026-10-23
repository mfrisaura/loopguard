/** Single source of truth for the how-to guides (used by /guides, the footer and sitemap.xml). */
export const GUIDES = [
  {
    slug: 'stop-runaway-ai-coding-agent-loops',
    title: 'How to stop runaway Claude Code, Codex and Cursor agent loops',
    short: 'Stop runaway agent loops',
    description: 'Why AI coding agents get stuck in loops, how to interrupt one now, and how to enforce limits with hooks: repeated-call detection, cost-spiral checks and session/daily dollar caps.',
    updated: '2026-10-22',
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
  {
    slug: 'claude-code-usage-limit',
    title: 'Claude Code usage limit reached: why it happens and how to monitor it',
    short: 'Claude Code usage limits',
    description: 'The 5-hour and weekly limits on Claude Pro and Max, what each "You\'ve hit your limit" message means, why long sessions drain them, how to watch usage with /usage and a status line, and how to stop runaway sessions early.',
    updated: '2026-10-22',
  },
  {
    slug: 'ai-coding-agent-budget-ci',
    title: 'How to set a hard budget for AI coding agents in CI',
    short: 'Budget AI agents in CI',
    description: 'Per-run caps, job timeouts and key-level spend limits for Claude Code (claude -p), Codex CLI (codex exec) and Cursor CLI in GitHub Actions and other headless runs, plus loop detection with hooks.',
    updated: '2026-10-22',
  },
  {
    slug: 'claude-code-stuck-in-loop',
    title: 'Claude Code stuck in a loop: how to break it and stop it repeating the same command',
    short: 'Claude Code stuck in a loop',
    description: 'How to interrupt Claude Code when it keeps rerunning the same failing command, undo what the loop changed with /rewind and git, restart without walking back into it, and make a hook refuse the next no-progress repeat.',
    updated: '2026-10-23',
  },
  {
    slug: 'codex-usage-limit',
    title: 'Codex usage limit reached: 5-hour and weekly limits explained',
    short: 'Codex usage limits',
    description: 'The 5-hour and weekly Codex windows on ChatGPT plans, what each "You\'ve hit your usage limit" message means, usage limits vs rate limits, how to check /status and /usage, your options when it runs out, and how to catch a looping session early.',
    updated: '2026-10-23',
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
