import 'server-only';
import { prisma } from '@/lib/prisma';
import { getSettings, getInternal, setInternal, cancelSettingsOf } from '@/lib/settings';
import { findOrder, ocsConfigured, odataOrders, odataDate, type OdataOrder } from '@/lib/ocs-client';
import { digestFindOrder, needsDetail, type LogLite, type PicklistLite } from '@/lib/cancel';
import { dayKeyWib } from '@/lib/kpi';

type Trigger = 'manual' | 'auto' | 'cron' | 'backfill';
const CURSOR_KEY = 'cancel_list_cursor';
const CANCEL_FILTER = '(StatusCode eq 90000 or StatusCode eq 11100)';
const WIB = 7 * 3600 * 1000;

export type StepResult = { ok: boolean; processed: number; changed: number; remaining: number; done: boolean; message: string };

function startOfDayUtc(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - WIB);
}

async function run<T extends StepResult>(kind: string, trigger: Trigger, fn: () => Promise<T>): Promise<T> {
  const r = await prisma.syncRun.create({ data: { kind, trigger } });
  try {
    const out = await fn();
    await prisma.syncRun.update({ where: { id: r.id }, data: { finishedAt: new Date(), ok: out.ok, checked: out.processed, changed: out.changed, message: out.message.slice(0, 4000) } });
    return out;
  } catch (e) {
    const message = (e as Error).message;
    await prisma.syncRun.update({ where: { id: r.id }, data: { finishedAt: new Date(), ok: false, message: message.slice(0, 4000) } });
    return { ok: false, processed: 0, changed: 0, remaining: -1, done: false, message } as T;
  }
}

function toRow(o: OdataOrder) {
  const created = new Date(o.CreatedAt);
  const updated = new Date(o.UpdatedAt);
  return {
    orderId: String(o.Id).slice(0, 64),
    statusCode: Number(o.StatusCode),
    platform: o.CommercePlatform?.slice(0, 32) ?? null,
    shopName: o.ShopName?.slice(0, 64) ?? null,
    area: o.Location?.slice(0, 64) ?? null,
    orderType: o.SoiOrMoi?.slice(0, 8) ?? null,
    isInstant: Boolean(o.IsInstant),
    pickId: o.PickId?.slice(0, 40) ?? null,
    totalQty: o.TotalQtyOrder ?? null,
    productName: o.ProductName?.slice(0, 255) ?? null,
    orderCreatedAt: created,
    ocsUpdatedAt: updated,
    calendarHours: Math.max(0, (updated.getTime() - created.getTime()) / 3600000),
  };
}

type Cursor = { phase: 'backfill'; day: string; skip: number } | { phase: 'inc'; since: string; skip: number; runStart: string };

function nextDay(day: string) { return dayKeyWib(new Date(startOfDayUtc(day).getTime() + 86400000 + 3600000)); }

/** Simpan satu halaman hasil OData; mengembalikan jumlah baru & berubah. */
async function upsertPage(rows: OdataOrder[], daysTouched: Set<string>) {
  const mapped = rows.map(toRow).filter((r) => r.orderId && !Number.isNaN(r.orderCreatedAt.getTime()) && !Number.isNaN(r.ocsUpdatedAt.getTime()));
  const existing = await prisma.cancelOrder.findMany({ where: { orderId: { in: mapped.map((r) => r.orderId) } }, select: { orderId: true, ocsUpdatedAt: true, statusCode: true } });
  const ex = new Map(existing.map((e: { orderId: string; ocsUpdatedAt: Date; statusCode: number }) => [e.orderId, e]));
  const fresh = mapped.filter((r) => !ex.has(r.orderId));
  let inserted = 0, updated = 0;
  if (fresh.length) inserted = (await prisma.cancelOrder.createMany({ data: fresh, skipDuplicates: true })).count;
  for (const r of mapped) {
    const e = ex.get(r.orderId) as { ocsUpdatedAt: Date; statusCode: number } | undefined;
    if (e && (e.ocsUpdatedAt.getTime() !== r.ocsUpdatedAt.getTime() || e.statusCode !== r.statusCode)) {
      // data berubah di OCS → log perlu dibuka ulang
      await prisma.cancelOrder.update({ where: { orderId: r.orderId }, data: { ...r, detailedAt: null } });
      updated++;
    }
    daysTouched.add(dayKeyWib(r.orderCreatedAt));
  }
  return { inserted, updated };
}

