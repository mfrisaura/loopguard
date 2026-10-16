import { db } from '@/lib/db';
import { userFromRequest } from '@/lib/auth';
import { allowedWebhook, dispatch, channelsFor } from '@/lib/alerts';
import { json, redirect, sameOrigin } from '@/lib/http';
import { form } from '@/lib/http';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
  const user = await userFromRequest(req);
  if (!user) return redirect('/login', req);
  const f = await form(req);
  if (f.get('test') === '1') {
    await dispatch(channelsFor(user), { title: 'LoopGuard test alert', text: 'Alerts are working.' });
    return redirect('/dashboard?alert=sent', req);
  }
  const slack = String(f.get('slackWebhook') || '').trim();
  const discord = String(f.get('discordWebhook') || '').trim();
  if (slack && !allowedWebhook(slack, 'slack')) return redirect('/dashboard?error=slack', req);
  if (discord && !allowedWebhook(discord, 'discord')) return redirect('/dashboard?error=discord', req);
  await db.user.update({ where: { id: user.id }, data: { slackWebhook: slack || null, discordWebhook: discord || null, alertEmail: f.get('alertEmail') === 'on' } });
  return redirect('/dashboard', req);
}
