import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Uptime check: 200 when the app and its database answer, 503 otherwise. No auth, no data. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: 'ok' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, db: 'error' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
