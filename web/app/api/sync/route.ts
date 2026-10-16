import { userFromApiKey } from '@/lib/auth';
import { ingest } from '@/lib/sync';
import { errorResponse, json } from '@/lib/http';
export async function POST(req: Request) {
  try {
    const user = await userFromApiKey(req);
    if (!user) return json({ error: 'invalid api key' }, 401);
    const text = await req.text();
    if (text.length > 5_000_000) return json({ error: 'payload too large' }, 413);
    let body: unknown; try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    return json(await ingest(user, body));
  } catch (e) { return errorResponse(e); }
}
