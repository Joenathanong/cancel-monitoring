'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api-client';
import { fmtNumber } from '@/lib/utils';
import type { ItemRow } from '@/server/items';
import type { RoleName } from '@/lib/session';
import { ItemsTable } from './items-table';
import { ItemDetail } from './item-detail';
import { SyncBar } from './sync-bar';

const STATUSES: Array<[string, string]> = [['OPEN', 'Masih pending'], ['PROCESSED', 'Terproses'], ['CANCELLED', 'Batal'], ['ALL', 'Semua']];
type Quick = 'noFu' | 'cat' | 'noPo' | 'old' | 'notInOrder';
const QUICK: Array<[Quick, string]> = [['noFu', 'Belum ditindaklanjuti'], ['noPo', 'Belum open PO'], ['cat', 'Phase Out / Clearance'], ['old', 'Umur lewat batas'], ['notInOrder', 'SKU tak ada di order']];

export function MonitoringWorkspace({ me, reasons, agingWarnDays }: { me: { id: string; role: RoleName }; reasons: string[]; agingWarnDays: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = sp.get('status') || 'OPEN';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const sku = sp.get('sku') || '';
  const [quick, setQuick] = useState<Quick[]>(() => (sp.get('q') ? (sp.get('q')!.split(',') as Quick[]) : []));
  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(sp.get('item'));

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`${pathname}?${p}`, { scroll: false });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ status, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sku ? { sku } : {}) });
      const x = await api<{ rows: ItemRow[] }>(`/api/items?${q}`);
      setRows(x.rows);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, from, to, sku]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    let out = rows ?? [];
    if (quick.includes('noFu')) out = out.filter((r) => !r.followUpAt);
    if (quick.includes('noPo')) out = out.filter((r) => r.poStatus === 'BELUM');
    if (quick.includes('cat')) out = out.filter((r) => r.isPhaseOut || r.isClearance);
    if (quick.includes('old')) out = out.filter((r) => r.resolution === 'OPEN' && r.ageDays >= agingWarnDays);
    if (quick.includes('notInOrder')) out = out.filter((r) => r.skuInOrder === false);
    return out;
  }, [rows, quick, agingWarnDays]);

  const stats = useMemo(() => {
    const orders = new Set(shown.map((r) => r.orderId));
    return {
      rows: shown.length,
      orders: orders.size,
      qty: shown.reduce((a, r) => a + r.qty, 0),
      noFu: shown.filter((r) => !r.followUpAt).length,
      cat: shown.filter((r) => r.isPhaseOut || r.isClearance).length,
    };
  }, [shown]);

  function toggleQuick(k: Quick) {
    const next = quick.includes(k) ? quick.filter((x) => x !== k) : [...quick, k];
    setQuick(next);
    update({ q: next.join(',') });
  }

  const exportHref = `/api/export?${new URLSearchParams({ status, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sku ? { sku } : {}) })}`;

  return (
    <>
      <SyncBar canSync={me.role !== 'VIEWER'} onSynced={load} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="seg" role="tablist" aria-label="Penyelesaian">
            {STATUSES.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'is-active' : ''} onClick={() => update({ status: k })}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2 items-center w-full sm:w-auto min-w-0">
            <input type="date" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={from} onChange={(e) => update({ from: e.target.value })} aria-label="Tanggal input dari" title="Tanggal input dari" />
            <span className="text-label">–</span>
            <input type="date" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={to} onChange={(e) => update({ to: e.target.value })} aria-label="Tanggal input sampai" title="Tanggal input sampai" />
          </div>
          {sku && <button type="button" className="chip chip-brand" onClick={() => update({ sku: '' })} title="Hapus saringan SKU">SKU: {sku} ✕</button>}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Saringan cepat">
          {QUICK.map(([k, l]) => (
            <button key={k} type="button" className={`btn btn-sm ${quick.includes(k) ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={quick.includes(k)} onClick={() => toggleQuick(k)}>
              {l}{k === 'old' ? ` (≥ ${agingWarnDays} hari)` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card kpi-tile"><div className="kpi-label">Baris</div><div className="kpi-value">{fmtNumber(stats.rows)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">Order ID</div><div className="kpi-value">{fmtNumber(stats.orders)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">Total qty</div><div className="kpi-value">{fmtNumber(stats.qty)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">Belum ditindaklanjuti</div><div className="kpi-value" style={{ color: stats.noFu ? 'var(--critical)' : undefined }}>{fmtNumber(stats.noFu)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">Phase Out / Clearance</div><div className="kpi-value" style={{ color: stats.cat ? 'var(--negative)' : undefined }}>{fmtNumber(stats.cat)}</div></div>
      </div>

      {err && <div className="alert alert-negative">{err}</div>}
      {rows === null ? <div className="py-10 grid place-items-center"><Spinner /></div> : (
        <ItemsTable
          id="monitoring"
          rows={shown}
          onOpen={(r) => setOpenId(r.id)}
          agingWarnDays={agingWarnDays}
          toolbarExtra={
            <div className="flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading} aria-label="Muat ulang">{loading ? <Spinner /> : <RefreshCw />}</button>
              <a className="btn btn-ghost btn-sm" href={exportHref}><Download /> <span className="hidden sm:inline">Excel</span></a>
            </div>
          }
        />
      )}
      <ItemDetail id={openId} onClose={() => { setOpenId(null); if (sp.get('item')) update({ item: '' }); }} onChanged={load} me={me} reasons={reasons} />
    </>
  );
}
