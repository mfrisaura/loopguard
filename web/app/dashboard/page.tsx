import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { COOKIE, userFromSessionToken } from '@/lib/auth';
import { hasPro, hasActiveSubscription, TRIAL_DAYS } from '@/lib/plans';
import { dailySeries, StackedBars, AgentLegend } from '@/lib/chart';

export const dynamic = 'force-dynamic';
const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const jar = await cookies();
  const user = await userFromSessionToken(jar.get(COOKIE)?.value);
  if (!user) redirect('/login');
  const sp = await searchParams;
  const newKey = jar.get('lg_newkey')?.value;
  const since = new Date(); since.setDate(since.getDate() - 29);
  const sinceDay = since.toISOString().slice(0, 10);
  const [rows, trips, keys] = await Promise.all([
    db.usageRow.groupBy({ by: ['day', 'agent'], where: { userId: user.id, day: { gte: sinceDay } }, _sum: { cost: true } }),
    db.trip.findMany({ where: { userId: user.id }, orderBy: { t: 'desc' }, take: 25 }),
    db.apiKey.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: 'desc' } }),
  ]);
  const flat = rows.map(r => ({ day: r.day, agent: r.agent, cost: r._sum.cost || 0 }));
  const series = dailySeries(flat, 30);
  const today = series[series.length - 1].total, week = series.slice(-7).reduce((a, s) => a + s.total, 0), month = series.reduce((a, s) => a + s.total, 0);
  const byAgent: Record<string, number> = {}; for (const r of flat) byAgent[r.agent] = (byAgent[r.agent] || 0) + r.cost;
  const pro = hasPro(user);
  const subscribed = hasActiveSubscription(user);
  const trialLeft = Math.max(0, Math.ceil(TRIAL_DAYS - (Date.now() - user.createdAt.getTime()) / 864e5));
  const paused = user.pausedUntil && user.pausedUntil > new Date();

  return (<main>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0 }}>Dashboard</h1>
      <div className="row"><span className="badge">{user.plan === 'free' ? (trialLeft ? `Pro trial · ${trialLeft}d left` : 'Free') : `${user.plan}${user.plan === 'team' ? ` · ${user.seats} seats` : ''}`}</span>
        <span className="mut">{user.email}</span><form className="inline" method="post" action="/api/auth/logout"><button className="btn ghost">Log out</button></form></div>
    </div>
    {sp.checkout === 'success' && <p className="card">Thanks! Your plan will update as soon as Stripe confirms.</p>}
    {sp.error && <p className="card" style={{ color: 'var(--acc)' }}>Error: {sp.error}</p>}
    {!pro && <p className="card">Your trial ended. Sync, alerts and remote pause need Pro. The local CLI keeps enforcing caps for free.</p>}

    <section className="grid">
      <div className="card"><div className="mut">Today</div><div className="big">{usd(today)}</div></div>
      <div className="card"><div className="mut">Last 7 days</div><div className="big">{usd(week)}</div></div>
      <div className="card"><div className="mut">Last 30 days</div><div className="big">{usd(month)}</div></div>
      <div className="card"><div className="mut">By agent (30d)</div>{Object.entries(byAgent).sort((a, b) => b[1] - a[1]).map(([a, c]) => <div key={a}>{a}: {usd(c)}</div>)}{!flat.length && <div className="mut">No data yet</div>}</div>
    </section>

    <section className="card"><h3>Daily estimated cost by agent</h3><AgentLegend /><StackedBars series={series} /></section>

    <section className="card"><h3>Remote control</h3>
      <p className="mut">{paused ? `Enforcement paused until ${user.pausedUntil!.toLocaleString()}.` : 'Enforcement active.'} Applied on the next <code>loopguard sync</code>.</p>
      <div className="row">{[15, 60, 240].map(m => <form key={m} className="inline" method="post" action="/api/pause"><input type="hidden" name="minutes" value={m} /><button className="btn ghost" disabled={!pro}>Pause {m < 60 ? `${m}m` : `${m / 60}h`}</button></form>)}
        <form className="inline" method="post" action="/api/pause"><input type="hidden" name="minutes" value={0} /><button className="btn" disabled={!pro}>Resume now</button></form></div>
    </section>

    <section className="card"><h3>Recent trips</h3>
      {trips.length ? <table><thead><tr><th>When</th><th>Agent</th><th>Kind</th><th>Action</th><th>Session $</th><th>Today $</th><th>Tool</th></tr></thead><tbody>
        {trips.map(t => <tr key={t.id}><td>{t.t.toLocaleString()}</td><td>{t.agent}</td><td>{t.kind.replace('_', ' ')}</td><td>{t.halt ? 'halted' : 'blocked'}</td><td>{usd(t.sessionCost)}</td><td>{usd(t.dailyCost)}</td><td>{t.tool || ''}</td></tr>)}
      </tbody></table> : <p className="mut">No trips yet. 🎉</p>}
    </section>

    <section className="card"><h3>Connect the CLI</h3>
      {newKey && <><p>Your new API key (shown once):</p><pre>{`loopguard login --key ${newKey}${(process.env.APP_URL || '') === 'https://tryloopguard.com' ? '' : ` --url ${process.env.APP_URL || 'http://localhost:3000'}`}\nloopguard sync`}</pre></>}
      <table><tbody>{keys.map(k => <tr key={k.id}><td><code>{k.prefix}…</code></td><td className="mut">created {k.createdAt.toLocaleDateString()}</td><td className="mut">{k.lastUsedAt ? `last sync ${k.lastUsedAt.toLocaleString()}` : 'never used'}</td>
        <td><form className="inline" method="post" action="/api/keys"><input type="hidden" name="revoke" value={k.id} /><button className="btn ghost">Revoke</button></form></td></tr>)}</tbody></table>
      <form method="post" action="/api/keys" style={{ marginTop: 10 }}><button className="btn">Create API key</button></form>
      <p className="mut">Tip: run <code>loopguard sync</code> from cron every few minutes. Only aggregate token/cost numbers are sent.</p>
    </section>

    <section className="card"><h3>Alerts</h3>
      <form method="post" action="/api/settings">
        <label className="row"><input type="checkbox" name="alertEmail" defaultChecked={user.alertEmail} /> Email me at {user.email}</label>
        <p><input type="url" name="slackWebhook" placeholder="Slack incoming webhook URL" defaultValue={user.slackWebhook || ''} /></p>
        <p><input type="url" name="discordWebhook" placeholder="Discord webhook URL" defaultValue={user.discordWebhook || ''} /></p>
        <button className="btn">Save</button>
      </form>
      <form method="post" action="/api/settings" style={{ marginTop: 8 }}><input type="hidden" name="test" value="1" /><button className="btn ghost" disabled={!pro}>Send test alert</button></form>
    </section>

    <section className="card"><h3>Billing</h3>
      {user.stripeCustomerId && <form method="post" action="/api/stripe/portal"><button className="btn ghost">Manage subscription</button></form>}
      {subscribed ? <p className="mut" style={{ marginTop: 10 }}>You're on {user.plan === 'team' ? `Team (${user.seats} seats)` : 'Pro'}{user.planInterval ? `, billed ${user.planInterval}ly` : ''}. Change or cancel your plan under Manage subscription.</p> :
      <div className="row" style={{ marginTop: 10 }}>
        <form className="inline" method="post" action="/api/stripe/checkout"><input type="hidden" name="plan" value="pro_monthly" /><button className="btn">Pro $9/mo</button></form>
        <form className="inline" method="post" action="/api/stripe/checkout"><input type="hidden" name="plan" value="pro_yearly" /><button className="btn">Pro $79/yr</button></form>
        <form className="inline row" method="post" action="/api/stripe/checkout"><input type="hidden" name="plan" value="team_monthly" /><input type="number" name="seats" min={3} defaultValue={3} style={{ width: 80 }} /><button className="btn">Team $19/dev/mo</button></form>
      </div>}
    </section>
  </main>);
}
