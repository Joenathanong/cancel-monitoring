import 'server-only';
import { prisma } from '@/lib/prisma';
import { getSettings, getInternal, setInternal } from '@/lib/settings';
import { findOrder, ocsConfigured, type OcsOrderInfo } from '@/lib/ocs-client';
import { fetchPhaseOut, doiConfigured } from '@/lib/doi-client';
import { classifyOcs, statusName, RESOLUTION_LABEL } from '@/lib/ocs-status';
import { skuInOcsOrder, isClearanceSku } from '@/lib/items';

type Trigger = 'manual' | 'auto' | 'cron' | 'input';

const SYSTEM = 'Sistem (OCS)';

/** Simpan hasil Find Order ke order + item-nya. Mengembalikan true bila penyelesaian berubah. */
export async function applyOcsResult(orderId: string, info: OcsOrderInfo, processedMinCode: number): Promise<boolean> {
  const order = await prisma.pendingOrder.findUnique({ where: { orderId }, include: { items: { select: { id: true, sku: true, skuInOrder: true } } } });
  if (!order) return false;
  const now = new Date();
  if (!info.found) {
    await prisma.pendingOrder.update({ where: { orderId }, data: { ocsFound: false, lastCheckedAt: now, lastCheckError: null } });
    return false;
  }
  const c = classifyOcs(info.statusCode, info.logs, info.updatedAt, processedMinCode);
  const data: Record<string, unknown> = {
    ocsFound: true,
    ocsStatusCode: info.statusCode,
    ocsStatusName: (info.statusName ?? statusName(info.statusCode)).slice(0, 64),
    ocsRawStatus: info.rawStatus?.slice(0, 120) ?? null,
    platform: info.platform?.slice(0, 32) ?? null,
    shopName: info.shopName?.slice(0, 64) ?? null,
    area: info.area?.slice(0, 64) ?? null,
    orderType: info.orderType?.slice(0, 8) ?? null,
    trackingNumber: info.trackingNumber?.slice(0, 120) ?? null,
    orderCreatedAt: info.createdAt ? new Date(info.createdAt) : null,
    ocsSkus: info.skus,
    lastCheckedAt: now,
    lastCheckError: null,
  };
  let changed = false;
  if (!order.manualResolution) {
    data.resolution = c.resolution;
    data.processedAt = c.processedAt;
    data.cancelledAt = c.cancelledAt;
    changed = c.resolution !== order.resolution;
  }
  await prisma.pendingOrder.update({ where: { orderId }, data });

  for (const it of order.items) {
    const v = skuInOcsOrder(it.sku, info.skus);
    if (v !== it.skuInOrder) await prisma.pendingItem.update({ where: { id: it.id }, data: { skuInOrder: v } });
  }
  if (order.ocsStatusCode !== info.statusCode || changed) {
    const from = order.ocsStatusCode === null ? 'belum dicek' : statusName(order.ocsStatusCode);
    await prisma.itemLog.create({
      data: {
        orderId,
        byName: SYSTEM,
        action: changed ? 'RESOLUSI' : 'STATUS_OCS',
        detail: `${from} → ${statusName(info.statusCode)}${changed ? ` · ${RESOLUTION_LABEL[c.resolution]}` : ''}`,
      },
    });
  }
  return changed;
}

async function startRun(kind: 'OCS' | 'PHASE_OUT', trigger: Trigger) {
  return prisma.syncRun.create({ data: { kind, trigger } });
}
async function endRun(id: string, ok: boolean, checked: number, changed: number, message: string) {
  await prisma.syncRun.update({ where: { id }, data: { finishedAt: new Date(), ok, checked, changed, message: message.slice(0, 4000) } });
}

export type SyncResult = { ok: boolean; checked: number; changed: number; failed: number; remaining: number; message: string };

