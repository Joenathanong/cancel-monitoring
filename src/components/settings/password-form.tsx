'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Field, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (next !== confirm) { setErr('Konfirmasi password tidak sama'); return; }
    setBusy(true);
    try {
      await api('/api/account/password', { method: 'POST', json: { current, next } });
      toast('Password diganti', 'positive');
      setCurrent(''); setNext(''); setConfirm('');
      router.replace(mustChange ? '/dashboard' : '/akun');
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <div className="card-title">Ganti password</div>
      {err && <div className="alert alert-negative">{err}</div>}
      <Field label="Password saat ini" htmlFor="pw-cur" required><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
      <Field label="Password baru" htmlFor="pw-new" required hint="Min. 8 karakter, mengandung huruf dan angka"><input id="pw-new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} /></Field>
      <Field label="Ulangi password baru" htmlFor="pw-conf" required><input id="pw-conf" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
      <div className="flex justify-end"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : <KeyRound />} Simpan password</button></div>
    </form>
  );
}
