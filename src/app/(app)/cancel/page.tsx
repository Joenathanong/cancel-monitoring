import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { canReviewCancel } from '@/lib/roles';
import { cancelDashboard, type CancelDashboard } from '@/server/cancel-query';
import { parseCancelFilter } from '@/lib/cancel-filter';
import { CUTOFF_LABEL, STAGE_LABEL, type Stage } from '@/lib/cancel';
import { fmtNumber, fmtPct } from '@/lib/utils';
import { KpiTile } from '@/components/dashboard/kpi-charts';
import { CancelFilters } from '@/components/cancel/cancel-filters';
import { CancelSyncBar } from '@/components/cancel/cancel-sync-bar';
import { CancelTable } from '@/components/cancel/cancel-table';

export const dynamic = 'force-dynamic';

// Warna seri mengikuti entitas (design-ocs §4): Fulfillment = c1, Inventory = c3.
const C_FF = 'var(--c1)';
const C_INV = 'var(--c3)';

export default async function CancelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const f = parseCancelFilter({ get: (k) => sp[k] ?? null });
  const d = await cancelDashboard(f, s);
  const t = d.totals;
  const faults = t.fulfillment + t.inventory;
  const h = (x: number) => `${x.toLocaleString('id-ID', { maximumFractionDigits: 2 })} jam`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Monitoring Cancel</h1>
        <div className="text-sm text-label mt-1">
          Kesalahan gudang = order cancel setelah ≥ <b>{h(s.cancelSlaHours)}</b> kerja (instant ≥ <b>{h(s.cancelSlaInstantHours)}</b>) sejak READY TO PROCESS dan belum <b>{CUTOFF_LABEL[s.cancelCutoff]}</b>. Jam kerja {s.workStart}–{s.workEnd} WIB. Tanggal = tanggal order dibuat.
        </div>
      </div>
      <Suspense fallback={null}><CancelFilters from={f.from} to={f.to} area={f.area} platform={f.platform} shop={f.shop} options={d.options} /></Suspense>
      <CancelSyncBar canSync={u.role !== 'VIEWER'} unchecked={t.unchecked} />

      <div className="kpi-grid">
        <KpiTile label="Order cancel" value={fmtNumber(t.cancelled)} sub={t.orders ? `${fmtPct((t.cancelled / t.orders) * 100, 2)} dari ${fmtNumber(t.orders)} order` : 'rasio tersedia tanpa saringan'} />
        <KpiTile label="Kesalahan gudang" value={fmtNumber(faults)} tone={faults ? 'negative' : undefined} sub={<>{t.cancelled ? fmtPct((faults / t.cancelled) * 100, 1) : '0%'} dari cancel{t.orders ? ` · ${fmtPct((faults / t.orders) * 100, 2)} dari order` : ''}</>} />
        <KpiTile label="Fulfillment" value={fmtNumber(t.fulfillment)} sub="sudah dipick / belum masuk picklist" />
        <KpiTile label="Inventory" value={fmtNumber(t.inventory)} sub="tidak pernah dipick / stok pending" />
        <KpiTile label="Belum direview lead" value={fmtNumber(t.unreviewed)} tone={t.unreviewed ? 'critical' : undefined} sub={`${fmtNumber(t.faultValid)} dikonfirmasi · ${fmtNumber(t.excluded)} dikecualikan`} />
        <KpiTile label="Cancel wajar" value={fmtNumber(t.quick + t.shipped)} tone="positive" sub={`${fmtNumber(t.quick)} di bawah batas jam · ${fmtNumber(t.shipped)} sudah diserahkan`} />
      </div>
      {t.unchecked > 0 && (
        <div className="alert alert-critical">{fmtNumber(t.unchecked)} order cancel di rentang ini mungkin kesalahan gudang tapi lognya belum dibuka dari OCS — angka di atas belum final. Dibuka bertahap tiap sinkron, atau jalankan <code>npm run backfill:cancel</code> dari komputer.</div>
      )}

      <div className="card flex flex-col gap-3 min-w-0">
        <div className="card-title">Kesalahan gudang per hari</div>
        <DailyBars days={d.days} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Tahap terakhir sebelum cancel" items={d.stages.map((x) => ({ ...x, label: STAGE_LABEL[x.key as Stage] ?? x.key }))} total={faults} />
        <Breakdown title="Per area" items={d.areas} total={faults} />
        <Breakdown title="Per toko" items={d.shops} total={faults} />
        <Breakdown title="Per platform" items={d.platforms} total={faults} />
        <Breakdown title="Jam ready to process (WIB)" items={d.hours} total={faults} compact />
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Picker & packer (kesalahan Fulfillment)</div>
          <PeopleList title="Picker" items={d.pickers} />
          <PeopleList title="Packer" items={d.packers} />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Daftar kesalahan</h2>
        <CancelTable rows={d.rows} canReview={canReviewCancel(u)} reasons={s.cancelReviewReasons} />
      </section>
    </div>
  );
}

