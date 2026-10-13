// Util bersama (aman dipakai di client maupun server).
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const TZ = 'Asia/Jakarta';

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  return fmtDate(d, true);
}

/** "13 Okt, 09.51" — ringkas untuk tabel */
export function fmtShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** yyyy-mm-dd (zona Jakarta) untuk input[type=date] */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}

export function fmtPct(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '0%';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(n)}%`;
}

export function timeAgo(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return 'belum pernah';
  const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

export function fmtAge(days: number): string {
  if (days < 1) return `${Math.max(0, Math.round(days * 24))} jam`;
  return `${days.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari`;
}
