'use client';
/* DataTable — mengikuti design-ocs.md §11 (acuan LX02):
 *  - sort per kolom (klik label; shift+klik = bertingkat)
 *  - filter per kolom (popover, 9 operator, nilai dipisah ;, wildcard *)
 *  - lebar kolom bisa ditarik (pointer events, <col>, min 48px, dblclick = auto-fit)
 *  - tampilan disimpan di localStorage['ieg-grid:<id>']
 *  - di <768px tabel jadi kartu (CSS .rtable), sort/filter lewat toolbar
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, X, ArrowUpDown, Columns3, RotateCcw, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from './toast';

export type ColumnDef<T> = {
  key: string;
  label: string;
  width?: number;
  priority?: 1 | 2 | 3;
  type?: 'text' | 'number' | 'date';
  align?: 'left' | 'right';
  mono?: boolean;
  title?: boolean; // judul kartu di mobile
  hideInCard?: boolean;
  value: (row: T) => string | number | Date | null | undefined; // nilai untuk sort/filter
  render?: (row: T) => React.ReactNode;
  className?: string;
};

type Op = 'eq' | 'ne' | 'contains' | 'starts' | 'gt' | 'lt' | 'between' | 'empty' | 'notempty';
const OPS: Array<{ v: Op; l: string }> = [
  { v: 'contains', l: '≈ mengandung' },
  { v: 'eq', l: '= sama dengan' },
  { v: 'ne', l: '≠ tidak sama' },
  { v: 'starts', l: 'dimulai dengan' },
  { v: 'gt', l: '> lebih dari' },
  { v: 'lt', l: '< kurang dari' },
  { v: 'between', l: 'antara (a;b)' },
  { v: 'empty', l: 'kosong' },
  { v: 'notempty', l: 'tidak kosong' },
];
type FilterState = { op: Op; value: string };
type SortState = { key: string; dir: 'asc' | 'desc' }[];
type Saved = { widths: Record<string, number>; sort: SortState; filters: Record<string, FilterState>; hidden: string[] };

function norm(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function wildcard(pattern: string, s: string) {
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return re.test(s);
}
function matches(v: unknown, f: FilterState, type: ColumnDef<unknown>['type']) {
  const s = norm(v).toLowerCase();
  if (f.op === 'empty') return s === '';
  if (f.op === 'notempty') return s !== '';
  const vals = f.value.split(';').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!vals.length) return true;
  const num = type === 'number' ? Number(v) : type === 'date' ? new Date(norm(v)).getTime() : NaN;
  const toNum = (x: string) => (type === 'date' ? new Date(x).getTime() : Number(x));
  switch (f.op) {
    case 'contains': return vals.some((x) => (x.includes('*') ? wildcard(x, s) : s.includes(x)));
    case 'eq': return vals.some((x) => (x.includes('*') ? wildcard(x, s) : s === x));
    case 'ne': return !vals.some((x) => (x.includes('*') ? wildcard(x, s) : s === x));
    case 'starts': return vals.some((x) => s.startsWith(x));
    case 'gt': return Number.isFinite(num) ? num > toNum(vals[0]!) : s > vals[0]!;
    case 'lt': return Number.isFinite(num) ? num < toNum(vals[0]!) : s < vals[0]!;
    case 'between': {
      const [a, b] = vals;
      if (a === undefined || b === undefined) return true;
      return Number.isFinite(num) ? num >= toNum(a) && num <= toNum(b) : s >= a && s <= b;
    }
  }
  return true;
}
function cmp(a: unknown, b: unknown, type: ColumnDef<unknown>['type']) {
  const ea = a === null || a === undefined || a === '', eb = b === null || b === undefined || b === '';
  if (ea && eb) return 0;
  if (ea) return 1; // kosong selalu di bawah
  if (eb) return -1;
  if (type === 'number') return Number(a) - Number(b);
  if (type === 'date') return new Date(norm(a)).getTime() - new Date(norm(b)).getTime();
  return norm(a).localeCompare(norm(b), 'id', { numeric: true, sensitivity: 'base' });
}

export function DataTable<T>({ id, columns, rows, rowKey, onRowClick, pageSize = 50, emptyText = 'Tidak ada data', toolbarExtra, wrapHeaders, defaultSort, compactToolbar }: {
  id: string;
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyText?: string;
  toolbarExtra?: React.ReactNode;
  /** Judul kolom ditampilkan utuh (boleh 2 baris), tidak dipotong "…". */
  wrapHeaders?: boolean;
  /** Urutan awal bila belum ada tampilan tersimpan. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }[];
  /** Sembunyikan tombol lebar otomatis/penuh (tabel kecil di dashboard). */
  compactToolbar?: boolean;
}) {
  const storageKey = `ieg-grid:${id}`;
  const { toast } = useToast();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<SortState>(defaultSort ?? []);
  const [filters, setFilters] = useState<Record<string, FilterState>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState(false);
  const [mobileSort, setMobileSort] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const loaded = useRef(false);

  // muat tampilan tersimpan
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Saved>;
        setWidths(s.widths || {});
        setSort(s.sort?.length ? s.sort : defaultSort ?? []);
        setFilters(s.filters || {});
        setHidden(s.hidden || []);
      }
    } catch { /* abaikan */ }
    loaded.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ widths, sort, filters, hidden } satisfies Saved)); } catch { /* abaikan */ }
  }, [widths, sort, filters, hidden, storageKey]);

  const visible = columns.filter((c) => !hidden.includes(c.key));

  const processed = useMemo(() => {
    let out = rows;
    const ql = q.trim().toLowerCase();
    if (ql) out = out.filter((r) => columns.some((c) => norm(c.value(r)).toLowerCase().includes(ql)));
    for (const [key, f] of Object.entries(filters)) {
      const c = columns.find((x) => x.key === key);
      if (!c) continue;
      out = out.filter((r) => matches(c.value(r), f, c.type));
    }
    if (sort.length) {
      out = [...out].sort((a, b) => {
        for (const s of sort) {
          const c = columns.find((x) => x.key === s.key);
          if (!c) continue;
          const r = cmp(c.value(a), c.value(b), c.type);
          if (r !== 0) return s.dir === 'asc' ? r : -r;
        }
        return 0;
      });
    }
    return out;
  }, [rows, q, filters, sort, columns]);

  useEffect(() => { setPage(0); }, [q, filters, sort, rows.length]);
  const pages = Math.max(1, Math.ceil(processed.length / pageSize));
  const pageRows = processed.slice(page * pageSize, page * pageSize + pageSize);

  function clickSort(key: string, shift: boolean) {
    setSort((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const cur = idx >= 0 ? prev[idx] : undefined;
      const nextDir = !cur ? 'asc' : cur.dir === 'asc' ? 'desc' : null;
      if (!shift) return nextDir ? [{ key, dir: nextDir }] : [];
      const rest = prev.filter((s) => s.key !== key);
      return nextDir ? [...rest, { key, dir: nextDir }] : rest;
    });
  }

  // resize kolom — pointer events di window
  const drag = useRef<{ key: string; startX: number; startW: number; el: HTMLElement } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLSpanElement>, key: string) => {
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    drag.current = { key, startX: e.clientX, startW: th.getBoundingClientRect().width, el: e.currentTarget };
    e.currentTarget.setAttribute('data-drag', '1');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const w = Math.max(48, Math.round(drag.current.startW + ev.clientX - drag.current.startX));
      setWidths((ws) => ({ ...ws, [drag.current!.key]: w }));
    };
    const up = () => {
      drag.current?.el.removeAttribute('data-drag');
      drag.current = null;
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }, []);

  function autoFit(key?: string) {
    const table = tableRef.current;
    if (!table) return;
    const keys = key ? [key] : visible.map((c) => c.key);
    const next: Record<string, number> = { ...widths };
    for (const k of keys) {
      const idx = visible.findIndex((c) => c.key === k);
      if (idx < 0) continue;
      let max = 48;
      const cells = table.querySelectorAll<HTMLElement>(`tr > *:nth-child(${idx + 1})`);
      cells.forEach((cell) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
        probe.textContent = cell.textContent || '';
        cell.appendChild(probe);
        max = Math.max(max, probe.getBoundingClientRect().width + 24 + (cell.tagName === 'TH' ? 40 : 0));
        probe.remove();
      });
      next[k] = Math.min(480, Math.round(max));
    }
    setWidths(next);
  }
  function fullWidth() {
    const wrap = tableRef.current?.parentElement;
    if (!wrap) return;
    const total = wrap.clientWidth - 2;
    const base = visible.map((c) => widths[c.key] || c.width || 140);
    const sum = base.reduce((a, b) => a + b, 0);
    const next: Record<string, number> = {};
    visible.forEach((c, i) => { next[c.key] = Math.max(48, Math.round((base[i]! / sum) * total)); });
    setWidths(next);
  }
  function resetView() {
    setWidths({}); setSort(defaultSort ?? []); setFilters({}); setHidden([]); setQ('');
    try { localStorage.removeItem(storageKey); } catch { /* abaikan */ }
  }

  function copyCell(text: string) {
    navigator.clipboard?.writeText(text).then(() => toast('Disalin')).catch(() => {});
  }

  const activeFilters = Object.entries(filters);

  return (
    <div className="table-card">
      <div className="grid-toolbar">
        <div className="search relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input className="input !h-9 !pl-8 !text-sm" placeholder="Cari di semua kolom …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pencarian global" />
        </div>
        {toolbarExtra}
        <div className="hidden md:flex gap-1">
          {!compactToolbar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => autoFit()}>Lebar otomatis</button>}
          {!compactToolbar && <button type="button" className="btn btn-ghost btn-sm" onClick={fullWidth}>Lebar penuh</button>}
          <div className="relative">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColMenu((o) => !o)} aria-expanded={colMenu}><Columns3 /> Kolom</button>
            {colMenu && (
              <div className="menu" style={{ left: 0, right: 'auto' }}>
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-hover rounded-md">
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((k) => k !== c.key) : [...h, c.key]))} />
                    {c.label}
                  </label>
                ))}
                <div className="divider my-1" />
                <button type="button" onClick={() => { resetView(); setColMenu(false); }}><RotateCcw /> Reset tampilan</button>
              </div>
            )}
          </div>
        </div>
        <div className="md:hidden relative">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMobileSort((o) => !o)} aria-expanded={mobileSort}><ArrowUpDown /> Urut</button>
          {mobileSort && (
            <div className="menu">
              {columns.filter((c) => !c.hideInCard).map((c) => (
                <button key={c.key} type="button" onClick={() => { clickSort(c.key, false); }}>
                  {c.label} {sort[0]?.key === c.key ? (sort[0].dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              ))}
              <div className="divider my-1" />
              <button type="button" onClick={() => { resetView(); setMobileSort(false); }}><RotateCcw /> Reset tampilan</button>
            </div>
          )}
        </div>
        <span className="grid-count tabular">{processed.length.toLocaleString('id-ID')} entries</span>
      </div>
      {activeFilters.length > 0 && (
        <div className="filter-chips">
          {activeFilters.map(([k, f]) => {
            const c = columns.find((x) => x.key === k);
            return (
              <span key={k} className="chip chip-brand">
                {c?.label} {OPS.find((o) => o.v === f.op)?.l.split(' ')[0]} {f.value}
                <button type="button" className="ml-1 grid place-items-center" aria-label={`Hapus filter ${c?.label}`} onClick={() => setFilters((fs) => { const n = { ...fs }; delete n[k]; return n; })}><X /></button>
              </span>
            );
          })}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters({})}>Hapus semua</button>
        </div>
      )}
      <div className="table-scroll">
        <table className={cn('rtable', wrapHeaders && 'head-wrap')} ref={tableRef}>
          <colgroup>
            {visible.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] || c.width || 140 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visible.map((c) => {
                const s = sort.find((x) => x.key === c.key);
                const sIdx = sort.findIndex((x) => x.key === c.key);
                const f = filters[c.key];
                return (
                  <th key={c.key} className={cn(c.priority === 2 && 'p2', c.priority === 3 && 'p3', c.align === 'right' && 'n')} aria-sort={s ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ position: 'sticky' }}>
                    <div className="th-inner">
                      <button type="button" className="th-label" onClick={(e) => clickSort(c.key, e.shiftKey)} title={`Urutkan menurut ${c.label}`}>
                        {c.label}
                      </button>
                      <span className="sort-ico" aria-hidden>
                        {s ? (s.dir === 'asc' ? '▲' : '▼') : '⇅'}
                        {sort.length > 1 && sIdx >= 0 ? <sup>{sIdx + 1}</sup> : null}
                      </span>
                      <span className="relative">
                        <button type="button" className={cn('filter-btn', f && 'is-on')} aria-label={`Filter ${c.label}`} onClick={() => setOpenFilter(openFilter === c.key ? null : c.key)}>
                          <Filter />
                        </button>
                        {openFilter === c.key && (
                          <FilterPopover
                            label={c.label}
                            initial={f}
                            onApply={(st) => { setFilters((fs) => ({ ...fs, [c.key]: st })); setOpenFilter(null); }}
                            onClear={() => { setFilters((fs) => { const n = { ...fs }; delete n[c.key]; return n; }); setOpenFilter(null); }}
                            onClose={() => setOpenFilter(null)}
                          />
                        )}
                      </span>
                    </div>
                    <span className="col-resize" onPointerDown={(e) => onPointerDown(e, c.key)} onDoubleClick={() => autoFit(c.key)} aria-hidden />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={visible.length} className="text-center !whitespace-normal py-8 text-label !h-auto">{emptyText}</td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={rowKey(r)} className={cn(onRowClick && 'is-clickable')} onClick={() => onRowClick?.(r)}>
                {visible.map((c) => {
                  const raw = c.value(r);
                  const empty = raw === null || raw === undefined || raw === '';
                  return (
                    <td
                      key={c.key}
                      data-label={c.label}
                      className={cn(c.priority === 2 && 'p2', c.priority === 3 && 'p3', c.align === 'right' && 'n', c.mono && 'mono', empty && !c.render && 'empty', c.title && 'title', c.hideInCard && 'hide-card', c.className)}
                      title={typeof raw === 'string' ? raw : undefined}
                      onDoubleClick={(e) => { e.stopPropagation(); copyCell(norm(raw)); }}
                    >
                      {c.render ? c.render(r) : empty ? '—' : raw instanceof Date ? raw.toLocaleDateString('id-ID') : String(raw)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid-footer">
        <span className="tabular">{processed.length.toLocaleString('id-ID')} entries</span>
        <span className="hidden md:inline">· klik ganda sel = salin</span>
        <div className="pager">
          <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Sebelumnya"><ChevronLeft /></button>
          <span className="tabular">{page + 1} / {pages}</span>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Berikutnya"><ChevronRight /></button>
        </div>
      </div>
    </div>
  );
}

function FilterPopover({ label, initial, onApply, onClear, onClose }: { label: string; initial?: FilterState; onApply: (s: FilterState) => void; onClear: () => void; onClose: () => void }) {
  const [op, setOp] = useState<Op>(initial?.op ?? 'contains');
  const [value, setValue] = useState(initial?.value ?? '');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const needsValue = op !== 'empty' && op !== 'notempty';
  return (
    <div className="popover" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="popover-title">Filter · {label}</div>
      <select className="select !h-9 !text-sm mb-2" value={op} onChange={(e) => setOp(e.target.value as Op)} aria-label="Operator">
        {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {needsValue && (
        <input
          className="input !h-9 mb-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onApply({ op, value }); }}
          placeholder="nilai"
          autoFocus
          aria-label="Nilai filter"
        />
      )}
      <div className="help mb-2">Beberapa nilai dipisah ; · wildcard * didukung</div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => onApply({ op, value })}>Terapkan</button>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClear} aria-label="Hapus filter"><X /></button>
      </div>
    </div>
  );
}
