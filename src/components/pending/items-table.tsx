'use client';
import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { fmtShort, fmtAge } from '@/lib/utils';
import type { ItemRow } from '@/server/items';
import { ResolutionChip, OcsChip, BucketChip, CategoryChips, PoChip, ArrivalChip } from './chips';
import { RESOLUTION_LABEL } from '@/lib/ocs-status';
import { CANCEL_BUCKET_LABEL } from '@/lib/kpi';
import { PO_LABEL, ARRIVAL_LABEL } from '@/lib/items';

export function ItemsTable({ id, rows, onOpen, agingWarnDays = 2, compact, toolbarExtra }: { id: string; rows: ItemRow[]; onOpen: (r: ItemRow) => void; agingWarnDays?: number; compact?: boolean; toolbarExtra?: React.ReactNode }) {
  const columns = useMemo<ColumnDef<ItemRow>[]>(() => {
    const cols: ColumnDef<ItemRow>[] = [
      { key: 'orderId', label: 'Order ID', width: 170, mono: true, title: true, value: (r) => r.orderId, render: (r) => <span className="mono font-semibold">{r.orderId}</span> },
      { key: 'sku', label: 'SKU OCS', width: 220, mono: true, value: (r) => r.sku, render: (r) => (
        <span className="flex flex-col gap-0.5 min-w-0"><span className="mono truncate">{r.sku}</span><CategoryChips isPhaseOut={r.isPhaseOut} isClearance={r.isClearance} info={r.phaseOutInfo} /></span>
      ) },
      { key: 'qty', label: 'Qty', width: 84, align: 'right', type: 'number', value: (r) => r.qty },
      { key: 'resolution', label: 'Penyelesaian', width: 150, value: (r) => RESOLUTION_LABEL[r.resolution] + (r.cancelBucket ? ` · ${CANCEL_BUCKET_LABEL[r.cancelBucket]}` : ''), render: (r) => (
        <span className="flex flex-col gap-0.5 items-start"><ResolutionChip resolution={r.resolution} manual={r.manualResolution} /><BucketChip bucket={r.cancelBucket} /></span>
      ) },
      { key: 'ocs', label: 'Status OCS', width: 184, value: (r) => (r.ocsFound === false ? 'Tidak ada di OCS' : r.ocsStatusName ?? ''), render: (r) => <OcsChip code={r.ocsStatusCode} name={r.ocsStatusName} found={r.ocsFound} error={r.lastCheckError} /> },
      { key: 'age', label: 'Umur', width: 80, align: 'right', type: 'number', value: (r) => r.ageDays, render: (r) => (
        <span className={r.resolution === 'OPEN' && r.ageDays >= agingWarnDays ? 'text-negative font-semibold' : ''}>{fmtAge(r.ageDays)}</span>
      ) },
    ];
    if (!compact) {
      cols.push(
        { key: 'reason', label: 'Alasan pending', width: 190, priority: 2, value: (r) => r.reason ?? '', render: (r) => (r.reason ? <span className="truncate" title={r.reasonNote ?? r.reason}>{r.reason}</span> : <span className="text-critical text-xs font-semibold">Belum diisi</span>) },
        { key: 'po', label: 'PO Eka Jaya', width: 150, priority: 2, value: (r) => PO_LABEL[r.poStatus] + (r.poStatus === 'SUDAH' ? ` · ${ARRIVAL_LABEL[r.arrivalStatus]}` : ''), render: (r) => (
          <span className="flex flex-col gap-0.5 items-start"><PoChip status={r.poStatus} />{r.poStatus === 'SUDAH' && <ArrivalChip status={r.arrivalStatus} />}</span>
        ) },
        { key: 'shop', label: 'Toko', width: 100, priority: 3, value: (r) => r.shopName ?? '' },
        { key: 'platform', label: 'Platform', width: 110, priority: 3, value: (r) => r.platform ?? '' },
        { key: 'area', label: 'Area', width: 100, priority: 2, value: (r) => r.area ?? '' },
      );
    }
    cols.push(
      { key: 'inputAt', label: 'Diinput', width: 130, type: 'date', priority: compact ? undefined : 2, value: (r) => r.inputAt, render: (r) => <span className="tabular">{fmtShort(r.inputAt)}</span> },
      { key: 'inputBy', label: 'Oleh', width: 120, priority: 3, hideInCard: compact, value: (r) => r.inputByName },
    );
    return cols;
  }, [agingWarnDays, compact]);

  return <DataTable id={id} columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onOpen} pageSize={50} wrapHeaders compactToolbar toolbarExtra={toolbarExtra} emptyText="Belum ada data pending" />;
}
