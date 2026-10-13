// Jam kerja gudang (WIB) — modul murni, diuji di cancel.test.ts.
// IEG: shift 1 mulai 08:00, shift 2 selesai 23:59 → di luar itu jam tidak dihitung.

const WIB_MS = 7 * 3600 * 1000;
const DAY_MS = 86400000;

export type Shift = { startMin: number; endMin: number };

/** "08:00" → 480. "23:59" dibaca sebagai akhir hari (1440) supaya menit terakhir ikut terhitung. */
export function parseHm(s: string, isEnd = false): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  const v = h * 60 + mi;
  return isEnd && v === 1439 ? 1440 : v;
}

export function makeShift(start: string, end: string): Shift {
  const s = parseHm(start) ?? 480;
  const e = parseHm(end, true) ?? 1440;
  return e > s ? { startMin: s, endMin: e } : { startMin: 0, endMin: 1440 };
}

/**
 * Jumlah jam kerja di antara a dan b (WIB). Setiap hari dihitung sama
 * (gudang buka tiap hari). Hasil desimal jam.
 */
export function workHoursBetween(a: Date, b: Date, shift: Shift): number {
  if (!(b > a)) return 0;
  let total = 0;
  // mulai dari tengah malam WIB hari `a`
  const aw = a.getTime() + WIB_MS;
  let day = Math.floor(aw / DAY_MS) * DAY_MS - WIB_MS;
  const end = b.getTime();
  while (day < end) {
    const ws = day + shift.startMin * 60000;
    const we = day + shift.endMin * 60000;
    const s = Math.max(ws, a.getTime());
    const e = Math.min(we, end);
    if (e > s) total += e - s;
    day += DAY_MS;
  }
  return total / 3600000;
}
