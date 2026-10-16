import { userFromRequest } from '@/lib/auth';
import { portalUrl } from '@/lib/stripe';
import { json, redirect, sameOrigin } from '@/lib/http';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
  const user = await userFromRequest(req);
  if (!user?.stripeCustomerId) return redirect('/dashboard', req);
  try { return redirect(await portalUrl(user.stripeCustomerId), req); }
  catch (e) { console.error(e); return redirect('/dashboard?error=billing', req); }
}
