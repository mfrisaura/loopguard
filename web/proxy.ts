import { NextResponse, type NextRequest } from 'next/server';
/** Canonical host: www.tryloopguard.com -> tryloopguard.com (keeps cookies/links on one origin). */
export function proxy(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (host.startsWith('www.')) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${host.slice(4)}`);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}
export const config = { matcher: '/:path*' };
