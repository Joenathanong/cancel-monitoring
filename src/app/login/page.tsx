'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Spinner } from '@/components/ui/primitives';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal masuk');
      const next = params.get('next');
      const home = data.user?.role === 'FULFILLMENT' ? '/input' : '/dashboard';
      router.replace(data.mustChangePassword ? '/akun?first=1' : next && next.startsWith('/') ? next : home);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-[400px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="brand-logo" style={{ width: 44, height: 44, fontSize: 13 }}>PK</span>
        <div>
          <div className="text-lg font-bold leading-tight">Pending Kiriman</div>
          <div className="text-xs text-label">PT Inovasi Eka Gemilang · Fulfillment & Inventory</div>
        </div>
      </div>
      {err && <div className="alert alert-negative" role="alert">{err}</div>}
      <div className="field">
        <label className="label" htmlFor="username">Username</label>
        <input id="username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn btn-primary w-full" type="submit" disabled={busy}>
        {busy ? <Spinner /> : <LogIn />} Masuk
      </button>
      <div className="flex items-center justify-between text-xs text-label">
        <span>Lupa password? Hubungi Admin.</span>
        <ThemeToggle />
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="h-[100dvh] overflow-y-auto grid place-items-center p-4" style={{ background: 'var(--bg-canvas)' }}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
