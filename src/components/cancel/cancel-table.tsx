'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Save, Users, ShieldCheck, ShieldOff, PackageSearch, Zap, AlertTriangle } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { Chip, Field, Spinner, type Tone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { fmtDateTime, fmtShort } from '@/lib/utils';
import { REVIEW_LABEL, STAGE_LABEL, TEAM_LABEL, VERDICT_LABEL, type Review, type Stage, type Team } from '@/lib/cancel';
import { statusName } from '@/lib/ocs-status';
import type { CancelRow } from '@/server/cancel-query';

const fmtH = (h: number) => `${h.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;
const REVIEW_TONE: Record<Review, Tone> = { BELUM: 'critical', VALID: 'negative', BUKAN_GUDANG: 'neutral' };

export function TeamChip({ team, auto }: { team: Team | null; auto?: Team | null }) {
  if (!team) return null;
  const changed = auto && auto !== team;
  return <Chip tone={team === 'FULFILLMENT' ? 'brand' : 'informative'} icon={<Users />} title={changed ? `Diubah lead dari ${TEAM_LABEL[auto!]}` : 'Atribusi otomatis'}>{TEAM_LABEL[team]}{changed ? ' *' : ''}</Chip>;
}

type View = 'unreviewed' | 'fault' | 'excluded' | 'unchecked';
const VIEWS: Array<[View, string]> = [['unreviewed', 'Belum direview'], ['fault', 'Semua kesalahan'], ['excluded', 'Bukan kesalahan gudang'], ['unchecked', 'Log belum dicek']];

export function CancelTable({ rows, canReview, reasons }: { rows: CancelRow[]; canReview: boolean; reasons: string[] }) {
  const [view, setView] = useState<View>('unreviewed');
  const [team, setTeam] = useState<'' | Team>('');
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => rows.filter((r) => {
    if (view === 'unchecked') return r.verdict === 'BELUM_DICEK';
    if (r.verdict !== 'KESALAHAN') return false;
    if (team && r.team !== team) return false;
    if (view === 'unreviewed') return r.reviewStatus === 'BELUM';
    if (view === 'excluded') return r.reviewStatus === 'BUKAN_GUDANG';
    return r.reviewStatus !== 'BUKAN_GUDANG';
  }), [rows, view, team]);

  const columns = useMemo<ColumnDef<CancelRow>[]>(() => [
    { key: 'orderId', label: 'Order ID', width: 180, mono: true, title: true, value: (r) => r.orderId, render: (r) => <span className="flex items-center gap-1 min-w-0"><span className="mono font-semibold truncate">{r.orderId}</span>{r.isInstant && <Zap className="w-3.5 h-3.5 text-critical shrink-0" aria-label="Instant" />}</span> },
    { key: 'team', label: 'Tim', width: 120, value: (r) => (r.team ? TEAM_LABEL[r.team] : ''), render: (r) => (r.verdict === 'BELUM_DICEK' ? <Chip tone="neutral">Belum dicek</Chip> : <TeamChip team={r.team} auto={r.autoTeam} />) },
    { key: 'stage', label: 'Tahap terakhir', width: 190, value: (r) => (r.stage ? STAGE_LABEL[r.stage] : ''), render: (r) => (r.stage ? <span className="truncate" title={r.lastStatusBeforeCancel ?? ''}>{STAGE_LABEL[r.stage]}</span> : '—') },
    { key: 'hours', label: 'Jam kerja s/d cancel', width: 120, align: 'right', type: 'number', value: (r) => r.workHours, render: (r) => <span className={r.verdict === 'KESALAHAN' ? 'text-negative font-semibold tabular' : 'tabular'}>{r.verdict === 'BELUM_DICEK' ? `≤ ${fmtH(r.workHours)}` : fmtH(r.workHours)}</span> },
    { key: 'review', label: 'Review', width: 150, value: (r) => REVIEW_LABEL[r.reviewStatus], render: (r) => <Chip tone={REVIEW_TONE[r.reviewStatus]}>{REVIEW_LABEL[r.reviewStatus]}</Chip> },
    { key: 'ready', label: 'Ready to process', width: 130, type: 'date', priority: 2, value: (r) => r.readyAt ?? r.orderCreatedAt, render: (r) => <span className="tabular">{fmtShort(r.readyAt ?? r.orderCreatedAt)}</span> },
    { key: 'cancel', label: 'Cancel', width: 130, type: 'date', priority: 2, value: (r) => r.cancelledAt ?? r.ocsUpdatedAt, render: (r) => <span className="tabular">{fmtShort(r.cancelledAt ?? r.ocsUpdatedAt)}</span> },
    { key: 'shop', label: 'Toko', width: 100, priority: 2, value: (r) => r.shopName ?? '' },
    { key: 'platform', label: 'Platform', width: 110, priority: 3, value: (r) => r.platform ?? '' },
    { key: 'area', label: 'Area', width: 100, priority: 2, value: (r) => r.area ?? '' },
    { key: 'picker', label: 'Picker', width: 110, priority: 3, value: (r) => r.pickerId ?? '' },
    { key: 'packer', label: 'Packer', width: 110, priority: 3, value: (r) => r.packerId ?? '' },
    { key: 'product', label: 'Produk', width: 200, priority: 3, value: (r) => r.productName ?? '' },
  ], []);

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="seg" role="tablist" aria-label="Tampilan">
          {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'is-active' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view !== 'unchecked' && (
          <select className="select !w-auto !h-9 !text-sm" value={team} onChange={(e) => setTeam(e.target.value as '' | Team)} aria-label="Tim">
            <option value="">Semua tim</option>
            <option value="FULFILLMENT">Fulfillment</option>
            <option value="INVENTORY">Inventory</option>
          </select>
        )}
      </div>
      <DataTable id="cancel-faults" columns={columns} rows={shown} rowKey={(r) => r.orderId} onRowClick={(r) => setOpen(r.orderId)} wrapHeaders compactToolbar
        defaultSort={[{ key: 'cancel', dir: 'desc' }]} emptyText={view === 'unreviewed' ? 'Tidak ada kesalahan yang menunggu review' : 'Tidak ada data'} />
      <CancelDetail orderId={open} onClose={() => setOpen(null)} canReview={canReview} reasons={reasons} />
    </>
  );
}

type Detail = {
  row: CancelRow & { ocsLogs: Array<{ at: string; code: number; status: string | null }> | null; hasPicklist: boolean | null; picked: boolean | null; packed: boolean | null; pickFailed: boolean | null; detailedAt: string | null };
  canReview: boolean;
};

function CancelDetail({ orderId, onClose, canReview, reasons }: { orderId: string | null; onClose: () => void; canReview: boolean; reasons: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ reviewStatus: 'VALID' as Review, reviewTeam: '' as '' | Team, reviewReason: '', reviewNote: '' });

  const load = useCallback(async () => {
    if (!orderId) return;
    const x = await api<Detail>(`/api/cancel/${encodeURIComponent(orderId)}`);
    setD(x);
    const r = x.row;
    setF({ reviewStatus: r.reviewStatus === 'BELUM' ? 'VALID' : r.reviewStatus, reviewTeam: r.reviewTeam ?? '', reviewReason: r.reviewReason ?? '', reviewNote: r.reviewNote ?? '' });
  }, [orderId]);
  useEffect(() => { setD(null); if (orderId) void load().catch((e) => toast((e as Error).message, 'negative')); }, [orderId, load, toast]);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try { toast(await fn(), 'positive'); await load(); router.refresh(); } catch (e) { toast((e as Error).message, 'negative'); } finally { setBusy(null); }
  }
  const save = (status?: Review) => act('save', async () => {
    const x = await api<{ message: string }>(`/api/cancel/${encodeURIComponent(orderId!)}`, { method: 'PATCH', json: { ...f, reviewStatus: status ?? f.reviewStatus, reviewTeam: f.reviewTeam || null } });
    return x.message;
  });
  const reopen = () => act('reopen', async () => { await api(`/api/cancel/${encodeURIComponent(orderId!)}`, { method: 'POST' }); return 'Log dibuka ulang dari OCS'; });

  const r = d?.row;
  return (
    <Modal open={!!orderId} onClose={onClose} title={orderId ? `Cancel · ${orderId}` : ''} size="xl">
      {!r ? <div className="py-10 grid place-items-center"><Spinner /></div> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            <Chip tone={r.verdict === 'KESALAHAN' ? 'negative' : r.verdict === 'BELUM_DICEK' ? 'critical' : 'positive'} icon={r.verdict === 'KESALAHAN' ? <AlertTriangle /> : undefined}>{VERDICT_LABEL[r.verdict]}</Chip>
            <TeamChip team={r.team} auto={r.autoTeam} />
            {r.stage && <Chip tone="neutral" icon={<PackageSearch />}>{STAGE_LABEL[r.stage as Stage]}</Chip>}
            {r.isInstant && <Chip tone="critical" icon={<Zap />}>Instant</Chip>}
            {r.inPendingKiriman && <Chip tone="informative">Tercatat di Pending Kiriman</Chip>}
            <Chip tone={REVIEW_TONE[r.reviewStatus]}>{REVIEW_LABEL[r.reviewStatus]}</Chip>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <Info label="Order dibuat" value={fmtDateTime(r.orderCreatedAt)} />
            <Info label="Ready to process" value={fmtDateTime(r.readyAt)} />
            <Info label="Cancel" value={fmtDateTime(r.cancelledAt ?? r.ocsUpdatedAt)} />
            <Info label="Jam kerja s/d cancel" value={<b className={r.verdict === 'KESALAHAN' ? 'text-negative' : ''}>{fmtH(r.workHours)} <span className="text-label font-normal">/ batas {fmtH(r.slaHours)}</span></b>} />
            <Info label="Toko · Platform" value={[r.shopName, r.platform].filter(Boolean).join(' · ') || '—'} />
            <Info label="Area · Tipe" value={[r.area, r.orderType].filter(Boolean).join(' · ') || '—'} />
            <Info label="Status terakhir sebelum cancel" value={r.lastStatusBeforeCancel ?? (r.maxCodeBeforeCancel ? statusName(r.maxCodeBeforeCancel) : '—')} />
            <Info label="Picklist · Picker · Packer" value={[r.picklistNo, r.pickerId, r.packerId].filter(Boolean).join(' · ') || '—'} />
          </dl>
          {r.productName && <div className="text-sm"><span className="text-label">Produk:</span> {r.productName}{r.totalQty ? ` · ${r.totalQty} pcs` : ''}</div>}
          {r.detailError && <div className="alert alert-critical">{r.detailError}</div>}
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={reopen} disabled={!!busy}>{busy === 'reopen' ? <Spinner /> : <RefreshCw />} Buka ulang log dari OCS</button></div>

          {canReview && r.verdict === 'KESALAHAN' && (
            <section className="card !p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="card-title !text-sm">Review lead</div>
                {r.reviewedBy && <span className="text-xs text-label">{r.reviewedBy} · {fmtDateTime(r.reviewedAt)}</span>}
              </div>
              <div className="seg" role="radiogroup" aria-label="Hasil review">
                <button type="button" role="radio" aria-checked={f.reviewStatus === 'VALID'} className={f.reviewStatus === 'VALID' ? 'is-active' : ''} onClick={() => setF({ ...f, reviewStatus: 'VALID' })}><ShieldCheck className="inline w-4 h-4 mr-1" />Benar kesalahan gudang</button>
                <button type="button" role="radio" aria-checked={f.reviewStatus === 'BUKAN_GUDANG'} className={f.reviewStatus === 'BUKAN_GUDANG' ? 'is-active' : ''} onClick={() => setF({ ...f, reviewStatus: 'BUKAN_GUDANG' })}><ShieldOff className="inline w-4 h-4 mr-1" />Bukan kesalahan gudang</button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {f.reviewStatus === 'VALID' ? (
                  <Field label="Tim yang bertanggung jawab" htmlFor="rv-team" hint={`Otomatis: ${r.autoTeam ? TEAM_LABEL[r.autoTeam] : '—'}`}>
                    <select id="rv-team" className="select" value={f.reviewTeam} onChange={(e) => setF({ ...f, reviewTeam: e.target.value as '' | Team })}>
                      <option value="">Ikuti otomatis</option>
                      <option value="FULFILLMENT">Fulfillment</option>
                      <option value="INVENTORY">Inventory</option>
                    </select>
                  </Field>
                ) : (
                  <Field label="Alasan" htmlFor="rv-reason" required>
                    <select id="rv-reason" className="select" value={f.reviewReason} onChange={(e) => setF({ ...f, reviewReason: e.target.value })}>
                      <option value="">— pilih alasan —</option>
                      {[...new Set([...reasons, ...(f.reviewReason && !reasons.includes(f.reviewReason) ? [f.reviewReason] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Catatan" htmlFor="rv-note"><input id="rv-note" className="input" value={f.reviewNote} onChange={(e) => setF({ ...f, reviewNote: e.target.value })} /></Field>
              </div>
              <div className="flex gap-2 justify-end flex-wrap">
                {r.reviewStatus !== 'BELUM' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => save('BELUM')} disabled={!!busy}>Batalkan review</button>}
                <button type="button" className="btn btn-primary" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? <Spinner /> : <Save />} Simpan review</button>
              </div>
            </section>
          )}
          {!canReview && r.verdict === 'KESALAHAN' && <div className="text-xs text-label">Review hanya bisa dilakukan Admin atau user bertanda Lead.</div>}
          {r.reviewStatus === 'BUKAN_GUDANG' && !canReview && <div className="text-sm"><b>Alasan:</b> {r.reviewReason}{r.reviewNote ? ` — ${r.reviewNote}` : ''}</div>}

          <section>
            <div className="card-title !text-sm mb-2">Log status OCS</div>
            {r.ocsLogs?.length ? (
              <ol className="timeline">
                {r.ocsLogs.map((l, i) => (
                  <li key={i} className="tl-item">
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <div className="tl-meta">{fmtDateTime(l.at)}</div>
                      <div className={`text-sm ${l.code === 90000 || l.code === 11100 ? 'text-negative font-semibold' : ''}`}>{l.status ?? statusName(l.code)} <span className="text-label text-xs">({l.code})</span></div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <div className="text-sm text-label">Log belum dibuka.</div>}
          </section>
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
