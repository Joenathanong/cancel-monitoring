'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { toDateInput } from '@/lib/utils';

export function CancelFilters({ from, to, area, platform, shop, options }: { from: string; to: string; area: string | null; platform: string | null; shop: string | null; options: { areas: string[]; platforms: string[]; shops: string[] } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function go(next: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`${pathname}?${p}`, { scroll: false });
  }
  const now = new Date();
  const today = toDateInput(now);
  const day = (n: number) => toDateInput(new Date(now.getTime() - n * 86400000));
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevEnd = toDateInput(new Date(new Date(`${monthStart}T00:00:00+07:00`).getTime() - 86400000));
  const presets: Array<[string, string, string]> = [
    ['Hari ini', today, today],
    ['Kemarin', day(1), day(1)],
    ['7 hari', day(6), today],
    ['Bulan ini', monthStart, today],
    ['Bulan lalu', `${prevEnd.slice(0, 7)}-01`, prevEnd],
  ];
  const q = new URLSearchParams({ kind: 'cancel', from, to, ...(area ? { area } : {}), ...(platform ? { platform } : {}), ...(shop ? { shop } : {}) });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="seg overflow-x-auto max-w-full" role="tablist" aria-label="Periode">
          {presets.map(([l, f, t]) => (
            <button key={l} type="button" role="tab" aria-selected={from === f && to === t} className={from === f && to === t ? 'is-active' : ''} onClick={() => go({ from: f, to: t })}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto min-w-0">
          <input type="date" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={from} max={to} onChange={(e) => e.target.value && go({ from: e.target.value })} aria-label="Tanggal order dari" />
          <span className="text-label">–</span>
          <input type="date" className="input flex-1 min-w-0 sm:!w-auto sm:flex-none !h-9 !text-sm" value={to} min={from} onChange={(e) => e.target.value && go({ to: e.target.value })} aria-label="Tanggal order sampai" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select className="select !w-auto !h-9 !text-sm max-sm:flex-1" value={area ?? ''} onChange={(e) => go({ area: e.target.value })} aria-label="Area">
          <option value="">Semua area</option>
          {options.areas.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="select !w-auto !h-9 !text-sm max-sm:flex-1" value={platform ?? ''} onChange={(e) => go({ platform: e.target.value })} aria-label="Platform">
          <option value="">Semua platform</option>
          {options.platforms.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="select !w-auto !h-9 !text-sm max-sm:flex-1" value={shop ?? ''} onChange={(e) => go({ shop: e.target.value })} aria-label="Toko">
          <option value="">Semua toko</option>
          {options.shops.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <a className="btn btn-secondary btn-sm" href={`/api/export?${q}`}><Download /> Excel</a>
      </div>
    </div>
  );
}
