import { requestLogin } from '@/lib/auth';
import { json, redirect } from '@/lib/http';
import { form } from '@/lib/http';
export async function POST(req: Request) {
  const f = await form(req);
  try {
    const link = await requestLogin(String(f.get('email') || ''));
    // Local dev convenience only: without an email provider, show the link.
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production')
      return redirect(`/login?sent=1&dev=${encodeURIComponent(link)}`, req);
    return redirect('/login?sent=1', req);
  } catch { return redirect('/login?error=1', req); }
}
export const GET = () => json({ error: 'POST only' }, 405);
