// Util murni seputar baris pending: parsing tempel massal, clearance, label.

/**
 * Clearance sale — prefiks `CS-` di mana pun ia muncul (aturan yang sama dengan
 * doi-monitor `adalahClearance`): SKU OCS kadang berawalan kotor seperti "- " atau "90 ".
 */
export const isClearanceSku = (sku: string) => /(^|[^A-Za-z0-9])CS-/i.test(String(sku ?? ''));

/** Normalisasi input: buang spasi tepi, rapikan spasi ganda. SKU tetap apa adanya (case dipertahankan). */
export function cleanOrderId(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').trim();
}
export function cleanSku(s: unknown): string {
  return String(s ?? '').trim().replace(/\s{2,}/g, ' ');
}

export type BulkLine = { line: number; orderId: string; sku: string; qty: number; error?: string };

/**
 * Tempel dari Excel/Sheet: tiap baris "OrderID <pemisah> SKU <pemisah> Qty".
 * Pemisah: TAB, titik koma, koma, atau |. Baris judul (mengandung "order") dilewati.
 * Qty kosong → 1.
 */
export function parseBulk(text: string): BulkLine[] {
  const out: BulkLine[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = (line.includes('\t') ? line.split('\t') : line.split(/[;|,]/)).map((p) => p.trim());
    if (i === 0 && /order/i.test(parts[0] ?? '') && !/\d{6,}/.test(parts[0] ?? '')) return; // header
    const orderId = cleanOrderId(parts[0]);
    const sku = cleanSku(parts[1]);
    const qtyRaw = (parts[2] ?? '').replace(/[^\d-]/g, '');
    const qty = qtyRaw === '' ? 1 : parseInt(qtyRaw, 10);
    let error: string | undefined;
    if (!orderId) error = 'Order ID kosong';
    else if (orderId.length > 64) error = 'Order ID terlalu panjang';
    else if (!sku) error = 'SKU kosong';
    else if (!Number.isFinite(qty) || qty < 1) error = 'Jumlah harus ≥ 1';
    else if (qty > 100000) error = 'Jumlah tidak wajar';
    out.push({ line: i + 1, orderId, sku, qty: Number.isFinite(qty) ? qty : 0, error });
  });
  return out;
}

/** Gabungkan baris dobel (order+SKU sama) dalam satu tempelan: qty dijumlah. */
export function mergeBulk(lines: BulkLine[]): BulkLine[] {
  const map = new Map<string, BulkLine>();
  const out: BulkLine[] = [];
  for (const l of lines) {
    if (l.error) { out.push(l); continue; }
    const k = `${l.orderId}\u0000${l.sku.toUpperCase()}`;
    const prev = map.get(k);
    if (prev) prev.qty += l.qty;
    else { const c = { ...l }; map.set(k, c); out.push(c); }
  }
  return out;
}

export type OcsSku = { sku: string; bundleSku: string | null; qty: number; name: string | null };

/** Apakah SKU yang diinput ada di isi order OCS (cocok SellerSku atau BundleSku, tanpa peduli huruf besar). */
export function skuInOcsOrder(sku: string, list: OcsSku[] | null | undefined): boolean | null {
  if (!list || !list.length) return null;
  const s = sku.trim().toUpperCase();
  return list.some((x) => x.sku?.toUpperCase() === s || (x.bundleSku ?? '').toUpperCase() === s);
}

export const PO_LABEL = { BELUM: 'Belum open PO', SUDAH: 'Sudah open PO', TIDAK_PERLU: 'Tidak perlu PO' } as const;
export const ARRIVAL_LABEL = { BELUM: 'Belum datang', SEBAGIAN: 'Datang sebagian', SUDAH: 'Sudah datang' } as const;
export const ROLE_LABEL = { ADMIN: 'Admin', FULFILLMENT: 'Fulfillment', INVENTORY: 'Inventory', VIEWER: 'Lihat saja' } as const;

export const DEFAULT_REASONS = [
  'Stok kosong',
  'Stok kurang',
  'Selisih stok / barang tidak ditemukan di rak',
  'Barang rusak / reject',
  'Menunggu barang datang dari PO',
  'Phase Out — tidak dijual lagi',
  'Clearance — tidak dijual lagi',
  'Salah mapping SKU',
  'Lainnya',
];
