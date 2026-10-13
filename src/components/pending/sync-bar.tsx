'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CloudOff } from 'lucide-react';
import { Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { timeAgo } from '@/lib/utils';

type Run = { kind: string; startedAt: string; ok: boolean; message: string | null };
type Status = { ocsConfigured: boolean; doiConfigured: boolean; runs: Run[]; openOrders: number };

/**
 * Bar kecil "Status OCS diperbarui X menit lalu" + tombol perbarui.
 * Saat halaman dibuka, memicu sinkron otomatis (server yang memutuskan perlu
 * atau tidak berdasar interval di Pengaturan) lalu memuat ulang data bila ada perubahan.
 */
export function SyncBar({ canSync, onSynced }: { canSync: boolean; onSynced?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function loadStatus() {
    try { setSt(await api<Status>('/api/sync/status')); } catch { /* abaikan */ }
  }
  function refreshData() {
    onSynced?.();
    router.refresh();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadStatus();
    (async () => {
      try {
        const r = await api<{ ocs?: { changed: number; checked: number }; phaseOut?: { changed: number } }>('/api/sync', { method: 'POST', json: { kind: 'auto' } });
        if ((r.ocs && r.ocs.checked) || (r.phaseOut && r.phaseOut.changed)) refreshData();
        void loadStatus();
      } catch { /* sinkron latar belakang — diam saja */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncNow() {
    setBusy(true);
    try {
      const r = await api<{ ocs: { ok: boolean; message: string; remaining: number } }>('/api/sync', { method: 'POST', json: { kind: 'ocs' } });
      toast(r.ocs.message + (r.ocs.remaining && r.ocs.ok ? ` Masih ${r.ocs.remaining} order pending.` : ''), r.ocs.ok ? 'positive' : 'negative');
      refreshData();
      void loadStatus();
    } catch (e) {
      toast((e as Error).message, 'negative');
    } finally {
      setBusy(false);
    }
  }

  const lastOcs = st?.runs.find((r) => r.kind === 'OCS');
  const lastPo = st?.runs.find((r) => r.kind === 'PHASE_OUT');
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-label">
      {st && !st.ocsConfigured ? (
        <span className="flex items-center gap-1 text-critical"><CloudOff className="w-4 h-4" /> Akun OCS belum diisi di .env — status order belum bisa dicek</span>
      ) : (
        <span title={lastOcs?.message ?? ''} className={lastOcs && !lastOcs.ok ? 'text-negative' : ''}>
          Status OCS: {lastOcs ? timeAgo(lastOcs.startedAt) : 'belum pernah dicek'}{lastOcs && !lastOcs.ok ? ' (ada galat)' : ''}
        </span>
      )}
      <span aria-hidden>·</span>
      <span title={lastPo?.message ?? ''} className={lastPo && !lastPo.ok ? 'text-negative' : ''}>
        Phase Out: {st && !st.doiConfigured ? 'akun doi-monitor belum diisi' : lastPo ? timeAgo(lastPo.startedAt) : 'belum pernah'}
      </span>
      {canSync && st?.ocsConfigured && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={syncNow} disabled={busy}>{busy ? <Spinner /> : <RefreshCw />} Cek status OCS</button>
      )}
    </div>
  );
}
