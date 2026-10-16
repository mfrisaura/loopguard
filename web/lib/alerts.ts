/** Alert delivery abstraction: email (Resend HTTP API), Slack and Discord incoming webhooks. */
export interface Alert { title: string; text: string; url?: string }
export interface Channel { name: string; send(a: Alert): Promise<void> }
type Fetch = typeof fetch;

export function slackChannel(webhook: string, f: Fetch = fetch): Channel {
  return { name: 'slack', async send(a) {
    const r = await f(webhook, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${a.title}*\n${a.text}${a.url ? `\n<${a.url}|Open dashboard>` : ''}` }) });
    if (!r.ok) throw new Error(`slack ${r.status}`);
  } };
}
export function discordChannel(webhook: string, f: Fetch = fetch): Channel {
  return { name: 'discord', async send(a) {
    const r = await f(webhook, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `**${a.title}**\n${a.text}${a.url ? `\n${a.url}` : ''}`.slice(0, 2000) }) });
    if (!r.ok) throw new Error(`discord ${r.status}`);
  } };
}
export function emailChannel(to: string, f: Fetch = fetch): Channel {
  return { name: 'email', async send(a) { await sendEmail(to, a.title, `${a.text}${a.url ? `\n\n${a.url}` : ''}`, f); } };
}

/** Without RESEND_API_KEY (local dev) emails are logged, not sent. */
export async function sendEmail(to: string, subject: string, text: string, f: Fetch = fetch) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[email:dev] to=${to} subject=${subject}\n${text}`); return; }
  const r = await f('https://api.resend.com/emails', { method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'LoopGuard <alerts@example.com>', to, subject, text }) });
  if (!r.ok) throw new Error(`email ${r.status}`);
}

export const allowedWebhook = (url: string, kind: 'slack' | 'discord') =>
  kind === 'slack' ? /^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(url)
    : /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);

export function channelsFor(u: { email: string; alertEmail: boolean; slackWebhook: string | null; discordWebhook: string | null }, f: Fetch = fetch): Channel[] {
  const c: Channel[] = [];
  if (u.alertEmail) c.push(emailChannel(u.email, f));
  if (u.slackWebhook) c.push(slackChannel(u.slackWebhook, f));
  if (u.discordWebhook) c.push(discordChannel(u.discordWebhook, f));
  return c;
}

/** Fan out to every channel; one failing channel never blocks the others. */
export async function dispatch(channels: Channel[], a: Alert) {
  const res = await Promise.allSettled(channels.map(c => c.send(a)));
  return res.map((r, i) => ({ channel: channels[i].name, ok: r.status === 'fulfilled', error: r.status === 'rejected' ? String(r.reason) : undefined }));
}

export function tripAlert(trips: { agent: string; kind: string; halt: boolean; sessionCost: number; dailyCost: number }[], url?: string): Alert {
  const label: Record<string, string> = { session_cap: 'session cap', daily_cap: 'daily cap', loop: 'loop detected', spiral: 'cost spiral' };
  const lines = trips.slice(0, 10).map(t => `• ${t.agent}: ${label[t.kind] || t.kind}${t.halt ? ' — session halted' : ' — call blocked'} (session $${t.sessionCost.toFixed(2)}, today $${t.dailyCost.toFixed(2)})`);
  if (trips.length > 10) lines.push(`…and ${trips.length - 10} more`);
  return { title: `LoopGuard: ${trips.length} trip${trips.length === 1 ? '' : 's'}`, text: lines.join('\n'), url };
}
