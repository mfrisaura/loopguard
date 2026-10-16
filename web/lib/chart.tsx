const COLORS: Record<string, string> = { claude: 'var(--claude)', codex: 'var(--codex)', cursor: 'var(--cursor)' };
export function dailySeries(rows: { day: string; agent: string; cost: number }[], days: number, today = new Date()) {
  const out: { day: string; byAgent: Record<string, number>; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ day: key, byAgent: {}, total: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.day, i]));
  for (const r of rows) { const i = idx.get(r.day); if (i === undefined) continue; out[i].byAgent[r.agent] = (out[i].byAgent[r.agent] || 0) + r.cost; out[i].total += r.cost; }
  return out;
}
/** Stacked daily cost bars per agent, pure SVG (server-rendered, no JS). */
export function StackedBars({ series }: { series: ReturnType<typeof dailySeries> }) {
  const W = 960, H = 200, pad = 24, bw = (W - pad) / series.length;
  const max = Math.max(0.01, ...series.map(s => s.total));
  return (<svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" role="img" aria-label="Daily cost by agent">
    <text x={0} y={12} fill="var(--mut)" fontSize={11}>${max.toFixed(2)}</text>
    {series.map((s, i) => { let y = H; return (<g key={s.day}>
      {Object.entries(s.byAgent).map(([a, c]) => { const h = (c / max) * (H - 20); y -= h;
        return <rect key={a} x={pad + i * bw + 1} y={y} width={Math.max(1, bw - 2)} height={h} fill={COLORS[a] || '#888'}><title>{`${s.day} ${a}: $${c.toFixed(2)}`}</title></rect>; })}
      {i % 5 === 0 && <text x={pad + i * bw} y={H + 16} fill="var(--mut)" fontSize={10}>{s.day.slice(5)}</text>}
    </g>); })}
  </svg>);
}
export const AgentLegend = () => (<div className="legend mut">{Object.entries(COLORS).map(([a, c]) => <span key={a}><i className="dot" style={{ background: c }} />{a}</span>)}</div>);
