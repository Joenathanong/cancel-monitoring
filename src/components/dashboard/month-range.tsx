'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { shiftMonth } from '@/lib/kpi';

export function MonthRange({ from, to, current }: { from: string; to: string; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function go(f: string, t: string) {
    const p = new URLSearchParams(sp.toString());
    p.set('from', f); p.set('to', t);
    router.replace(`${pathname}?${p}`, { scroll: false });
  }
  const presets: Array<[string, string, string]> = [
    ['Bulan ini', current, current],
    ['Bulan lalu', shiftMonth(current, -1), shiftMonth(current, -1)],
    ['3 bulan', shiftMonth(current, -2), current],
    ['6 bulan', shiftMonth(current, -5), current],
    ['Tahun ini', `${current.slice(0, 4)}-01`, current],
  ];
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="seg overflow-x-auto max-w-full" role="tablist" aria-label="Periode">
        {presets.map(([l, f, t]) => (
          <button key={l} type="button" role="tab" aria-selected={from === f && to === t} className={from === f && to === t ? 'is-active' : ''} onClick={() => go(f, t)}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 items-center w-full sm:w-auto min-w-0">
        <input type="month" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, e.target.value > to ? e.target.value : to)} aria-label="Dari bulan" />
        <span className="text-label">–</span>
        <input type="month" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={to} min={from} onChange={(e) => e.target.value && go(e.target.value < from ? e.target.value : from, e.target.value)} aria-label="Sampai bulan" />
      </div>
    </div>
  );
}
