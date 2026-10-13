import { dayKeyWib } from './kpi';

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Rentang bawaan: tanggal 1 bulan ini s/d hari ini (WIB). */
export function parseCancelFilter(sp: { get(k: string): string | null }) {
  const today = dayKeyWib(new Date());
  let from = isDay(sp.get('from')) ? sp.get('from')! : `${today.slice(0, 7)}-01`;
  let to = isDay(sp.get('to')) ? sp.get('to')! : today;
  if (from > to) [from, to] = [to, from];
  return { from, to, area: sp.get('area') || null, platform: sp.get('platform') || null, shop: sp.get('shop') || null };
}
