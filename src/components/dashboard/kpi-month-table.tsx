'use client';
import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { fmtNumber, fmtPct } from '@/lib/utils';
import { monthLabel, CANCEL_BUCKET_LABEL, type MonthRow } from '@/lib/kpi';

export function KpiMonthTable({ rows, total }: { rows: MonthRow[]; total: MonthRow }) {
  const all = useMemo(() => [...[...rows].reverse(), total], [rows, total]);
  const columns = useMemo<ColumnDef<MonthRow>[]>(() => [
    { key: 'month', label: 'Bulan', width: 120, title: true, value: (r) => (r.month === 'TOTAL' ? 'zz' : r.month), render: (r) => <b>{r.month === 'TOTAL' ? 'Total rentang' : monthLabel(r.month, true)}</b> },
    { key: 'total', label: 'ID sempat pending', width: 110, align: 'right', type: 'number', value: (r) => r.total, render: (r) => <b className="tabular">{fmtNumber(r.total)}</b> },
    { key: 'processed', label: 'Terselesaikan (terproses)', width: 130, align: 'right', type: 'number', value: (r) => r.processed, render: (r) => <span className="tabular"><b style={{ color: 'var(--positive)' }}>{fmtNumber(r.processed)}</b> <span className="text-label text-xs">{fmtPct(r.pctProcessed, 0)}</span></span> },
    { key: 'b1', label: CANCEL_BUCKET_LABEL.LE1, width: 100, align: 'right', type: 'number', value: (r) => r.buckets.LE1 },
    { key: 'b2', label: CANCEL_BUCKET_LABEL.D2, width: 100, align: 'right', type: 'number', value: (r) => r.buckets.D2 },
    { key: 'b3', label: CANCEL_BUCKET_LABEL.GT2, width: 100, align: 'right', type: 'number', value: (r) => r.buckets.GT2, render: (r) => <span className={r.buckets.GT2 ? 'text-negative font-semibold' : ''}>{fmtNumber(r.buckets.GT2)}</span> },
    { key: 'cancelled', label: 'Total batal', width: 100, align: 'right', type: 'number', value: (r) => r.cancelled, render: (r) => <span className="tabular"><b style={{ color: 'var(--negative)' }}>{fmtNumber(r.cancelled)}</b> <span className="text-label text-xs">{fmtPct(r.pctCancelled, 0)}</span></span> },
    { key: 'open', label: 'Masih pending', width: 100, align: 'right', type: 'number', value: (r) => r.open, render: (r) => <span className={r.open ? 'text-critical font-semibold' : ''}>{fmtNumber(r.open)}</span> },
    { key: 'avg', label: 'Rata² s/d terproses', width: 120, align: 'right', type: 'number', priority: 2, value: (r) => r.avgHoursToProcess ?? -1, render: (r) => (r.avgHoursToProcess === null ? '—' : r.avgHoursToProcess < 48 ? `${r.avgHoursToProcess.toFixed(1)} jam` : `${(r.avgHoursToProcess / 24).toFixed(1)} hari`) },
  ], []);
  return <DataTable id="kpi-month" columns={columns} rows={all} rowKey={(r) => r.month} pageSize={40} wrapHeaders compactToolbar />;
}
