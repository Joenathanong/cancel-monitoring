import { Suspense } from 'react';
import Link from 'next/link';
import { Download, ClipboardPlus } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { kpiData } from '@/server/summary';
import { dayKeyWib, isMonthKey, monthLabel, CANCEL_BUCKETS, CANCEL_BUCKET_LABEL, CANCEL_BUCKET_HINT } from '@/lib/kpi';
import { fmtNumber, fmtPct } from '@/lib/utils';
import { MonthRange } from '@/components/dashboard/month-range';
import { KpiTile, MonthStack, SplitBar, BreakdownBars, Legend } from '@/components/dashboard/kpi-charts';
import { KpiMonthTable } from '@/components/dashboard/kpi-month-table';
import { SyncBar } from '@/components/pending/sync-bar';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const settings = await getSettings();
  const current = dayKeyWib(new Date()).slice(0, 7);
  let from = isMonthKey(sp.from) ? sp.from : current;
  let to = isMonthKey(sp.to) ? sp.to : current;
  if (from > to) [from, to] = [to, from];
  const k = await kpiData(from, to, settings.cancelRef);
  const t = k.total;
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const range = `from=${from}-01&to=${to}-${String(new Date(Date.UTC(ty, tm, 0)).getUTCDate()).padStart(2, '0')}`;
  const label = from === to ? monthLabel(from, true) : `${monthLabel(from, true)} – ${monthLabel(to, true)}`;
  const bucketTone = { LE1: 'var(--c-other)', D2: 'var(--c5)', GT2: 'var(--c4)' } as const;
  const maxBucket = Math.max(1, ...CANCEL_BUCKETS.map((b) => t.buckets[b]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="page-title">Dashboard KPI Pending</h1>
          <div className="text-sm text-label mt-1">{label} · dihitung per Order ID, menurut bulan saat pertama diinput pending</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {u.role !== 'VIEWER' && <Link href="/input" className="btn btn-secondary"><ClipboardPlus /> Input pending</Link>}
          <a href={`/api/export?kind=kpi&from=${from}&to=${to}`} className="btn btn-secondary"><Download /> Excel KPI</a>
        </div>
      </div>
      <Suspense fallback={null}><MonthRange from={from} to={to} current={current} /></Suspense>
      <SyncBar canSync={u.role !== 'VIEWER'} />
      {sp.denied && <div className="alert alert-critical">Halaman itu tidak tersedia untuk peran Anda.</div>}

      <div className="kpi-grid">
        <KpiTile label="Total ID sempat pending" value={fmtNumber(t.total)} sub={`${k.months.length} bulan`} />
        <KpiTile label="Terselesaikan (order terproses)" value={fmtNumber(t.processed)} tone="positive" sub={`${fmtPct(t.pctProcessed, 1)} dari ID pending`} href={`/monitoring?status=PROCESSED&${range}`} />
        <KpiTile label="Batal" value={fmtNumber(t.cancelled)} tone={t.cancelled ? 'negative' : undefined} sub={<>{fmtPct(t.pctCancelled, 1)} · ≤1h <b>{t.buckets.LE1}</b> · h2 <b>{t.buckets.D2}</b> · &gt;2h <b>{t.buckets.GT2}</b></>} href={`/monitoring?status=CANCELLED&${range}`} />
        <KpiTile label="Masih pending" value={fmtNumber(t.open)} tone={t.open ? 'critical' : undefined} sub={t.avgHoursToProcess !== null ? `rata² terproses ${t.avgHoursToProcess < 48 ? `${t.avgHoursToProcess.toFixed(1)} jam` : `${(t.avgHoursToProcess / 24).toFixed(1)} hari`}` : 'belum ada yang terproses'} href="/monitoring?status=OPEN" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Order ID pending per bulan</div>
          <div className="hidden md:block"><MonthStack rows={k.rows} /></div>
          <div className="md:hidden flex flex-col gap-2">
            {[...k.rows].reverse().map((r) => (
              <div key={r.month} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm"><b>{monthLabel(r.month)}</b><span className="tabular text-label">{r.total} ID · {r.processed} ✓ · {r.cancelled} ✕ · {r.open} ⏳</span></div>
                <SplitBar processed={r.processed} cancelled={r.cancelled} open={r.open} />
              </div>
            ))}
            <Legend />
          </div>
        </div>
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Kategori batal</div>
          <div className="text-xs text-label">Dihitung dari {settings.cancelRef === 'ORDER' ? 'waktu order dibuat di marketplace' : 'waktu Fulfillment menginput pending'} sampai order berstatus CANCELLED di OCS.</div>
          {CANCEL_BUCKETS.map((b) => (
            <div key={b} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-sm"><span>{CANCEL_BUCKET_LABEL[b]} <span className="text-xs text-label">({CANCEL_BUCKET_HINT[b]})</span></span><b className="tabular">{fmtNumber(t.buckets[b])}</b></div>
              <div className="bar-track"><div className="bar-fill h-full" style={{ width: `${(t.buckets[b] / maxBucket) * 100}%`, background: bucketTone[b] }} /></div>
            </div>
          ))}
          <div className="text-sm border-t border-subtle pt-2 flex justify-between"><span>Total batal</span><b className="tabular">{fmtNumber(t.cancelled)} <span className="text-label font-normal">({fmtPct(t.pctCancelled, 1)})</span></b></div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Rekap per bulan</h2>
        <KpiMonthTable rows={k.rows} total={t} />
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Kenapa pending?</div>
          <BreakdownBars items={k.reasons} color="var(--c1)" />
        </div>
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Golongan barang</div>
          <BreakdownBars items={k.categories} color="var(--c5)" />
          <div className="text-xs text-label">Phase Out dari doi-monitor · Clearance = kode CS-. Keduanya sudah tidak dijual lagi.</div>
        </div>
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">PO ke PT Eka Jaya</div>
          <BreakdownBars items={k.po} color="var(--c3)" />
          {k.arrival.length > 0 && (
            <>
              <div className="text-xs text-label border-t border-subtle pt-2">Dari yang sudah open PO:</div>
              <BreakdownBars items={k.arrival} color="var(--c6)" />
            </>
          )}
        </div>
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Per area</div>
          {k.areas.length === 0 ? <div className="text-sm text-label">Belum ada data.</div> : k.areas.map((a) => (
            <div key={a.area} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm gap-2"><span className="truncate">{a.area}</span><span className="tabular text-label text-xs whitespace-nowrap"><b className="text-ink">{a.total}</b> ID · {a.processed} ✓ · {a.cancelled} ✕ · {a.open} ⏳</span></div>
              <SplitBar processed={a.processed} cancelled={a.cancelled} open={a.open} />
            </div>
          ))}
          {k.areas.length > 0 && <Legend />}
        </div>
        <div className="card flex flex-col gap-3 min-w-0">
          <div className="card-title">Umur order yang masih pending</div>
          {k.aging.map((a, i) => (
            <div key={a.key} className="flex justify-between text-sm">
              <span>{a.label}</span>
              <b className="tabular" style={{ color: i >= 2 && a.orders ? 'var(--negative)' : undefined }}>{fmtNumber(a.orders)} ID</b>
            </div>
          ))}
          <Link href={`/monitoring?status=OPEN&q=old`} className="text-primary text-xs">Lihat yang lewat {settings.agingWarnDays} hari →</Link>
        </div>
        <div className="card flex flex-col gap-2 min-w-0">
          <div className="card-title">SKU paling sering pending</div>
          {k.topSkus.length === 0 ? <div className="text-sm text-label">Belum ada data.</div> : (
            <ol className="flex flex-col gap-1 text-sm">
              {k.topSkus.slice(0, 10).map((s) => (
                <li key={s.sku} className="flex justify-between gap-2 min-w-0">
                  <Link href={`/monitoring?status=ALL&sku=${encodeURIComponent(s.sku)}`} className="mono truncate hover:text-primary" title={s.sku}>{s.sku}{s.isPhaseOut ? ' (Phase Out)' : ''}{s.isClearance ? ' (Clearance)' : ''}</Link>
                  <span className="tabular text-label whitespace-nowrap"><b className="text-ink">{s.orders}</b> ID · {fmtNumber(s.qty)} qty</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/rekap-sku" className="text-primary text-xs mt-1">Rekap per SKU yang masih pending →</Link>
        </div>
      </div>
    </div>
  );
}
