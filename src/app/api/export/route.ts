import ExcelJS from 'exceljs';
import { apiUser, isResponse } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { listItems } from '@/server/query';
import { kpiData } from '@/server/summary';
import { isMonthKey, monthLabel, CANCEL_BUCKET_LABEL, dayKeyWib } from '@/lib/kpi';
import { RESOLUTION_LABEL, statusName } from '@/lib/ocs-status';
import { PO_LABEL, ARRIVAL_LABEL } from '@/lib/items';
import { cancelDashboard } from '@/server/cancel-query';
import { parseCancelFilter } from '@/lib/cancel-filter';
import { VERDICT_LABEL, TEAM_LABEL, STAGE_LABEL, REVIEW_LABEL } from '@/lib/cancel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

function styleHeader(ws: ExcelJS.Worksheet) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FF4338CA' } };
  r.fill = HEAD_FILL;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

const dt = (s: string | null) => (s ? new Date(new Date(s).getTime() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 16) : '');
const dd = (s: string | null) => (s ? dayKeyWib(new Date(s)) : '');

export async function GET(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const sp = new URL(req.url).searchParams;
  const settings = await getSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pending Kiriman IEG';
  let name = 'pending-kiriman';

  if (sp.get('kind') === 'cancel') {
    const f = parseCancelFilter(sp);
    const d = await cancelDashboard(f, settings);
    const ws = wb.addWorksheet('Kesalahan cancel');
    ws.columns = [
      { header: 'Order ID', key: 'orderId', width: 22 },
      { header: 'Hasil', key: 'verdict', width: 20 },
      { header: 'Tim', key: 'team', width: 13 },
      { header: 'Tim otomatis', key: 'autoTeam', width: 13 },
      { header: 'Tahap terakhir', key: 'stage', width: 28 },
      { header: 'Status OCS terakhir sebelum cancel', key: 'last', width: 24 },
      { header: 'Order dibuat', key: 'created', width: 17 },
      { header: 'Ready to process', key: 'ready', width: 17 },
      { header: 'Cancel', key: 'cancel', width: 17 },
      { header: 'Jam kerja s/d cancel', key: 'hours', width: 12 },
      { header: 'Batas jam', key: 'sla', width: 10 },
      { header: 'Instant', key: 'instant', width: 8 },
      { header: 'Toko', key: 'shopName', width: 12 },
      { header: 'Platform', key: 'platform', width: 13 },
      { header: 'Area', key: 'area', width: 12 },
      { header: 'SOI/MOI', key: 'orderType', width: 8 },
      { header: 'Picklist', key: 'picklistNo', width: 18 },
      { header: 'Picker', key: 'pickerId', width: 14 },
      { header: 'Packer', key: 'packerId', width: 14 },
      { header: 'Produk', key: 'productName', width: 30 },
      { header: 'Pending Kiriman', key: 'pk', width: 10 },
      { header: 'Review', key: 'review', width: 20 },
      { header: 'Alasan review', key: 'reviewReason', width: 28 },
      { header: 'Catatan review', key: 'reviewNote', width: 28 },
      { header: 'Direview oleh', key: 'reviewedBy', width: 16 },
    ];
    for (const r of d.rows) {
      ws.addRow({
        ...r,
        verdict: VERDICT_LABEL[r.verdict], team: r.team ? TEAM_LABEL[r.team] : '', autoTeam: r.autoTeam ? TEAM_LABEL[r.autoTeam] : '',
        stage: r.stage ? STAGE_LABEL[r.stage] : '', last: r.lastStatusBeforeCancel ?? '',
        created: dt(r.orderCreatedAt), ready: dt(r.readyAt), cancel: dt(r.cancelledAt ?? r.ocsUpdatedAt),
        hours: Math.round(r.workHours * 100) / 100, sla: r.slaHours, instant: r.isInstant ? 'Ya' : '', pk: r.inPendingKiriman ? 'Ya' : '',
        review: REVIEW_LABEL[r.reviewStatus],
      });
    }
    styleHeader(ws);
    const ws2 = wb.addWorksheet('Per hari');
    ws2.columns = [
      { header: 'Tanggal order', key: 'day', width: 14 }, { header: 'Total order', key: 'orders', width: 12 }, { header: 'Cancel', key: 'cancelled', width: 10 },
      { header: 'Kesalahan Fulfillment', key: 'fulfillment', width: 20 }, { header: 'Kesalahan Inventory', key: 'inventory', width: 20 }, { header: 'Dikecualikan lead', key: 'excluded', width: 18 },
    ];
    for (const x of d.days) ws2.addRow({ ...x, orders: x.orders ?? '' });
    styleHeader(ws2);
    name = `monitoring-cancel-${f.from}_${f.to}`;
  } else if (sp.get('kind') === 'kpi') {
    const from = isMonthKey(sp.get('from')) ? sp.get('from')! : dayKeyWib(new Date()).slice(0, 7);
    const to = isMonthKey(sp.get('to')) ? sp.get('to')! : from;
    const k = await kpiData(from, to, settings.cancelRef);
    const ws = wb.addWorksheet('KPI per bulan');
    ws.columns = [
      { header: 'Bulan', key: 'm', width: 16 },
      { header: 'Total ID sempat pending', key: 't', width: 22 },
      { header: 'Terselesaikan (terproses)', key: 'p', width: 22 },
      { header: '% terproses', key: 'pp', width: 12 },
      { header: CANCEL_BUCKET_LABEL.LE1, key: 'b1', width: 16 },
      { header: CANCEL_BUCKET_LABEL.D2, key: 'b2', width: 16 },
      { header: CANCEL_BUCKET_LABEL.GT2, key: 'b3', width: 16 },
      { header: 'Total batal', key: 'c', width: 12 },
      { header: '% batal', key: 'cp', width: 10 },
      { header: 'Masih pending', key: 'o', width: 14 },
      { header: 'Rata-rata jam s/d terproses', key: 'h', width: 24 },
    ];
    for (const r of [...k.rows, k.total]) {
      ws.addRow({ m: r.month === 'TOTAL' ? 'TOTAL' : monthLabel(r.month, true), t: r.total, p: r.processed, pp: Math.round(r.pctProcessed * 10) / 10, b1: r.buckets.LE1, b2: r.buckets.D2, b3: r.buckets.GT2, c: r.cancelled, cp: Math.round(r.pctCancelled * 10) / 10, o: r.open, h: r.avgHoursToProcess === null ? '' : Math.round(r.avgHoursToProcess * 10) / 10 });
    }
    ws.lastRow!.font = { bold: true };
    styleHeader(ws);
    const ws2 = wb.addWorksheet('Alasan pending');
    ws2.columns = [{ header: 'Alasan', key: 'l', width: 40 }, { header: 'Order ID', key: 'o', width: 12 }, { header: 'Baris', key: 'i', width: 10 }, { header: 'Qty', key: 'q', width: 10 }];
    for (const b of k.reasons) ws2.addRow({ l: b.label, o: b.orders, i: b.items, q: b.qty });
    styleHeader(ws2);
    name = `kpi-pending-${from}_${to}`;
  } else {
    const rows = await listItems({ status: sp.get('status'), from: sp.get('from'), to: sp.get('to'), sku: sp.get('sku'), q: sp.get('q') }, settings.cancelRef, 20000);
    const ws = wb.addWorksheet('Pending');
    ws.columns = [
      { header: 'Tgl input', key: 'inputAt', width: 17 },
      { header: 'Diinput oleh', key: 'inputByName', width: 18 },
      { header: 'Order ID', key: 'orderId', width: 22 },
      { header: 'SKU OCS', key: 'sku', width: 30 },
      { header: 'Qty pending', key: 'qty', width: 11 },
      { header: 'Catatan fulfillment', key: 'note', width: 28 },
      { header: 'Toko', key: 'shopName', width: 12 },
      { header: 'Platform', key: 'platform', width: 13 },
      { header: 'Area', key: 'area', width: 12 },
      { header: 'Status OCS', key: 'ocs', width: 20 },
      { header: 'Penyelesaian', key: 'res', width: 15 },
      { header: 'Waktu selesai/batal', key: 'end', width: 17 },
      { header: 'Kategori batal', key: 'bucket', width: 16 },
      { header: 'Umur (hari)', key: 'ageDays', width: 11 },
      { header: 'Phase Out', key: 'po', width: 30 },
      { header: 'Clearance', key: 'cs', width: 10 },
      { header: 'Alasan pending', key: 'reason', width: 30 },
      { header: 'Keterangan inventory', key: 'reasonNote', width: 30 },
      { header: 'Status PO', key: 'poStatus', width: 15 },
      { header: 'No. PO', key: 'poNumber', width: 16 },
      { header: 'Tgl PO', key: 'poDate', width: 11 },
      { header: 'ETA', key: 'poEta', width: 11 },
      { header: 'Qty PO', key: 'poQty', width: 9 },
      { header: 'Kedatangan', key: 'arrival', width: 16 },
      { header: 'Tgl datang', key: 'arrivedAt', width: 11 },
      { header: 'Qty datang', key: 'arrivedQty', width: 10 },
      { header: 'Tindak lanjut oleh', key: 'followUpByName', width: 18 },
      { header: 'Waktu tindak lanjut', key: 'followUpAt', width: 17 },
    ];
    for (const r of rows) {
      ws.addRow({
        ...r,
        inputAt: dt(r.inputAt),
        ocs: r.ocsFound === false ? 'Tidak ditemukan' : r.ocsStatusName ?? statusName(r.ocsStatusCode),
        res: RESOLUTION_LABEL[r.resolution],
        end: dt(r.resolution === 'PROCESSED' ? r.processedAt : r.resolution === 'CANCELLED' ? r.cancelledAt : null),
        bucket: r.cancelBucket ? CANCEL_BUCKET_LABEL[r.cancelBucket] : '',
        po: r.isPhaseOut ? r.phaseOutInfo ?? 'Ya' : '',
        cs: r.isClearance ? 'Ya' : '',
        poStatus: PO_LABEL[r.poStatus], poDate: dd(r.poDate), poEta: dd(r.poEta),
        arrival: r.poStatus === 'SUDAH' ? ARRIVAL_LABEL[r.arrivalStatus] : '', arrivedAt: dd(r.arrivedAt),
        followUpAt: dt(r.followUpAt),
      });
    }
    styleHeader(ws);
    name = `pending-kiriman-${dayKeyWib(new Date())}`;
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}.xlsx"`,
    },
  });
}
