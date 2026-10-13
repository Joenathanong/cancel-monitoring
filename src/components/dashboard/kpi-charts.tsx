// Chart ringan tanpa library — palet design-ocs §4 (warna = entitas):
// terproses = c2 (mint), batal = c4 (pink), masih pending = netral. Satu sumbu.
import { fmtNumber, fmtPct } from '@/lib/utils';
import { monthLabel, type MonthRow } from '@/lib/kpi';
import type { Breakdown } from '@/server/summary';

export const SERIES = {
  processed: { color: 'var(--c2)', label: 'Terproses' },
  cancelled: { color: 'var(--c4)', label: 'Batal' },
  open: { color: 'var(--c-other)', label: 'Masih pending' },
} as const;

export function KpiTile({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'positive' | 'negative' | 'critical' | 'informative'; href?: string }) {
  const color = tone ? `var(--${tone})` : 'var(--ink)';
  const inner = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tabular" style={{ color }}>{value}</div>
      {sub && <div className="kpi-sub text-xs text-label mt-1">{sub}</div>}
    </>
  );
  return href ? <a href={href} className="card kpi-tile hover:border-strong">{inner}</a> : <div className="card kpi-tile">{inner}</div>;
}

/** Kolom bertumpuk per bulan: terproses / batal / masih pending. Disembunyikan di <768px (angka ada di tabel). */
export function MonthStack({ rows }: { rows: MonthRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const show = rows.slice(-12);
  return (
    <div>
      <div className="flex items-end gap-2 h-[180px] border-b border-strong px-1">
        {show.map((r) => (
          <div key={r.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={`${monthLabel(r.month, true)}: ${r.total} ID — terproses ${r.processed}, batal ${r.cancelled}, pending ${r.open}`}>
            <span className="text-[11px] tabular text-label">{r.total || ''}</span>
            <div className="w-full max-w-[56px] flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${(r.total / max) * 100}%`, minHeight: r.total ? 3 : 0 }}>
              {(['processed', 'cancelled', 'open'] as const).map((k) => r[k] > 0 && (
                <div key={k} style={{ height: `${(r[k] / r.total) * 100}%`, background: SERIES[k].color }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1 px-1">
        {show.map((r) => <div key={r.month} className="flex-1 min-w-0 text-[11px] text-center text-label truncate">{monthLabel(r.month)}</div>)}
      </div>
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex gap-4 mt-2 text-xs text-label flex-wrap">
      {Object.values(SERIES).map((s) => <span key={s.label} className="flex items-center gap-1"><span className="dot" style={{ background: s.color }} /> {s.label}</span>)}
    </div>
  );
}

/** Satu batang proporsi untuk total: terproses / batal / pending. */
export function SplitBar({ processed, cancelled, open }: { processed: number; cancelled: number; open: number }) {
  const t = processed + cancelled + open || 1;
  return (
    <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--chart-track)' }} role="img" aria-label={`Terproses ${processed}, batal ${cancelled}, masih pending ${open}`}>
      {processed > 0 && <div style={{ width: `${(processed / t) * 100}%`, background: SERIES.processed.color }} />}
      {cancelled > 0 && <div style={{ width: `${(cancelled / t) * 100}%`, background: SERIES.cancelled.color }} />}
      {open > 0 && <div style={{ width: `${(open / t) * 100}%`, background: SERIES.open.color }} />}
    </div>
  );
}

/** Daftar batang horizontal satu seri (Order ID), nilai langsung di kanan. */
export function BreakdownBars({ items, color = 'var(--c1)', unit = 'ID', hrefFor }: { items: Breakdown[]; color?: string; unit?: string; hrefFor?: (b: Breakdown) => string | null }) {
  if (!items.length) return <div className="text-sm text-label">Belum ada data.</div>;
  const max = Math.max(1, ...items.map((b) => b.orders));
  return (
    <div className="flex flex-col gap-2">
      {items.map((b) => {
        const href = hrefFor?.(b);
        const label = <span className={`truncate text-[13px] ${b.key === '' ? 'text-critical font-semibold' : ''}`} title={b.label}>{b.label}</span>;
        return (
          <div key={b.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center">
            {href ? <a href={href} className="min-w-0 hover:text-primary flex">{label}</a> : label}
            <span className="tabular text-xs text-label whitespace-nowrap"><b className="text-ink">{fmtNumber(b.orders)}</b> {unit} · {fmtNumber(b.qty)} qty</span>
            <div className="bar-track col-span-2"><div className="bar-fill h-full" style={{ width: `${(b.orders / max) * 100}%`, background: color }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function Pct({ v }: { v: number }) {
  return <>{fmtPct(v, 1)}</>;
}
