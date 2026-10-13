'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { timeAgo } from '@/lib/utils';

type Run = { kind: string; startedAt: string; ok: boolean; message: string | null };
type Step = { ok: boolean; message: string; processed: number; done: boolean };

/** Status sinkron cancel + tombol tarik. Saat dibuka memicu sinkron otomatis bila sudah waktunya. */
export function CancelSyncBar({ canSync, unchecked }: { canSync: boolean; unchecked: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function load() {
    try { const x = await api<{ runs: Run[]; total: number }>('/api/cancel/sync'); setRuns(x.runs); setTotal(x.total); } catch { /* abaikan */ }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
    (async () => {
      try {
        const r = await api<{ list?: Step; detail?: Step }>('/api/cancel/sync', { method: 'POST', json: { kind: 'auto' } });
        if ((r.list && r.list.processed) || (r.detail && r.detail.processed)) router.refresh();
        void load();
      } catch { /* latar belakang */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pull() {
    setBusy(true);
    try {
      const r = await api<{ list: Step; detail: Step }>('/api/cancel/sync', { method: 'POST', json: { kind: 'all' } });
      const ok = r.list.ok && r.detail.ok;
      toast(`${r.list.message} ${r.detail.message}`, ok ? 'positive' : 'negative');
      router.refresh();
      void load();
    } catch (e) {
      toast((e as Error).message, 'negative');
    } finally {
      setBusy(false);
    }
  }

  const list = runs.find((r) => r.kind === 'CANCEL_LIST');
  const detail = runs.find((r) => r.kind === 'CANCEL_DETAIL');
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-label">
      <span title={list?.message ?? ''} className={list && !list.ok ? 'text-negative' : ''}>Daftar cancel OCS: {list ? timeAgo(list.startedAt) : 'belum pernah ditarik'}{list && !list.ok ? ' (galat)' : ''}</span>
      <span aria-hidden>·</span>
      <span title={detail?.message ?? ''} className={detail && !detail.ok ? 'text-negative' : ''}>Log: {detail ? timeAgo(detail.startedAt) : 'belum pernah'}</span>
      {total !== null && <><span aria-hidden>·</span><span>{total.toLocaleString('id-ID')} order cancel tersimpan</span></>}
      {unchecked > 0 && <><span aria-hidden>·</span><span className="text-critical font-semibold">{unchecked.toLocaleString('id-ID')} log belum dicek</span></>}
      {canSync && <button type="button" className="btn btn-ghost btn-sm" onClick={pull} disabled={busy}>{busy ? <Spinner /> : <RefreshCw />} Tarik sekarang</button>}
    </div>
  );
}