/**
 * Tarik daftar order CANCELLED dari OData DTO_Orders.
 *
 * Mengurutkan 400 ribu order menurut UpdatedAt membuat OCS timeout (13 Okt 2026),
 * jadi penarikan memakai CreatedAt — kolom yang juga dipakai halaman Orders OCS:
 * 1. Fase backfill: per HARI (tanggal order dibuat) dari tanggal mulai s/d hari ini,
 *    halaman 500 baris, kursor {hari, skip} disimpan setiap halaman.
 * 2. Fase inkremental: hanya order yang dibuat N hari terakhir (Pengaturan, bawaan 7)
 *    dan berubah sejak sinkron sebelumnya — cancel otomatis marketplace yang datang
 *    beberapa hari kemudian tetap tertangkap.
 */
export async function syncCancelList(opts: { trigger: Trigger; reset?: boolean; budgetMs?: number }): Promise<StepResult> {
  if (!ocsConfigured()) return { ok: false, processed: 0, changed: 0, remaining: 0, done: true, message: 'OCS_USERNAME / OCS_PASSWORD belum diisi di .env' };
  return run('CANCEL_LIST', opts.trigger, async () => {
    const s = await getSettings();
    const startDay = s.cancelStartDate;
    const today = dayKeyWib(new Date());
    const deadline = Date.now() + (opts.budgetMs ?? 25000);
    let cur: Cursor = { phase: 'backfill', day: startDay, skip: 0 };
    if (!opts.reset) {
      try {
        const saved = JSON.parse((await getInternal(CURSOR_KEY)) || 'null') as Cursor | null;
        if (saved && (saved.phase === 'inc' || (saved.phase === 'backfill' && saved.day >= startDay))) cur = saved;
      } catch { /* kursor lama (format tanggal) → mulai backfill */ }
    }
    const PAGE = 500;
    let processed = 0, inserted = 0, updated = 0, done = false;
    const daysTouched = new Set<string>();
    const save = () => setInternal(CURSOR_KEY, JSON.stringify(cur));
    // batas waktu satu permintaan OData: sisa anggaran + 15 dtk, maks 60 dtk (laptop: 60 dtk penuh)
    const reqTimeout = () => Math.min(60000, Math.max(10000, deadline - Date.now() + 15000));

    while (Date.now() < deadline) {
      if (cur.phase === 'backfill') {
        if (cur.day > today) {
          // backfill selesai → mulai inkremental dari awal hari backfill terakhir
          const runStart = new Date().toISOString();
          cur = { phase: 'inc', since: new Date(startOfDayUtc(today).getTime()).toISOString(), skip: 0, runStart };
          await save();
          continue;
        }
        const a = startOfDayUtc(cur.day), b = new Date(a.getTime() + 86400000);
        const { rows } = await odataOrders(`${CANCEL_FILTER} and CreatedAt ge ${odataDate(a)} and CreatedAt lt ${odataDate(b)}`, { top: PAGE, skip: cur.skip, orderby: 'CreatedAt asc', timeoutMs: reqTimeout() });
        if (!rows.length) {
          daysTouched.add(cur.day);
          cur = { phase: 'backfill', day: nextDay(cur.day), skip: 0 };
          await save();
          continue;
        }
        const r = await upsertPage(rows, daysTouched);
        inserted += r.inserted; updated += r.updated; processed += rows.length;
        cur = { ...cur, skip: cur.skip + rows.length };
        await save();
      } else {
        const windowStart = new Date(Math.max(startOfDayUtc(startDay).getTime(), startOfDayUtc(today).getTime() - s.cancelRescanDays * 86400000));
        const since = new Date(new Date(cur.since).getTime() - 10 * 60000);
        const { rows } = await odataOrders(`${CANCEL_FILTER} and CreatedAt ge ${odataDate(windowStart)} and UpdatedAt ge ${odataDate(since)}`, { top: PAGE, skip: cur.skip, orderby: 'CreatedAt asc', timeoutMs: reqTimeout() });
        if (!rows.length) {
          // satu putaran inkremental selesai — putaran berikutnya mulai dari waktu putaran ini dimulai
          cur = { phase: 'inc', since: cur.runStart, skip: 0, runStart: new Date().toISOString() };
          await save();
          done = true;
          break;
        }
        const r = await upsertPage(rows, daysTouched);
        inserted += r.inserted; updated += r.updated; processed += rows.length;
        cur = { ...cur, skip: cur.skip + rows.length };
        await save();
      }
    }
    // semua hari sejak tanggal mulai yang belum punya hitungan ikut diisi (termasuk hari tanpa cancel)
    const known = new Set((await prisma.cancelDaily.findMany({ select: { day: true } })).map((x: { day: string }) => x.day));
    for (let d = startDay; d <= today && cur.phase === 'inc'; d = nextDay(d)) if (!known.has(d)) daysTouched.add(d);
    const days = await refreshDailyCounts([...daysTouched], deadline + 15000);
    const pos = cur.phase === 'backfill' ? `posisi: tanggal ${cur.day}, baris ${cur.skip}` : 'data sudah sampai hari ini';
    return {
      ok: true, processed, changed: inserted + updated, remaining: done ? 0 : -1, done,
      message: `${processed} order cancel dibaca (${inserted} baru, ${updated} berubah); ${pos}${done ? '' : ' — dilanjutkan di putaran berikutnya'}${days ? `; rasio harian ${days} hari diperbarui` : ''}.`,
    };
  });
}

