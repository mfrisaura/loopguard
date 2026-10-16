import { db } from '@/lib/db';
import { readCookie, sessionCookie } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { redirect } from '@/lib/http';
export async function POST(req: Request) {
  const t = readCookie(req);
  if (t) await db.session.deleteMany({ where: { tokenHash: sha256(t) } });
  return redirect('/', req, { 'set-cookie': sessionCookie('', 0) });
}