function DailyBars({ days }: { days: CancelDashboard['days'] }) {
  const show = days.slice(-31);
  const max = Math.max(1, ...show.map((x) => x.fulfillment + x.inventory));
  if (!show.length) return <div className="text-sm text-label">Belum ada data.</div>;
  return (
    <div>
      <div className="hidden md:flex items-end gap-1 h-[170px] border-b border-strong px-1">
        {show.map((x) => {
          const n = x.fulfillment + x.inventory;
          return (
            <div key={x.day} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={`${x.day}: ${x.fulfillment} Fulfillment, ${x.inventory} Inventory · ${x.cancelled} cancel${x.orders ? ` dari ${x.orders} order` : ''}`}>
              <span className="text-[10px] tabular text-label">{n || ''}</span>
              <div className="w-full max-w-[28px] flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }}>
                {x.fulfillment > 0 && <div style={{ height: `${(x.fulfillment / n) * 100}%`, background: C_FF }} />}
                {x.inventory > 0 && <div style={{ height: `${(x.inventory / n) * 100}%`, background: C_INV }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden md:flex gap-1 mt-1 px-1">
        {show.map((x, i) => <div key={x.day} className="flex-1 min-w-0 text-[10px] text-center text-label tabular">{show.length <= 16 || i % 2 === 0 ? x.day.slice(8) : ''}</div>)}
      </div>
      <ul className="md:hidden flex flex-col gap-1 text-sm">
        {[...show].reverse().filter((x) => x.fulfillment + x.inventory > 0 || x.cancelled > 0).slice(0, 14).map((x) => (
          <li key={x.day} className="flex justify-between gap-2"><span className="tabular">{x.day.slice(5)}</span><span className="tabular text-label"><b className="text-ink">{x.fulfillment + x.inventory}</b> salah gudang · {x.cancelled} cancel</span></li>
        ))}
      </ul>
      <div className="flex gap-4 mt-2 text-xs text-label flex-wrap">
        <span className="flex items-center gap-1"><span className="dot" style={{ background: C_FF }} /> Fulfillment</span>
        <span className="flex items-center gap-1"><span className="dot" style={{ background: C_INV }} /> Inventory</span>
      </div>
    </div>
  );
}

function Breakdown({ title, items, total, compact }: { title: string; items: Array<{ key: string; label: string; n: number }>; total: number; compact?: boolean }) {
  const max = Math.max(1, ...items.map((x) => x.n));
  return (
    <div className="card flex flex-col gap-3 min-w-0">
      <div className="card-title">{title}</div>
      {!items.length ? <div className="text-sm text-label">Belum ada kesalahan.</div> : (
        <div className={`flex flex-col ${compact ? 'gap-1' : 'gap-2'}`}>
          {items.map((x) => (
            <div key={x.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center">
              <span className="truncate text-[13px]" title={x.label}>{x.label}</span>
              <span className="tabular text-xs text-label whitespace-nowrap"><b className="text-ink">{fmtNumber(x.n)}</b> · {total ? fmtPct((x.n / total) * 100, 0) : '0%'}</span>
              <div className="bar-track col-span-2" style={compact ? { height: 6 } : undefined}><div className="bar-fill h-full" style={{ width: `${(x.n / max) * 100}%`, background: 'var(--c4)' }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PeopleList({ title, items }: { title: string; items: Array<{ key: string; n: number }> }) {
  return (
    <div>
      <div className="text-xs text-label mb-1">{title}</div>
      {!items.length ? <div className="text-sm text-label">—</div> : (
        <ol className="flex flex-col gap-0.5 text-sm">
          {items.map((x) => <li key={x.key} className="flex justify-between gap-2"><span className="mono truncate">{x.key}</span><b className="tabular">{fmtNumber(x.n)}</b></li>)}
        </ol>
      )}
    </div>
  );
}