/** Perbarui jumlah order & cancel per hari (tanggal dibuat, WIB) untuk rasio cancel. */
export async function refreshDailyCounts(days: string[], deadline = Date.now() + 15000): Promise<number> {
  const today = dayKeyWib(new Date());
  const yesterday = dayKeyWib(new Date(Date.now() - 86400000));
  const want = new Set([...days, today, yesterday]);
  const existing = await prisma.cancelDaily.findMany({ where: { day: { in: [...want] } } });
  const fresh = new Map(existing.map((e: { day: string; syncedAt: Date }) => [e.day, e.syncedAt]));
  let n = 0;
  for (const day of [...want].sort().reverse()) {
    if (Date.now() > deadline || n >= 40) break;
    const last = fresh.get(day) as Date | undefined;
    // hari lama cukup dihitung sekali sejam
    if (last && day !== today && day !== yesterday && Date.now() - last.getTime() < 3600000) continue;
    const a = startOfDayUtc(day), b = new Date(a.getTime() + 86400000);
    const { count } = await odataOrders(`CreatedAt ge ${odataDate(a)} and CreatedAt lt ${odataDate(b)}`, { top: 1, count: true, orderby: 'CreatedAt asc' });
    const cancelled = await prisma.cancelOrder.count({ where: { orderCreatedAt: { gte: a, lt: b } } });
    const data = { totalOrders: count ?? 0, cancelled, syncedAt: new Date() };
    await prisma.cancelDaily.upsert({ where: { day }, update: data, create: { day, ...data } });
    n++;
  }
  return n;
}

