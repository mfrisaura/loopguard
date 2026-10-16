import { verifyLogin, sessionCookie } from '@/lib/auth';
import { redirect } from '@/lib/http';
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const r = token ? await verifyLogin(token) : null;
  if (!r) return redirect('/login?error=expired', req);
  return redirect('/dashboard', req, { 'set-cookie': sessionCookie(r.sessionToken) });
}
