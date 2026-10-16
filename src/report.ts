import { Row } from './usage';

export type GroupBy = 'day' | 'session' | 'agent' | 'model';
export function group(rows: Row[], by: GroupBy) {
  const m = new Map<string, { key: string; agent: string; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; estimated: boolean; last: string }>();
  for (const r of rows) {
    const key = by === 'day' ? r.day : by === 'agent' ? r.agent : by === 'model' ? r.model : `${r.agent}:${r.sessionId}`;
    const g = m.get(key) || { key, agent: r.agent, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, estimated: false, last: '' };
    if (g.agent !== r.agent) g.agent = 'mixed';
    g.input += r.inputTokens; g.output += r.outputTokens; g.cacheRead += r.cacheReadTokens; g.cacheWrite += r.cacheWriteTokens;
    g.cost += r.cost; g.estimated ||= r.estimated; if (r.lastTs > g.last) g.last = r.lastTs;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => by === 'day' ? a.key.localeCompare(b.key) : b.cost - a.cost);
}

const n = (x: number) => x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : String(x);
export function table(rows: Row[], by: GroupBy): string {
  const g = group(rows, by);
  const head = [by.toUpperCase(), 'AGENT', 'INPUT', 'OUTPUT', 'CACHE R', 'CACHE W', 'COST'];
  const body = g.map(x => [x.key.length > 44 ? x.key.slice(0, 41) + '...' : x.key, x.agent, n(x.input), n(x.output), n(x.cacheRead), n(x.cacheWrite), `$${x.cost.toFixed(2)}${x.estimated ? '*' : ''}`]);
  const total = g.reduce((a, x) => a + x.cost, 0);
  body.push(['TOTAL', '', '', '', '', '', `$${total.toFixed(2)}`]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map(r => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => i < 2 ? c.padEnd(w[i]) : c.padStart(w[i])).join('  ');
  const out = [line(head), w.map(x => '-'.repeat(x)).join('  '), ...body.map(line)];
  if (g.some(x => x.estimated)) out.push('* includes estimated tokens (Cursor bubbles without token counts)');
  out.push('Costs are estimates at API list prices; subscription plans are billed differently.');
  return out.join('\n');
}
