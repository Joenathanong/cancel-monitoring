'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Save, ListChecks, RefreshCw } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { Field, Spinner, Chip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { fmtDate, fmtNumber, fmtShort } from '@/lib/utils';
import type { SkuSummaryRow } from '@/server/summary';
import { CategoryChips } from './chips';

export function SkuWorkspace({ canFollowUp, reasons }: { canFollowUp: boolean; reasons: string[] }) {
  const [rows, setRows] = useState<SkuSummaryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<SkuSummaryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api<{ rows: SkuSummaryRow[] }>('/api/sku-summary')).rows); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo<ColumnDef<SkuSummaryRow>[]>(() => [
    { key: 'sku', label: 'SKU OCS', width: 240, mono: true, title: true, value: (r) => r.sku, render: (r) => <span className="flex flex-col gap-0.5 min-w-0"><span className="mono font-semibold truncate">{r.sku}</span><CategoryChips isPhaseOut={r.isPhaseOut} isClearance={r.isClearance} info={r.phaseOutInfo} /></span> },
    { key: 'orders', label: 'Order ID', width: 90, align: 'right', type: 'number', value: (r) => r.orders },
    { key: 'qty', label: 'Qty pending', width: 100, align: 'right', type: 'number', value: (r) => r.qty, render: (r) => <b className="tabular">{fmtNumber(r.qty)}</b> },
    { key: 'noFollowUp', label: 'Belum TL', width: 90, align: 'right', type: 'number', value: (r) => r.noFollowUp, render: (r) => (r.noFollowUp ? <span className="text-critical font-semibold">{r.noFollowUp}</span> : '0') },
    { key: 'po', label: 'PO Eka Jaya', width: 170, value: (r) => (r.po.SUDAH ? `Sudah ${r.po.SUDAH}` : '') + (r.po.BELUM ? ` Belum ${r.po.BELUM}` : '') + (r.po.TIDAK_PERLU ? ` Tidak perlu ${r.po.TIDAK_PERLU}` : ''), render: (r) => (
      <span className="flex flex-wrap gap-1">
        {r.po.SUDAH > 0 && <Chip tone="informative">Sudah PO {r.po.SUDAH}</Chip>}
        {r.po.BELUM > 0 && <Chip tone="critical">Belum PO {r.po.BELUM}</Chip>}
        {r.po.TIDAK_PERLU > 0 && <Chip tone="neutral">Tidak perlu {r.po.TIDAK_PERLU}</Chip>}
      </span>
    ) },
    { key: 'poNumbers', label: 'No. PO', width: 140, priority: 2, value: (r) => r.poNumbers },
    { key: 'eta', label: 'ETA terdekat', width: 110, type: 'date', priority: 2, value: (r) => r.nearestEta, render: (r) => (r.nearestEta ? fmtDate(r.nearestEta) : '—') },
    { key: 'arrived', label: 'Sudah datang', width: 100, align: 'right', type: 'number', priority: 2, value: (r) => r.arrived },
    { key: 'reasons', label: 'Alasan', width: 220, priority: 3, value: (r) => r.reasons },
    { key: 'oldest', label: 'Input tertua', width: 130, type: 'date', priority: 3, value: (r) => r.oldestInputAt, render: (r) => fmtShort(r.oldestInputAt) },
  ], []);

  const total = useMemo(() => ({ skus: rows?.length ?? 0, qty: rows?.reduce((a, r) => a + r.qty, 0) ?? 0, noPo: rows?.filter((r) => r.po.BELUM > 0 && !r.isPhaseOut && !r.isClearance).length ?? 0, cat: rows?.filter((r) => r.isPhaseOut || r.isClearance).length ?? 0 }), [rows]);

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-tile"><div className="kpi-label">SKU pending</div><div className="kpi-value">{fmtNumber(total.skus)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">Total qty pending</div><div className="kpi-value">{fmtNumber(total.qty)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">SKU aktif belum open PO</div><div className="kpi-value" style={{ color: total.noPo ? 'var(--critical)' : undefined }}>{fmtNumber(total.noPo)}</div></div>
        <div className="card kpi-tile"><div className="kpi-label">SKU Phase Out / Clearance</div><div className="kpi-value" style={{ color: total.cat ? 'var(--negative)' : undefined }}>{fmtNumber(total.cat)}</div></div>
      </div>
      {rows === null ? <div className="py-10 grid place-items-center"><Spinner /></div> : (
        <DataTable id="rekap-sku" columns={columns} rows={rows} rowKey={(r) => r.sku} onRowClick={setPick} wrapHeaders compactToolbar defaultSort={[{ key: 'orders', dir: 'desc' }]} emptyText="Tidak ada SKU yang pending"
          toolbarExtra={<button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading} aria-label="Muat ulang">{loading ? <Spinner /> : <RefreshCw />}</button>} />
      )}
      <SkuFollowUp row={pick} onClose={() => setPick(null)} onSaved={load} canFollowUp={canFollowUp} reasons={reasons} />
    </>
  );
}

