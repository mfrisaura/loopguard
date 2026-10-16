import { db } from '@/lib/db';
import { userFromRequest } from '@/lib/auth';
import { randomToken, sha256 } from '@/lib/crypto';
import { json, redirect, sameOrigin } from '@/lib/http';
import { form } from '@/lib/http';
/** Creates an API key; plaintext shown once via a short-lived cookie read by the dashboard. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
  const user = await userFromRequest(req);
  if (!user) return redirect('/login', req);
  const f = await form(req);
  const revoke = f.get('revoke');
  if (typeof revoke === 'string') {
    await db.apiKey.updateMany({ where: { id: revoke, userId: user.id }, data: { revokedAt: new Date() } });
    return redirect('/dashboard', req);
  }
  const key = `lg_${randomToken(24)}`;
  await db.apiKey.create({ data: { userId: user.id, hash: sha256(key), prefix: key.slice(0, 9) } });
  return redirect('/dashboard', req, { 'set-cookie': `lg_newkey=${key}; Path=/dashboard; HttpOnly; SameSite=Strict; Max-Age=60` });
}
