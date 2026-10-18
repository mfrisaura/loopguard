import { handleWebhook, WebhookProcessingError } from '@/lib/stripe';
import { json } from '@/lib/http';
export async function POST(req: Request) {
  const raw = await req.text();
  try { return json(await handleWebhook(raw, req.headers.get('stripe-signature'))); }
  catch (e) {
    console.error('stripe webhook', (e as Error).message);
    // 500 on processing failures so Stripe retries; 400 only for bad signatures/payloads.
    return e instanceof WebhookProcessingError ? json({ error: 'processing failed' }, 500) : json({ error: 'invalid webhook' }, 400);
  }
}
