import 'server-only';
import { prisma } from '@/lib/prisma';
import type { CurrentUser } from '@/lib/auth';
import { classifySku } from './sync';
import { ValidationError } from '@/lib/validate';
import { cleanOrderId, cleanSku, skuInOcsOrder, type OcsSku } from '@/lib/items';
import { ageDays, cancelBucket, startFor, type CancelRef, type CancelBucket } from '@/lib/kpi';
import type { Resolution } from '@/lib/ocs-status';

export const itemInclude = {
  order: {
    select: {
      orderId: true, firstPendingAt: true, resolution: true, ocsFound: true, ocsStatusCode: true, ocsStatusName: true,
      platform: true, shopName: true, area: true, orderType: true, trackingNumber: true, orderCreatedAt: true,
      processedAt: true, cancelledAt: true, manualResolution: true, lastCheckedAt: true, lastCheckError: true,
    },
  },
} as const;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export type ItemRow = {
  id: string; orderId: string; sku: string; qty: number; note: string | null; skuInOrder: boolean | null;
  inputAt: string; inputById: string; inputByName: string;
  isPhaseOut: boolean; phaseOutInfo: string | null; isClearance: boolean;
  reason: string | null; reasonNote: string | null;
  poStatus: 'BELUM' | 'SUDAH' | 'TIDAK_PERLU'; poNumber: string | null; poDate: string | null; poEta: string | null; poQty: number | null;
  arrivalStatus: 'BELUM' | 'SEBAGIAN' | 'SUDAH'; arrivedAt: string | null; arrivedQty: number | null;
  followUpByName: string | null; followUpAt: string | null;
  resolution: Resolution; ocsFound: boolean | null; ocsStatusCode: number | null; ocsStatusName: string | null;
  platform: string | null; shopName: string | null; area: string | null; orderType: string | null; trackingNumber: string | null;
  orderCreatedAt: string | null; firstPendingAt: string; processedAt: string | null; cancelledAt: string | null;
  manualResolution: boolean; lastCheckedAt: string | null; lastCheckError: string | null;
  ageDays: number; cancelBucket: CancelBucket | null;
};

// Tipe longgar supaya tetap jalan dengan tipe Prisma hasil generate offline.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRow(it: any, ref: CancelRef): ItemRow {
  const o = it.order;
  const end = o.resolution === 'PROCESSED' ? o.processedAt : o.resolution === 'CANCELLED' ? o.cancelledAt : null;
  return {
    id: it.id, orderId: it.orderId, sku: it.sku, qty: it.qty, note: it.note, skuInOrder: it.skuInOrder,
    inputAt: iso(it.inputAt)!, inputById: it.inputById, inputByName: it.inputByName,
    isPhaseOut: it.isPhaseOut, phaseOutInfo: it.phaseOutInfo, isClearance: it.isClearance,
    reason: it.reason, reasonNote: it.reasonNote,
    poStatus: it.poStatus, poNumber: it.poNumber, poDate: iso(it.poDate), poEta: iso(it.poEta), poQty: it.poQty,
    arrivalStatus: it.arrivalStatus, arrivedAt: iso(it.arrivedAt), arrivedQty: it.arrivedQty,
    followUpByName: it.followUpByName, followUpAt: iso(it.followUpAt),
    resolution: o.resolution, ocsFound: o.ocsFound, ocsStatusCode: o.ocsStatusCode, ocsStatusName: o.ocsStatusName,
    platform: o.platform, shopName: o.shopName, area: o.area, orderType: o.orderType, trackingNumber: o.trackingNumber,
    orderCreatedAt: iso(o.orderCreatedAt), firstPendingAt: iso(o.firstPendingAt)!, processedAt: iso(o.processedAt), cancelledAt: iso(o.cancelledAt),
    manualResolution: o.manualResolution, lastCheckedAt: iso(o.lastCheckedAt), lastCheckError: o.lastCheckError,
    ageDays: ageDays(it.inputAt, end),
    cancelBucket: o.resolution === 'CANCELLED' && o.cancelledAt ? cancelBucket(startFor(o, ref), o.cancelledAt) : null,
  };
}

export type NewLine = { orderId: string; sku: string; qty: number; note?: string | null };
export type LineResult = { orderId: string; sku: string; qty: number; ok: boolean; id?: string; error?: string; warning?: string };

/** Simpan satu atau banyak baris pending. Baris yang gagal tidak menggagalkan yang lain. */
export async function createLines(user: CurrentUser, lines: NewLine[]): Promise<LineResult[]> {
  const out: LineResult[] = [];
  const now = new Date();
  for (const raw of lines) {
    const orderId = cleanOrderId(raw.orderId);
    const sku = cleanSku(raw.sku);
    const qty = Math.trunc(Number(raw.qty));
    const res: LineResult = { orderId, sku, qty, ok: false };
    try {
      if (!orderId) throw new ValidationError('Order ID wajib diisi');
      if (orderId.length > 64) throw new ValidationError('Order ID terlalu panjang');
      if (!sku) throw new ValidationError('SKU OCS wajib diisi');
      if (sku.length > 120) throw new ValidationError('SKU terlalu panjang');
      if (!Number.isFinite(qty) || qty < 1) throw new ValidationError('Jumlah pending minimal 1');
      if (qty > 100000) throw new ValidationError('Jumlah pending tidak wajar');

      let order = await prisma.pendingOrder.findUnique({ where: { orderId } });
      if (!order) {
        order = await prisma.pendingOrder.create({ data: { orderId, firstPendingAt: now } });
      } else if (order.resolution !== 'OPEN') {
        res.warning = `Order ini sudah ${order.resolution === 'PROCESSED' ? 'terproses' : 'batal'} di OCS`;
      }
      const dup = await prisma.pendingItem.findUnique({ where: { orderId_sku: { orderId, sku } } });
      if (dup) throw new ValidationError(`SKU ini sudah tercatat pending untuk order ${orderId} (qty ${dup.qty}) — ubah qty-nya di daftar bila perlu`);

      const cls = await classifySku(sku);
      const inOrder = skuInOcsOrder(sku, (order.ocsSkus as OcsSku[] | null) ?? null);
      if (inOrder === false) res.warning = 'SKU tidak ditemukan di isi order OCS — periksa lagi';
      const item = await prisma.pendingItem.create({
        data: {
          orderId, sku, qty, note: raw.note?.toString().trim().slice(0, 500) || null,
          skuInOrder: inOrder,
          inputById: user.id, inputByName: user.name, inputAt: now,
          ...cls,
        },
      });
      await prisma.itemLog.create({ data: { itemId: item.id, orderId, byName: user.name, action: 'INPUT', detail: `Input pending ${sku} × ${qty}${item.note ? ` — ${item.note}` : ''}` } });
      res.ok = true;
      res.id = item.id;
    } catch (e) {
      const err = e as { message?: string; code?: string };
      res.error = err.code === 'P2002' ? 'Duplikat: SKU ini sudah tercatat untuk order tersebut' : err.message || 'Gagal menyimpan';
    }
    out.push(res);
  }
  // Order yang tidak lagi punya item (karena semua barisnya gagal) dibersihkan.
  const touched = [...new Set(out.filter((r) => !r.ok && r.orderId).map((r) => r.orderId))];
  for (const id of touched) {
    const n = await prisma.pendingItem.count({ where: { orderId: id } });
    if (n === 0) await prisma.pendingOrder.deleteMany({ where: { orderId: id } });
  }
  return out;
}
