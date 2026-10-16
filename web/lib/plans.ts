export type PlanKey = 'pro_monthly' | 'pro_yearly' | 'team_monthly';
export const PLANS: Record<PlanKey, { plan: 'pro' | 'team'; interval: 'month' | 'year'; label: string; priceEnv: string; usd: number; perSeat: boolean }> = {
  pro_monthly: { plan: 'pro', interval: 'month', label: 'Pro monthly', priceEnv: 'STRIPE_PRICE_PRO_MONTHLY', usd: 9, perSeat: false },
  pro_yearly: { plan: 'pro', interval: 'year', label: 'Pro yearly', priceEnv: 'STRIPE_PRICE_PRO_YEARLY', usd: 79, perSeat: false },
  team_monthly: { plan: 'team', interval: 'month', label: 'Team (per dev)', priceEnv: 'STRIPE_PRICE_TEAM_MONTHLY', usd: 19, perSeat: true },
};
export const TEAM_MIN_SEATS = 3;
export const TRIAL_DAYS = 14;

export function priceId(key: PlanKey): string {
  const v = process.env[PLANS[key].priceEnv];
  if (!v) throw new Error(`${PLANS[key].priceEnv} is not set`);
  return v;
}
export function planForPrice(price: string): { plan: 'pro' | 'team'; interval: 'month' | 'year' } | null {
  for (const k of Object.keys(PLANS) as PlanKey[]) if (process.env[PLANS[k].priceEnv] === price) return { plan: PLANS[k].plan, interval: PLANS[k].interval };
  return null;
}
/** Paid features (sync, alerts, remote pause) for paying users or during the trial. */
export function hasPro(u: { plan: string; createdAt: Date }, now = Date.now()) {
  return u.plan === 'pro' || u.plan === 'team' || now - u.createdAt.getTime() < TRIAL_DAYS * 864e5;
}
