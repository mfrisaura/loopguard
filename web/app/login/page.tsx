export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (<main style={{ maxWidth: 420 }}>
    <h1>Sign in</h1>
    <p className="mut">We&apos;ll email you a sign-in link. New accounts get a 14-day Pro trial.</p>
    {sp.sent && <p>Check your inbox for the link.</p>}
    {sp.dev && <p className="card">Dev mode (no email provider): <a href={sp.dev}>open sign-in link</a></p>}
    {sp.error && <p style={{ color: 'var(--acc)' }}>{sp.error === 'expired' ? 'That link expired or was already used.' : 'Something went wrong.'}</p>}
    <form method="post" action="/api/auth/request" className="row">
      <input type="email" name="email" required placeholder="you@company.com" />
      <button className="btn" type="submit">Email me a link</button>
    </form>
  </main>);
}
