import { HttpError } from './sync';
export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x)), { status, headers: { 'content-type': 'application/json' } });
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: 'internal error' }, 500);
}
/** CSRF guard for cookie-authenticated form posts: same-origin only. */
export function sameOrigin(req: Request) {
  const o = req.headers.get('origin');
  if (!o) return true; // non-browser clients
  try { return new URL(o).host === new URL(req.url).host || o === (process.env.APP_URL || ''); } catch { return false; }
}
export const redirect = (to: string, req: Request, headers: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { location: new URL(to, process.env.APP_URL || req.url).toString(), ...headers } });
/** formData() that tolerates empty/non-form bodies. */
export async function form(req: Request): Promise<FormData> {
  try { return await req.formData(); } catch { return new FormData(); }
}
