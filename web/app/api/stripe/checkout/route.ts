import { userFromRequest } from '@/lib/auth';
import { createCheckout, hasActiveSubscription, portalUrl } from '@/lib/stripe';
import { PLANS, PlanKey } from '@/lib/plans';
import { json, redirect, sameOrigin } from '@/lib/http';
import { form } from '@/lib/http';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
  const user = await userFromRequest(req);
  if (!user) return redirect('/login', req);
  // Already subscribed: send them to the billing portal to change plans instead of double-billing.
  if (hasActiveSubscription(user) && user.stripeCustomerId) {
    try { return redirect(await portalUrl(user.stripeCustomerId), req); }
    catch (e) { console.error(e); return redirect('/dashboard?error=billing', req); }
  }
  const f = await form(req);
  const plan = String(f.get('plan')) as PlanKey;
  if (!(plan in PLANS)) return json({ error: 'unknown plan' }, 400);
  try {
    const s = await createCheckout(user, plan, Number(f.get('seats')) || 1);
    return redirect(s.url!, req);
  } catch (e) { console.error(e); return redirect('/dashboard?error=billing', req); }
}
