import Link from 'next/link';
import { cookies } from 'next/headers';

async function fetchMe() {
  const cookie = cookies().toString();
  const res = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/v1/auth/me`, {
    headers: { cookie },
    cache: 'no-store'
  });
  if (!res.ok) return { user: null };
  return (await res.json()) as { user: { id: string; email: string } | null; spaces?: { id: string; name: string }[] };
}

export default async function Home() {
  const me = await fetchMe();
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8, fontFamily: 'Fraunces, serif' }}>Braindump</h1>
      <p style={{ color: 'var(--fg-1)', marginBottom: 32 }}>A clean slate for thoughts.</p>
      {me.user ? (
        <div className="card">
          <div>Signed in as {me.user.email}</div>
          <div style={{ marginTop: 12 }}>
            <Link href="/space">Open space →</Link>
          </div>
          <form action="/api/v1/auth/signout" method="post" style={{ marginTop: 12 }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      ) : (
        <div className="card">
          <Link href="/signin">Sign in</Link> or <Link href="/signup">create an account</Link>.
        </div>
      )}
    </main>
  );
}
