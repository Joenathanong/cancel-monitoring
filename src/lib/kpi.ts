// Rumus KPI pending kiriman — modul murni, diuji di kpi.test.ts.
import type { Resolution } from './ocs-status';

/** Indonesia tanpa DST — WIB = UTC+7 tetap. */
const WIB_MS = 7 * 3600 * 1000;

/** 'YYYY-MM' menurut WIB. */
export function monthKeyWib(d: Date): string {
  const x = new Date(d.getTime() + WIB_MS);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' menurut WIB. */
export function dayKeyWib(d: Date): string {
  const x = new Date(d.getTime() + WIB_MS);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/** Awal bulan (00:00 WIB) dari 'YYYY-MM' sebagai Date UTC. */
export function monthStartUtc(key: string): Date {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1) - WIB_MS);
}

/** Awal bulan berikutnya (eksklusif). */
export function monthEndUtc(key: string): Date {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1) - WIB_MS);
}

export function isMonthKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Daftar bulan dari..sampai (inklusif). Maks 36 bulan supaya tidak meledak. */
export function monthsBetween(from: string, to: string): string[] {
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const out: string[] = [];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const full = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${long ? full[m - 1] : MONTHS_ID[m - 1]} ${y}`;
}

// ── Kategori batal ────────────────────────────────────────────────────────────
export type CancelBucket = 'LE1' | 'D2' | 'GT2';
export const CANCEL_BUCKETS: CancelBucket[] = ['LE1', 'D2', 'GT2'];
export const CANCEL_BUCKET_LABEL: Record<CancelBucket, string> = {
  LE1: 'Batal ≤ 1 hari',
  D2: 'Batal hari ke-2',
  GT2: 'Batal > 2 hari',
};
export const CANCEL_BUCKET_HINT: Record<CancelBucket, string> = {
  LE1: 'batal dalam 24 jam',
  D2: 'batal setelah 24 jam s/d 48 jam',
  GT2: 'batal setelah lebih dari 48 jam',
};

/** Acuan mulai hitung: saat Fulfillment input pending, atau saat order dibuat di marketplace. */
export type CancelRef = 'INPUT' | 'ORDER';

export function cancelBucket(start: Date, cancelledAt: Date): CancelBucket {
  const h = (cancelledAt.getTime() - start.getTime()) / 3600000;
  if (h <= 24) return 'LE1';
  if (h <= 48) return 'D2';
  return 'GT2';
}

export type KpiOrder = {
  orderId: string;
  firstPendingAt: Date;
  orderCreatedAt: Date | null;
  resolution: Resolution;
  processedAt: Date | null;
  cancelledAt: Date | null;
};

export type MonthRow = {
  month: string;
  total: number;
  processed: number;
  cancelled: number;
  open: number;
  buckets: Record<CancelBucket, number>;
  pctProcessed: number;
  pctCancelled: number;
  /** rata-rata jam dari input pending sampai terproses */
  avgHoursToProcess: number | null;
};

function emptyRow(month: string): MonthRow {
  return { month, total: 0, processed: 0, cancelled: 0, open: 0, buckets: { LE1: 0, D2: 0, GT2: 0 }, pctProcessed: 0, pctCancelled: 0, avgHoursToProcess: null };
}

export function startFor(o: KpiOrder, ref: CancelRef): Date {
  return ref === 'ORDER' && o.orderCreatedAt ? o.orderCreatedAt : o.firstPendingAt;
}

/**
 * Rekap per bulan. Satu Order ID dihitung SEKALI, di bulan saat ia pertama kali
 * diinput pending (firstPendingAt, WIB) — walaupun beberapa SKU-nya pending.
 */
export function summarize(orders: KpiOrder[], months: string[], ref: CancelRef): { rows: MonthRow[]; total: MonthRow } {
  const map = new Map(months.map((m) => [m, emptyRow(m)]));
  const sumHours = new Map<string, { h: number; n: number }>();
  const total = emptyRow('TOTAL');
  let tH = 0, tN = 0;
  for (const o of orders) {
    const key = monthKeyWib(o.firstPendingAt);
    const row = map.get(key);
    if (!row) continue;
    for (const r of [row, total]) {
      r.total++;
      if (o.resolution === 'PROCESSED') r.processed++;
      else if (o.resolution === 'CANCELLED') r.cancelled++;
      else r.open++;
    }
    if (o.resolution === 'CANCELLED' && o.cancelledAt) {
      const b = cancelBucket(startFor(o, ref), o.cancelledAt);
      row.buckets[b]++;
      total.buckets[b]++;
    } else if (o.resolution === 'CANCELLED') {
      // tanpa waktu batal → anggap paling lama, supaya tidak hilang dari total
      row.buckets.GT2++;
      total.buckets.GT2++;
    }
    if (o.resolution === 'PROCESSED' && o.processedAt) {
      const h = Math.max(0, (o.processedAt.getTime() - o.firstPendingAt.getTime()) / 3600000);
      const s = sumHours.get(key) ?? { h: 0, n: 0 };
      s.h += h; s.n++;
      sumHours.set(key, s);
      tH += h; tN++;
    }
  }
  const finish = (r: MonthRow, s?: { h: number; n: number }) => {
    r.pctProcessed = r.total ? (r.processed / r.total) * 100 : 0;
    r.pctCancelled = r.total ? (r.cancelled / r.total) * 100 : 0;
    r.avgHoursToProcess = s && s.n ? s.h / s.n : null;
  };
  const rows = months.map((m) => { const r = map.get(m)!; finish(r, sumHours.get(m)); return r; });
  finish(total, { h: tH, n: tN });
  return { rows, total };
}

/** Umur pending dalam hari (desimal 1) sejak input sampai selesai/sekarang. */
export function ageDays(start: Date, end: Date | null, now = new Date()): number {
  const e = end ?? now;
  return Math.max(0, Math.round(((e.getTime() - start.getTime()) / 86400000) * 10) / 10);
}
