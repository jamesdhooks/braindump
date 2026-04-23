'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'failed' }));
        setErr(body.error ?? 'failed');
        return;
      }
      router.push('/space');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontFamily: 'Fraunces, serif' }}>Create account</h1>
      <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inp} />
        </label>
        <label>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>Password (≥ 8)</div>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required style={inp} />
        </label>
        {err && <div style={{ color: '#ff7a8a' }}>{err}</div>}
        <button disabled={busy} type="submit" style={btn}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </main>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: 8, background: 'var(--bg-1)', border: '1px solid var(--hairline)', borderRadius: 8, color: 'var(--fg-0)' };
const btn: React.CSSProperties = { padding: '10px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' };