/** Buka log Find Order untuk order cancel yang MUNGKIN kesalahan gudang. */
export async function syncCancelDetail(opts: { trigger: Trigger; limit?: number; budgetMs?: number }): Promise<StepResult> {
  if (!ocsConfigured()) return { ok: false, processed: 0, changed: 0, remaining: 0, done: true, message: 'OCS_USERNAME / OCS_PASSWORD belum diisi di .env' };
  return run('CANCEL_DETAIL', opts.trigger, async () => {
    const s = await getSettings();
    const cs = cancelSettingsOf(s);
    const deadline = Date.now() + (opts.budgetMs ?? 25000);
    const limit = opts.limit ?? s.cancelDetailBatch;
    const minSla = Math.min(cs.slaHours, cs.slaInstantHours);
    // Saringan SQL: jam kalender ≥ x minimum (jam kerja tidak mungkin lebih besar dari jam kalender),
    // lalu saringan jam kerja di JS. Dipindai per halaman supaya baris malam hari yang
    // jam kerjanya kecil tidak menyumbat antrean.
    type P = { orderId: string; isInstant: boolean; orderCreatedAt: Date; ocsUpdatedAt: Date; detailedAt: Date | null };
    const candidates: P[] = [];
    let after = '';
    for (let page = 0; page < 40; page++) {
      const pool: P[] = await prisma.cancelOrder.findMany({
        where: { detailedAt: null, calendarHours: { gte: minSla }, ...(after ? { orderId: { gt: after } } : {}) },
        select: { orderId: true, isInstant: true, orderCreatedAt: true, ocsUpdatedAt: true, detailedAt: true },
        orderBy: { orderId: 'asc' },
        take: 2000,
      });
      for (const p of pool) if (needsDetail(p, cs)) candidates.push(p);
      if (pool.length < 2000) break;
      after = pool[pool.length - 1]!.orderId;
    }
    // yang paling baru dicek lebih dulu
    candidates.sort((a, b) => b.ocsUpdatedAt.getTime() - a.ocsUpdatedAt.getTime());
    const queue = candidates.slice(0, limit).map((p) => p.orderId);
    let processed = 0, faultsFound = 0, failed = 0;
    const errors: string[] = [];
    let fatal: string | null = null;
    const worker = async () => {
      while (queue.length && Date.now() < deadline && !fatal) {
        const id = queue.shift()!;
        try {
          const info = await findOrder(id);
          if (!info.found) {
            await prisma.cancelOrder.update({ where: { orderId: id }, data: { detailedAt: new Date(), detailError: 'Tidak ditemukan lewat Find Order' } });
          } else {
            const d = digestFindOrder(info.logs as LogLite[], info.picklists as PicklistLite[]);
            await prisma.cancelOrder.update({
              where: { orderId: id },
              data: {
                detailedAt: new Date(), detailError: null,
                readyAt: d.readyAt, cancelledAt: d.cancelledAt, maxCodeBeforeCancel: d.maxCodeBeforeCancel,
                lastStatusBeforeCancel: d.lastStatusBeforeCancel?.slice(0, 64) ?? null,
                hasPicklist: d.hasPicklist, picked: d.picked, packed: d.packed, pickFailed: d.pickFailed,
                picklistNo: d.picklistNo?.slice(0, 40) ?? null, pickerId: d.pickerId?.slice(0, 64) ?? null, packerId: d.packerId?.slice(0, 64) ?? null,
                ocsLogs: info.logs.map((l) => ({ at: l.CreatedAt, code: l.NewStatusCode, status: l.NewStatus })),
                ...(info.isInstant !== null ? { isInstant: info.isInstant } : {}),
              },
            });
            if (d.cancelledAt && !(d.maxCodeBeforeCancel && d.maxCodeBeforeCancel >= 20030)) faultsFound++;
          }
          processed++;
        } catch (e) {
          const msg = (e as Error).message;
          failed++;
          if (/Login OCS|belum diisi/.test(msg)) fatal = msg;
          if (errors.length < 3) errors.push(`${id}: ${msg}`);
          await prisma.cancelOrder.update({ where: { orderId: id }, data: { detailError: msg.slice(0, 500) } }).catch(() => {});
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const remaining = candidates.length - processed;
    return {
      ok: !fatal && failed === 0, processed, changed: faultsFound, remaining, done: remaining <= 0,
      message: fatal ?? `Log dibuka ${processed} order (${candidates.length} perlu dicek${remaining > 0 ? `, sisa ${remaining}` : ''})${failed ? `, gagal ${failed}: ${errors.join(' | ')}` : ''}.`,
    };
  });
}

/** Dipicu halaman Monitoring Cancel & cron: daftar dulu, lalu buka log sesuai sisa waktu. */
export async function autoCancelSync(trigger: Trigger = 'auto'): Promise<{ list?: StepResult; detail?: StepResult; skipped?: string }> {
  const s = await getSettings();
  if (trigger === 'auto') {
    if (s.cancelSyncMinutes <= 0) return { skipped: 'Sinkron otomatis dimatikan' };
    const last = await prisma.syncRun.findFirst({ where: { kind: 'CANCEL_LIST' }, orderBy: { startedAt: 'desc' } });
    if (last && Date.now() - last.startedAt.getTime() < s.cancelSyncMinutes * 60000) return { skipped: 'Belum waktunya' };
    const lock = Number(await getInternal('cancel_lock')) || 0;
    if (Date.now() - lock < 120000) return { skipped: 'Sinkron lain sedang berjalan' };
  }
  await setInternal('cancel_lock', String(Date.now()));
  try {
    const budget = trigger === 'cron' ? 30000 : 40000;
    const t0 = Date.now();
    const list = await syncCancelList({ trigger, budgetMs: Math.round(budget * 0.5) });
    const detail = await syncCancelDetail({ trigger, budgetMs: Math.max(5000, budget - (Date.now() - t0)) });
    return { list, detail };
  } finally {
    await setInternal('cancel_lock', '0');
  }
}