/**
 * Cek status OCS. Tanpa `orderIds`: ambil order yang masih OPEN (dan tidak dikunci
 * manual), paling lama belum dicek lebih dulu, dibatasi `limit` dan tenggat waktu
 * supaya muat di batas fungsi Vercel.
 */
export async function syncOcs(opts: { trigger: Trigger; orderIds?: string[]; limit?: number; budgetMs?: number }): Promise<SyncResult> {
  if (!ocsConfigured()) return { ok: false, checked: 0, changed: 0, failed: 0, remaining: 0, message: 'OCS_USERNAME / OCS_PASSWORD belum diisi di .env' };
  const settings = await getSettings();
  const limit = opts.limit ?? settings.ocsBatch;
  const deadline = Date.now() + (opts.budgetMs ?? 45000);
  const where = { resolution: 'OPEN' as const, manualResolution: false };
  const ids = opts.orderIds?.length
    ? opts.orderIds
    : (await prisma.pendingOrder.findMany({ where, orderBy: [{ lastCheckedAt: 'asc' }, { firstPendingAt: 'asc' }], take: limit, select: { orderId: true } })).map((o: { orderId: string }) => o.orderId);
  const run = await startRun('OCS', opts.trigger);
  let checked = 0, changed = 0, failed = 0;
  const errors: string[] = [];
  let fatal: string | null = null;
  const queue = [...ids];
  const worker = async () => {
    while (queue.length && Date.now() < deadline && !fatal) {
      const id = queue.shift()!;
      try {
        const info = await findOrder(id);
        if (await applyOcsResult(id, info, settings.processedMinCode)) changed++;
        checked++;
      } catch (e) {
        const msg = (e as Error).message;
        failed++;
        if (/Login OCS|belum diisi/.test(msg)) fatal = msg;
        if (errors.length < 5) errors.push(`${id}: ${msg}`);
        await prisma.pendingOrder.update({ where: { orderId: id }, data: { lastCheckedAt: new Date(), lastCheckError: msg.slice(0, 500) } }).catch(() => {});
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const remaining = opts.orderIds ? queue.length : await prisma.pendingOrder.count({ where });
  const ok = !fatal && failed === 0;
  const message = fatal ?? (errors.length ? `Dicek ${checked}, gagal ${failed}. ${errors.join(' | ')}` : `Dicek ${checked} order, ${changed} berubah status.`);
  await endRun(run.id, ok, checked, changed, message);
  return { ok, checked, changed, failed, remaining, message };
}

/** Tarik ulang daftar Phase Out dari doi-monitor lalu tandai ulang item pending. */
export async function syncPhaseOut(trigger: Trigger): Promise<SyncResult> {
  if (!doiConfigured()) return { ok: false, checked: 0, changed: 0, failed: 0, remaining: 0, message: 'DOI_MONITOR_USERNAME / DOI_MONITOR_PASSWORD belum diisi di .env' };
  const run = await startRun('PHASE_OUT', trigger);
  try {
    const { entries, rows, unmatched } = await fetchPhaseOut();
    const now = new Date();
    await prisma.phaseOutSku.deleteMany({});
    for (let i = 0; i < entries.length; i += 500) {
      await prisma.phaseOutSku.createMany({ data: entries.slice(i, i + 500).map((e) => ({ ...e, syncedAt: now })), skipDuplicates: true });
    }
    const changed = await reclassifyItems();
    const message = `${rows} baris phase out → ${entries.length} SKU${unmatched ? ` (${unmatched} baris tanpa SKU cocok di doi-monitor)` : ''}. ${changed} baris pending ditandai ulang.`;
    await endRun(run.id, true, entries.length, changed, message);
    return { ok: true, checked: entries.length, changed, failed: 0, remaining: 0, message };
  } catch (e) {
    const message = (e as Error).message;
    await endRun(run.id, false, 0, 0, message);
    return { ok: false, checked: 0, changed: 0, failed: 1, remaining: 0, message };
  }
}

export function phaseOutLabel(p: { reason: string | null; disposition: string | null; replacement: string | null }) {
  const disp: Record<string, string> = { SELL_DOWN: 'Jual habis', RETURN_VENDOR: 'Retur vendor', WRITE_OFF: 'Write-off', BUNDLING: 'Bundling' };
  return [p.reason, p.disposition ? disp[p.disposition] ?? p.disposition : null, p.replacement ? `pengganti ${p.replacement}` : null].filter(Boolean).join(' · ').slice(0, 255) || 'Phase Out';
}

/** Golongan (Phase Out / Clearance) untuk satu SKU. */
export async function classifySku(sku: string): Promise<{ isPhaseOut: boolean; phaseOutInfo: string | null; isClearance: boolean }> {
  const p = await prisma.phaseOutSku.findUnique({ where: { sku } });
  return { isPhaseOut: Boolean(p), phaseOutInfo: p ? phaseOutLabel(p) : null, isClearance: isClearanceSku(sku) };
}

/**
 * Tandai ulang Phase Out/Clearance untuk SEMUA item (termasuk order yang sudah
 * batal/terproses) supaya rekap KPI "golongan barang" memakai daftar terbaru.
 */
export async function reclassifyItems(): Promise<number> {
  const [items, po] = await Promise.all([
    prisma.pendingItem.findMany({ select: { id: true, sku: true, isPhaseOut: true, phaseOutInfo: true, isClearance: true } }),
    prisma.phaseOutSku.findMany(),
  ]);
  type Po = { sku: string; reason: string | null; disposition: string | null; replacement: string | null };
  const map = new Map<string, Po>(po.map((p: Po) => [p.sku.toUpperCase(), p]));
  let n = 0;
  for (const it of items) {
    const p = map.get(it.sku.toUpperCase());
    const next = { isPhaseOut: Boolean(p), phaseOutInfo: p ? phaseOutLabel(p) : null, isClearance: isClearanceSku(it.sku) };
    if (next.isPhaseOut !== it.isPhaseOut || next.phaseOutInfo !== it.phaseOutInfo || next.isClearance !== it.isClearance) {
      await prisma.pendingItem.update({ where: { id: it.id }, data: next });
      n++;
    }
  }
  return n;
}

/**
 * Sinkron otomatis yang dipicu saat halaman dibuka: hanya jalan bila sinkron
 * terakhir sudah lewat interval di Pengaturan. Kunci 2 menit mencegah dua tab
 * menjalankan sinkron bersamaan.
 */
export async function autoSync(trigger: Trigger = 'auto'): Promise<{ ocs?: SyncResult; phaseOut?: SyncResult; skipped?: string }> {
  const settings = await getSettings();
  const lock = Number(await getInternal('sync_lock')) || 0;
  if (trigger === 'auto' && Date.now() - lock < 120000) return { skipped: 'Sinkron lain sedang berjalan' };
  await setInternal('sync_lock', String(Date.now()));
  try {
    const out: { ocs?: SyncResult; phaseOut?: SyncResult } = {};
    const lastPo = await prisma.syncRun.findFirst({ where: { kind: 'PHASE_OUT', ok: true }, orderBy: { startedAt: 'desc' } });
    if (!lastPo || Date.now() - lastPo.startedAt.getTime() > settings.phaseOutSyncHours * 3600000) {
      out.phaseOut = await syncPhaseOut(trigger);
    }
    const lastOcs = await prisma.syncRun.findFirst({ where: { kind: 'OCS' }, orderBy: { startedAt: 'desc' } });
    const due = trigger !== 'auto' || (settings.autoSyncMinutes > 0 && (!lastOcs || Date.now() - lastOcs.startedAt.getTime() > settings.autoSyncMinutes * 60000));
    if (due) out.ocs = await syncOcs({ trigger, budgetMs: trigger === 'cron' ? 20000 : 25000 });
    return out;
  } finally {
    await setInternal('sync_lock', '0');
  }
}
