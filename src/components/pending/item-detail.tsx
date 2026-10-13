'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, Trash2, Lock, Unlock, History } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Field, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { fmtDateTime, fmtAge, toDateInput, timeAgo } from '@/lib/utils';
import type { ItemRow } from '@/server/items';
import type { RoleName } from '@/lib/session';
import { ResolutionChip, OcsChip, BucketChip, CategoryChips, PoChip, ArrivalChip } from './chips';
import { CANCEL_BUCKET_HINT } from '@/lib/kpi';

type Detail = {
  row: ItemRow;
  siblings: { id: string; sku: string; qty: number }[];
  ocsSkus: { sku: string; bundleSku: string | null; qty: number; name: string | null }[] | null;
  logs: { id: string; at: string; byName: string; action: string; detail: string | null }[];
};

const ACTION_LABEL: Record<string, string> = { INPUT: 'Input', UBAH: 'Ubah', TINDAK_LANJUT: 'Tindak lanjut', STATUS_OCS: 'Status OCS', RESOLUSI: 'Penyelesaian', HAPUS: 'Hapus' };

export function ItemDetail({ id, onClose, onChanged, me, reasons }: { id: string | null; onClose: () => void; onChanged: () => void; me: { id: string; role: RoleName }; reasons: string[] }) {
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Form tindak lanjut
  const [f, setF] = useState({ reason: '', reasonNote: '', poStatus: 'BELUM', poNumber: '', poDate: '', poEta: '', poQty: '', arrivalStatus: 'BELUM', arrivedAt: '', arrivedQty: '' });
  const [applySku, setApplySku] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [manualRes, setManualRes] = useState('CANCELLED');

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const x = await api<Detail>(`/api/items/${id}`);
      setD(x);
      const r = x.row;
      setF({
        reason: r.reason ?? '', reasonNote: r.reasonNote ?? '', poStatus: r.poStatus, poNumber: r.poNumber ?? '',
        poDate: toDateInput(r.poDate), poEta: toDateInput(r.poEta), poQty: r.poQty?.toString() ?? '',
        arrivalStatus: r.arrivalStatus, arrivedAt: toDateInput(r.arrivedAt), arrivedQty: r.arrivedQty?.toString() ?? '',
      });
      setQty(String(r.qty));
      setNote(r.note ?? '');
      setApplySku(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => { setD(null); if (id) void load(); }, [id, load]);

  const r = d?.row;
  const canFU = me.role === 'ADMIN' || me.role === 'INVENTORY';
  const canEditQty = !!r && (me.role === 'ADMIN' || r.inputById === me.id) && r.resolution === 'OPEN';
  const canDelete = !!r && (me.role === 'ADMIN' || (r.inputById === me.id && !r.followUpAt));

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) toast(msg, 'positive');
      onChanged();
      await load();
    } catch (e) {
      toast((e as Error).message, 'negative');
    } finally {
      setBusy(null);
    }
  }

  const saveFollowUp = () => run('fu', async () => {
    const body = {
      reason: f.reason || null, reasonNote: f.reasonNote || null, poStatus: f.poStatus,
      poNumber: f.poStatus === 'SUDAH' ? f.poNumber : null, poDate: f.poStatus === 'SUDAH' ? f.poDate || null : null,
      poEta: f.poStatus === 'SUDAH' ? f.poEta || null : null, poQty: f.poStatus === 'SUDAH' ? f.poQty || null : null,
      arrivalStatus: f.poStatus === 'SUDAH' ? f.arrivalStatus : 'BELUM',
      arrivedAt: f.poStatus === 'SUDAH' && f.arrivalStatus !== 'BELUM' ? f.arrivedAt || null : null,
      arrivedQty: f.poStatus === 'SUDAH' && f.arrivalStatus !== 'BELUM' ? f.arrivedQty || null : null,
    };
    const x = await api<{ updated: number }>(`/api/items/${id}`, { method: 'PATCH', json: { followUp: body, applyToSameSku: applySku } });
    return x.updated > 1 ? `Tindak lanjut disimpan ke ${x.updated} baris` : 'Tindak lanjut disimpan';
  });

  const saveQty = () => run('qty', async () => {
    await api(`/api/items/${id}`, { method: 'PATCH', json: { qty: Number(qty), note } });
    return 'Perubahan disimpan';
  });

  const recheck = () => run('recheck', async () => {
    const x = await api<{ message: string }>(`/api/orders/${encodeURIComponent(r!.orderId)}`, { method: 'POST' });
    return x.message;
  });

  const setManual = (release: boolean) => run('manual', async () => {
    await api(`/api/orders/${encodeURIComponent(r!.orderId)}`, { method: 'PATCH', json: release ? { release: true } : { resolution: manualRes } });
    return release ? 'Kembali mengikuti OCS' : 'Penyelesaian dikunci manual';
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [id]);
  const doDelete = () => run('del', async () => {
    await api(`/api/items/${id}`, { method: 'DELETE' });
    onClose();
    return 'Baris dihapus';
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Modal open={!!id} onClose={onClose} title={r ? `${r.orderId} · ${r.sku}` : 'Detail pending'} size="xl">
      {err && <div className="alert alert-negative">{err}</div>}
      {!d && !err && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {r && d && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            <ResolutionChip resolution={r.resolution} manual={r.manualResolution} />
            <OcsChip code={r.ocsStatusCode} name={r.ocsStatusName} found={r.ocsFound} error={r.lastCheckError} />
            <BucketChip bucket={r.cancelBucket} />
            <CategoryChips isPhaseOut={r.isPhaseOut} isClearance={r.isClearance} info={r.phaseOutInfo} />
            {r.skuInOrder === false && <span className="chip chip-critical">SKU tidak ada di isi order OCS</span>}
          </div>
          {(r.isPhaseOut || r.isClearance) && r.resolution === 'OPEN' && (
            <div className="alert alert-critical">
              {r.isPhaseOut ? <>SKU ini masuk daftar <b>Phase Out</b> di doi-monitor{r.phaseOutInfo ? ` (${r.phaseOutInfo})` : ''}.</> : <>SKU ini kode <b>Clearance</b> (CS-).</>} Kemungkinan sudah tidak dijual lagi — pertimbangkan pembatalan order bila stok memang habis.
            </div>
          )}

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <Info label="Qty pending" value={<b className="tabular">{r.qty}</b>} />
            <Info label="Diinput" value={<>{r.inputByName}<div className="text-xs text-label">{fmtDateTime(r.inputAt)}</div></>} />
            <Info label="Umur pending" value={fmtAge(r.ageDays)} />
            <Info label="Toko · Platform" value={[r.shopName, r.platform].filter(Boolean).join(' · ') || '—'} />
            <Info label="Area" value={r.area ?? '—'} />
            <Info label="Order dibuat" value={fmtDateTime(r.orderCreatedAt)} />
            <Info label={r.resolution === 'CANCELLED' ? 'Waktu batal' : 'Waktu terproses'} value={<>{fmtDateTime(r.resolution === 'CANCELLED' ? r.cancelledAt : r.processedAt)}{r.cancelBucket && <div className="text-xs text-label">{CANCEL_BUCKET_HINT[r.cancelBucket]}</div>}</>} />
            <Info label="Cek OCS terakhir" value={<>{timeAgo(r.lastCheckedAt)}{r.lastCheckError && <div className="text-xs text-negative">{r.lastCheckError}</div>}</>} />
          </dl>
          {r.note && <div className="text-sm"><span className="text-label">Catatan fulfillment:</span> {r.note}</div>}

          <div className="flex flex-wrap gap-2">
            {me.role !== 'VIEWER' && <button type="button" className="btn btn-secondary btn-sm" onClick={recheck} disabled={!!busy}>{busy === 'recheck' ? <Spinner /> : <RefreshCw />} Cek ulang status OCS</button>}
          </div>

          {(d.ocsSkus?.length || d.siblings.length) ? (
            <div className="grid md:grid-cols-2 gap-3">
              {d.ocsSkus && d.ocsSkus.length > 0 && (
                <div className="card !p-3">
                  <div className="card-title !text-sm mb-1">Isi order di OCS</div>
                  <ul className="text-sm flex flex-col gap-1">
                    {d.ocsSkus.map((s, i) => (
                      <li key={i} className="flex justify-between gap-2 min-w-0">
                        <span className={`truncate mono ${s.sku.toUpperCase() === r.sku.toUpperCase() || (s.bundleSku ?? '').toUpperCase() === r.sku.toUpperCase() ? 'font-bold text-primary' : ''}`} title={s.name ?? ''}>{s.sku}{s.bundleSku ? <span className="text-label"> ({s.bundleSku})</span> : null}</span>
                        <span className="tabular">× {s.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.siblings.length > 0 && (
                <div className="card !p-3">
                  <div className="card-title !text-sm mb-1">SKU lain yang pending di order ini</div>
                  <ul className="text-sm flex flex-col gap-1">
                    {d.siblings.map((s) => <li key={s.id} className="flex justify-between gap-2"><span className="mono truncate">{s.sku}</span><span className="tabular">× {s.qty}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {canFU && (
            <section className="card !p-3 flex flex-col gap-3" aria-labelledby="fu-title">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div id="fu-title" className="card-title !text-sm">Tindak lanjut Inventory</div>
                {r.followUpAt && <span className="text-xs text-label">Terakhir: {r.followUpByName} · {fmtDateTime(r.followUpAt)}</span>}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Kenapa pending?" htmlFor="fu-reason">
                  <select id="fu-reason" className="select" value={f.reason} onChange={set('reason')}>
                    <option value="">— pilih alasan —</option>
                    {[...new Set([...reasons, ...(f.reason && !reasons.includes(f.reason) ? [f.reason] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Keterangan" htmlFor="fu-note">
                  <input id="fu-note" className="input" value={f.reasonNote} onChange={set('reasonNote')} placeholder="mis. stok rak 0, SAP masih 12" />
                </Field>
              </div>
              <Field label="Sudah open PO ke PT Eka Jaya?">
                <div className="seg" role="radiogroup" aria-label="Status PO">
                  {(['BELUM', 'SUDAH', 'TIDAK_PERLU'] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={f.poStatus === s} className={f.poStatus === s ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, poStatus: s }))}>
                      {s === 'BELUM' ? 'Belum' : s === 'SUDAH' ? 'Sudah open PO' : 'Tidak perlu'}
                    </button>
                  ))}
                </div>
              </Field>
              {f.poStatus === 'SUDAH' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="No. PO" htmlFor="fu-pono" required><input id="fu-pono" className="input" value={f.poNumber} onChange={set('poNumber')} autoComplete="off" /></Field>
                    <Field label="Tgl PO" htmlFor="fu-podate"><input id="fu-podate" type="date" className="input" value={f.poDate} onChange={set('poDate')} /></Field>
                    <Field label="Estimasi datang" htmlFor="fu-eta"><input id="fu-eta" type="date" className="input" value={f.poEta} onChange={set('poEta')} /></Field>
                    <Field label="Qty PO" htmlFor="fu-poqty"><input id="fu-poqty" className="input" inputMode="numeric" value={f.poQty} onChange={set('poQty')} /></Field>
                  </div>
                  <Field label="Barang PO sudah datang?">
                    <div className="seg" role="radiogroup" aria-label="Status kedatangan">
                      {(['BELUM', 'SEBAGIAN', 'SUDAH'] as const).map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={f.arrivalStatus === s} className={f.arrivalStatus === s ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, arrivalStatus: s }))}>
                          {s === 'BELUM' ? 'Belum' : s === 'SEBAGIAN' ? 'Sebagian' : 'Sudah datang'}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {f.arrivalStatus !== 'BELUM' && (
                    <div className="grid grid-cols-2 gap-3 md:max-w-[50%]">
                      <Field label="Tgl datang" htmlFor="fu-arr" required><input id="fu-arr" type="date" className="input" value={f.arrivedAt} onChange={set('arrivedAt')} /></Field>
                      <Field label="Qty datang" htmlFor="fu-arrq"><input id="fu-arrq" className="input" inputMode="numeric" value={f.arrivedQty} onChange={set('arrivedQty')} /></Field>
                    </div>
                  )}
                </>
              )}
              {r.resolution === 'OPEN' && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={applySku} onChange={(e) => setApplySku(e.target.checked)} />
                  <span>Terapkan juga ke <b>semua baris pending lain dengan SKU {r.sku}</b> yang ordernya masih pending</span>
                </label>
              )}
              <div className="flex gap-2 flex-wrap">
                <PoChip status={r.poStatus} />
                {r.poStatus === 'SUDAH' && <ArrivalChip status={r.arrivalStatus} />}
                <span className="flex-1" />
                <button type="button" className="btn btn-primary" onClick={saveFollowUp} disabled={!!busy}>{busy === 'fu' ? <Spinner /> : <Save />} Simpan tindak lanjut</button>
              </div>
            </section>
          )}
          {!canFU && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Alasan pending" value={r.reason ?? 'Belum diisi Inventory'} />
              <Info label="PO ke PT Eka Jaya" value={<div className="flex gap-1 flex-wrap"><PoChip status={r.poStatus} />{r.poStatus === 'SUDAH' && <ArrivalChip status={r.arrivalStatus} />}</div>} />
              {r.reasonNote && <Info label="Keterangan" value={r.reasonNote} />}
              {r.poNumber && <Info label="No. PO · ETA" value={`${r.poNumber} · ${r.poEta ? toDateInput(r.poEta) : '—'}`} />}
            </div>
          )}

          {canEditQty && (
            <section className="card !p-3 flex flex-col gap-3">
              <div className="card-title !text-sm">Ubah input</div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <Field label="Qty" htmlFor="ed-qty"><input id="ed-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Catatan" htmlFor="ed-note"><input id="ed-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </div>
              <div className="flex justify-end"><button type="button" className="btn btn-secondary btn-sm" onClick={saveQty} disabled={!!busy}>{busy === 'qty' ? <Spinner /> : <Save />} Simpan perubahan</button></div>
            </section>
          )}

          {me.role === 'ADMIN' && (
            <section className="card !p-3 flex flex-col gap-2">
              <div className="card-title !text-sm">Admin — penyelesaian manual</div>
              <div className="text-xs text-label">Pakai bila order tidak ditemukan di OCS atau statusnya keliru. Selama dikunci, sinkron OCS tidak mengubah penyelesaian order ini.</div>
              <div className="flex gap-2 flex-wrap items-center">
                <select className="select !w-auto" value={manualRes} onChange={(e) => setManualRes(e.target.value)} aria-label="Penyelesaian manual">
                  <option value="PROCESSED">Terproses</option>
                  <option value="CANCELLED">Batal</option>
                  <option value="OPEN">Masih pending</option>
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManual(false)} disabled={!!busy}><Lock /> Kunci</button>
                {r.manualResolution && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(true)} disabled={!!busy}><Unlock /> Ikuti OCS lagi</button>}
              </div>
            </section>
          )}

          <section>
            <div className="card-title !text-sm flex items-center gap-2 mb-2"><History className="w-4 h-4" /> Riwayat</div>
            <ol className="timeline">
              {d.logs.map((l) => (
                <li key={l.id} className="tl-item">
                  <span className="tl-dot" />
                  <div className="tl-body">
                    <div className="tl-meta">{fmtDateTime(l.at)} · {l.byName} · {ACTION_LABEL[l.action] ?? l.action}</div>
                    {l.detail && <div className="text-sm">{l.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {canDelete && (
            <div className="flex justify-end gap-2 items-center border-t border-subtle pt-3">
              {!confirmDelete ? (
                <button type="button" className="btn btn-ghost btn-sm text-negative" onClick={() => setConfirmDelete(true)}><Trash2 /> Hapus baris ini</button>
              ) : (
                <>
                  <span className="text-sm">Yakin hapus baris {r.sku}?</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Batal</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={doDelete} disabled={!!busy}>{busy === 'del' ? <Spinner /> : <Trash2 />} Hapus</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-label">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
