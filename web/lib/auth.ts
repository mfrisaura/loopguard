import { db } from './db';
import { randomToken, sha256 } from './crypto';
import { sendEmail } from './alerts';

export const COOKIE = 'lg_session';
const SESSION_DAYS = 30;

export function readCookie(req: Request, name = COOKIE): string | null {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); }
  return null;
}

export async function userFromSessionToken(token: string | null | undefined) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}
export const userFromRequest = (req: Request) => userFromSessionToken(readCookie(req));

export async function userFromApiKey(req: Request) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(lg_[\w-]+)$/);
  if (!m) return null;
  const k = await db.apiKey.findUnique({ where: { hash: sha256(m[1]) }, include: { user: true } });
  if (!k || k.revokedAt) return null;
  await db.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
  return k.user;
}

export const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

export async function requestLogin(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('invalid email');
  const token = randomToken();
  await db.loginToken.create({ data: { tokenHash: sha256(token), email, expiresAt: new Date(Date.now() + 15 * 60e3) } });
  const link = `${appUrl()}/api/auth/verify?token=${token}`;
  await sendEmail(email, 'Your LoopGuard sign-in link', `Sign in to LoopGuard: ${link}\n\nThis link expires in 15 minutes.`);
  return link;
}

export async function verifyLogin(token: string) {
  const t = await db.loginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return null;
  await db.loginToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
  const user = await db.user.upsert({ where: { email: t.email }, update: {}, create: { email: t.email } });
  const sessionToken = randomToken();
  await db.session.create({ data: { tokenHash: sha256(sessionToken), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) } });
  return { user, sessionToken };
}

export function sessionCookie(token: string, maxAgeSec = SESSION_DAYS * 86400) {
  const secure = appUrl().startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
