import { db } from '@/lib/db';
import { userFromRequest } from '@/lib/auth';
import { redirect, sameOrigin, json } from '@/lib/http';
import { form } from '@/lib/http';
/** Remote pause: CLI picks it up on next `loopguard sync`. minutes=0 resumes. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
  const user = await userFromRequest(req);
  if (!user) return redirect('/login', req);
  const f = await form(req);
  const min = Math.max(0, Math.min(24 * 60, Number(f.get('minutes')) || 0));
  await db.user.update({ where: { id: user.id }, data: { pausedUntil: min ? new Date(Date.now() + min * 60e3) : null } });
  return redirect('/dashboard', req);
}
