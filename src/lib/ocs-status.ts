// Kode status order OCS — diambil dari headerFilter grid Orders di bundel OCS (13 Okt 2026).
// Modul murni (tanpa server-only) supaya bisa dipakai di client & diuji.

export const OCS_STATUS: Array<{ code: number; name: string }> = [
  { code: 0, name: 'NA' },
  { code: 10000, name: 'UNPAID' },
  { code: 11000, name: 'IN CANCEL' },
  { code: 11100, name: 'CANCELLED' },
  { code: 20000, name: 'READY TO PROCESS' },
  { code: 20001, name: 'PROCESSED' },
  { code: 20002, name: 'SCHEDULED' },
  { code: 20010, name: 'PICKLIST ASSIGNED' },
  { code: 20011, name: 'PICKING' },
  { code: 20012, name: 'PICKING FAILED' },
  { code: 20013, name: 'PICKED' },
  { code: 20014, name: 'SORTING' },
  { code: 20015, name: 'SORTING FAILED' },
  { code: 20016, name: 'SORTED' },
  { code: 20020, name: 'PACKING' },
  { code: 20021, name: 'PACKING FAILED' },
  { code: 20022, name: 'PACKED' },
  { code: 20023, name: 'BYPASS' },
  { code: 20030, name: 'MANIFESTED' },
  { code: 30000, name: 'IN TRANSIT' },
  { code: 30200, name: 'SHIPPING LOST' },
  { code: 30300, name: 'SHIPPING FAILED' },
  { code: 31000, name: 'RETRY SHIP' },
  { code: 40000, name: 'DELIVERED TOCONFIRM' },
  { code: 41000, name: 'DELIVERED CONFIRMED' },
  { code: 42000, name: 'DELIVERED RETURNED' },
  { code: 50000, name: 'COMPLETED' },
  { code: 70000, name: 'RETURN' },
  { code: 71000, name: 'RETURN RETURNED' },
  { code: 72000, name: 'RETURN CONFIRMED' },
  { code: 90000, name: 'CANCELLED' },
];

export const CANCELLED_CODE = 90000;
/** OCS memakai DUA kode batal: 11100 dan 90000 (GetStatusList, 13 Okt 2026). */
export const CANCELLED_CODES = [11100, 90000];
export const isCancelledCode = (c: number) => CANCELLED_CODES.includes(c);
export const IN_CANCEL_CODE = 11000;
/** Bawaan: order dianggap "terproses" begitu sudah MANIFESTED (diserahkan ke kurir). */
export const DEFAULT_PROCESSED_MIN_CODE = 20030;

export function statusName(code: number | null | undefined): string {
  if (code === null || code === undefined) return '—';
  return OCS_STATUS.find((s) => s.code === code)?.name ?? String(code);
}

export type Resolution = 'OPEN' | 'PROCESSED' | 'CANCELLED';

export type OcsLog = { CreatedAt?: string | null; NewStatusCode?: number | null; NewStatus?: string | null };

export type Classified = {
  resolution: Resolution;
  processedAt: Date | null;
  cancelledAt: Date | null;
};

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Waktu pertama order mencapai kondisi tertentu menurut log OCS. */
function firstLogAt(logs: OcsLog[], pred: (code: number) => boolean): Date | null {
  let best: Date | null = null;
  for (const l of logs) {
    const c = Number(l.NewStatusCode);
    if (!Number.isFinite(c) || !pred(c)) continue;
    const d = toDate(l.CreatedAt);
    if (d && (!best || d < best)) best = d;
  }
  return best;
}

/**
 * Turunkan penyelesaian Order ID dari status OCS saat ini.
 * - 90000 CANCELLED → BATAL. Waktu batal = log pertama berstatus CANCELLED
 *   (cadangan: IN CANCEL, lalu UpdatedAt order).
 * - kode ≥ batas terproses (bawaan MANIFESTED 20030) → TERPROSES. Termasuk
 *   IN TRANSIT, DELIVERED, COMPLETED, dan RETURN (barang sudah sempat dikirim).
 * - selain itu (termasuk IN CANCEL yang belum final) → masih OPEN.
 */
export function classifyOcs(
  statusCode: number | null | undefined,
  logs: OcsLog[] | null | undefined,
  updatedAt: string | null | undefined,
  processedMinCode = DEFAULT_PROCESSED_MIN_CODE,
): Classified {
  const L = logs ?? [];
  const code = Number(statusCode);
  if (!Number.isFinite(code)) return { resolution: 'OPEN', processedAt: null, cancelledAt: null };
  if (isCancelledCode(code)) {
    const at = firstLogAt(L, isCancelledCode) ?? firstLogAt(L, (c) => c === IN_CANCEL_CODE) ?? toDate(updatedAt);
    return { resolution: 'CANCELLED', processedAt: null, cancelledAt: at };
  }
  if (code !== IN_CANCEL_CODE && code >= processedMinCode) {
    const at = firstLogAt(L, (c) => c >= processedMinCode && !isCancelledCode(c) && c !== IN_CANCEL_CODE) ?? toDate(updatedAt);
    return { resolution: 'PROCESSED', processedAt: at, cancelledAt: null };
  }
  return { resolution: 'OPEN', processedAt: null, cancelledAt: null };
}

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  OPEN: 'Masih pending',
  PROCESSED: 'Terproses',
  CANCELLED: 'Batal',
};