function SkuFollowUp({ row, onClose, onSaved, canFollowUp, reasons }: { row: SkuSummaryRow | null; onClose: () => void; onSaved: () => void; canFollowUp: boolean; reasons: string[] }) {
  const { toast } = useToast();
  const [f, setF] = useState({ reason: '', reasonNote: '', poStatus: 'SUDAH', poNumber: '', poDate: '', poEta: '', arrivalStatus: 'BELUM', arrivedAt: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!row) return;
    const suggested = row.isPhaseOut ? reasons.find((x) => /phase/i.test(x)) : row.isClearance ? reasons.find((x) => /clearance/i.test(x)) : '';
    setF({ reason: suggested ?? '', reasonNote: '', poStatus: row.isPhaseOut || row.isClearance ? 'TIDAK_PERLU' : 'SUDAH', poNumber: row.poNumbers.split(',')[0]?.trim() ?? '', poDate: '', poEta: '', arrivalStatus: 'BELUM', arrivedAt: '' });
  }, [row, reasons]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      const fu: Record<string, unknown> = { poStatus: f.poStatus };
      if (f.reason) fu.reason = f.reason;
      if (f.reasonNote) fu.reasonNote = f.reasonNote;
      if (f.poStatus === 'SUDAH') {
        fu.poNumber = f.poNumber;
        if (f.poDate) fu.poDate = f.poDate;
        if (f.poEta) fu.poEta = f.poEta;
        fu.arrivalStatus = f.arrivalStatus;
        if (f.arrivalStatus !== 'BELUM') fu.arrivedAt = f.arrivedAt;
      }
      const x = await api<{ updated: number; total: number }>('/api/items/followup', { method: 'POST', json: { sku: row.sku, followUp: fu } });
      toast(`Tindak lanjut tersimpan di ${x.updated} dari ${x.total} baris`, 'positive');
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'negative');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!row} onClose={onClose} title={row ? row.sku : ''}
      footer={row && (
        <>
          <Link href={`/monitoring?status=OPEN&sku=${encodeURIComponent(row.sku)}`} className="btn btn-ghost"><ListChecks /> Lihat {row.items} baris</Link>
          {canFollowUp && <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save />} Simpan ke semua baris</button>}
        </>
      )}>
      {row && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <b>{row.orders}</b> order · <b>{fmtNumber(row.qty)}</b> qty pending
            <CategoryChips isPhaseOut={row.isPhaseOut} isClearance={row.isClearance} info={row.phaseOutInfo} />
          </div>
          {row.isPhaseOut && <div className="alert alert-critical">Phase Out{row.phaseOutInfo ? ` — ${row.phaseOutInfo}` : ''}. Barang tidak dibeli lagi; umumnya order dibatalkan bila stok habis.</div>}
          {!canFollowUp ? <div className="text-sm text-label">Tindak lanjut hanya bisa diisi Inventory / Admin.</div> : (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Alasan pending" htmlFor="sf-r">
                  <select id="sf-r" className="select" value={f.reason} onChange={set('reason')}>
                    <option value="">— tidak diubah —</option>
                    {reasons.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Keterangan" htmlFor="sf-n"><input id="sf-n" className="input" value={f.reasonNote} onChange={set('reasonNote')} /></Field>
              </div>
              <Field label="PO ke PT Eka Jaya">
                <div className="seg" role="radiogroup">
                  {(['BELUM', 'SUDAH', 'TIDAK_PERLU'] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={f.poStatus === s} className={f.poStatus === s ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, poStatus: s }))}>{s === 'BELUM' ? 'Belum' : s === 'SUDAH' ? 'Sudah open PO' : 'Tidak perlu'}</button>
                  ))}
                </div>
              </Field>
              {f.poStatus === 'SUDAH' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="No. PO" htmlFor="sf-po" required><input id="sf-po" className="input" value={f.poNumber} onChange={set('poNumber')} autoComplete="off" /></Field>
                    <Field label="Tgl PO" htmlFor="sf-pd"><input id="sf-pd" type="date" className="input" value={f.poDate} onChange={set('poDate')} /></Field>
                    <Field label="Estimasi datang" htmlFor="sf-eta"><input id="sf-eta" type="date" className="input" value={f.poEta} onChange={set('poEta')} /></Field>
                  </div>
                  <Field label="Barang sudah datang?">
                    <div className="seg" role="radiogroup">
                      {(['BELUM', 'SEBAGIAN', 'SUDAH'] as const).map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={f.arrivalStatus === s} className={f.arrivalStatus === s ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, arrivalStatus: s }))}>{s === 'BELUM' ? 'Belum' : s === 'SEBAGIAN' ? 'Sebagian' : 'Sudah datang'}</button>
                      ))}
                    </div>
                  </Field>
                  {f.arrivalStatus !== 'BELUM' && <Field label="Tgl datang" htmlFor="sf-ad" required><input id="sf-ad" type="date" className="input md:!w-1/2" value={f.arrivedAt} onChange={set('arrivedAt')} /></Field>}
                </>
              )}
              <div className="text-xs text-label">Berlaku ke {row.items} baris pending SKU ini yang ordernya masih belum terproses.</div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
