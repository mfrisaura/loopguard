import { handleWebhook } from '@/lib/stripe';
import { json } from '@/lib/http';
export async function POST(req: Request) {
  const raw = await req.text();
  try { return json(await handleWebhook(raw, req.headers.get('stripe-signature'))); }
  catch (e) { console.error('stripe webhook', (e as Error).message); return json({ error: 'invalid webhook' }, 400); }
}
