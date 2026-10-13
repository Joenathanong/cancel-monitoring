import 'server-only';
import { prisma } from '@/lib/prisma';
import type { CurrentUser } from '@/lib/auth';
import { ValidationError } from '@/lib/validate';
import { PO_LABEL, ARRIVAL_LABEL } from '@/lib/items';

export type FollowUp = Partial<{
  reason: string | null; reasonNote: string | null;
  poStatus: 'BELUM' | 'SUDAH' | 'TIDAK_PERLU'; poNumber: string | null; poDate: Date | null; poEta: Date | null; poQty: number | null;
  arrivalStatus: 'BELUM' | 'SEBAGIAN' | 'SUDAH'; arrivedAt: Date | null; arrivedQty: number | null;
}>;

const WIB = 7 * 3600 * 1000;
function day(v: unknown, name: string): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(`${name} harus tanggal (YYYY-MM-DD)`);
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - WIB);
}
function qty(v: unknown, name: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ValidationError(`${name} tidak valid`);
  return n;
}
const txt = (v: unknown, max: number) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

export function parseFollowUp(b: Record<string, unknown>, reasons: string[]): FollowUp {
  const f: FollowUp = {};
  if ('reason' in b) {
    const r = txt(b.reason, 120);
    if (r && !reasons.includes(r)) throw new ValidationError('Alasan tidak ada di daftar — tambahkan dulu di Pengaturan');
    f.reason = r;
  }
  if ('reasonNote' in b) f.reasonNote = txt(b.reasonNote, 2000);
  if ('poStatus' in b) {
    if (!['BELUM', 'SUDAH', 'TIDAK_PERLU'].includes(String(b.poStatus))) throw new ValidationError('Status PO tidak valid');
    f.poStatus = b.poStatus as FollowUp['poStatus'];
  }
  if ('poNumber' in b) f.poNumber = txt(b.poNumber, 64);
  if ('poDate' in b) f.poDate = day(b.poDate, 'Tanggal PO');
  if ('poEta' in b) f.poEta = day(b.poEta, 'Estimasi datang');
  if ('poQty' in b) f.poQty = qty(b.poQty, 'Qty PO');
  if ('arrivalStatus' in b) {
    if (!['BELUM', 'SEBAGIAN', 'SUDAH'].includes(String(b.arrivalStatus))) throw new ValidationError('Status kedatangan tidak valid');
    f.arrivalStatus = b.arrivalStatus as FollowUp['arrivalStatus'];
  }
  if ('arrivedAt' in b) f.arrivedAt = day(b.arrivedAt, 'Tanggal datang');
  if ('arrivedQty' in b) f.arrivedQty = qty(b.arrivedQty, 'Qty datang');
  if (f.poStatus === 'SUDAH' && 'poNumber' in f && !f.poNumber) throw new ValidationError('Isi nomor PO ke PT Eka Jaya');
  if ((f.arrivalStatus === 'SUDAH' || f.arrivalStatus === 'SEBAGIAN') && 'arrivedAt' in f && !f.arrivedAt) throw new ValidationError('Isi tanggal barang datang');
  return f;
}

const fmtDay = (d: Date | null | undefined) => (d ? new Date(d.getTime() + WIB).toISOString().slice(0, 10) : '—');

function describe(field: keyof FollowUp, v: unknown): string {
  switch (field) {
    case 'poStatus': return PO_LABEL[v as keyof typeof PO_LABEL] ?? String(v);
    case 'arrivalStatus': return ARRIVAL_LABEL[v as keyof typeof ARRIVAL_LABEL] ?? String(v);
    case 'poDate': case 'poEta': case 'arrivedAt': return fmtDay(v as Date | null);
    default: return v === null || v === undefined || v === '' ? '—' : String(v);
  }
}
const FIELD_LABEL: Record<keyof FollowUp, string> = {
  reason: 'Alasan', reasonNote: 'Keterangan', poStatus: 'PO', poNumber: 'No. PO', poDate: 'Tgl PO', poEta: 'ETA', poQty: 'Qty PO',
  arrivalStatus: 'Kedatangan', arrivedAt: 'Tgl datang', arrivedQty: 'Qty datang',
};

/** Terapkan tindak lanjut ke beberapa item; catat perubahannya per item. */
export async function applyFollowUp(user: CurrentUser, ids: string[], f: FollowUp): Promise<number> {
  const items = await prisma.pendingItem.findMany({ where: { id: { in: ids } } });
  let n = 0;
  for (const it of items) {
    const changes: string[] = [];
    const data: Record<string, unknown> = {};
    for (const k of Object.keys(f) as (keyof FollowUp)[]) {
      const next = f[k] ?? null;
      const prev = (it as Record<string, unknown>)[k] ?? null;
      const same = next instanceof Date || prev instanceof Date
        ? (next as Date | null)?.getTime() === (prev as Date | null)?.getTime()
        : next === prev;
      if (same) continue;
      data[k] = next;
      changes.push(k === 'reasonNote' ? 'keterangan diubah' : `${FIELD_LABEL[k]}: ${describe(k, prev)} → ${describe(k, next)}`);
    }
    if (!changes.length) continue;
    data.followUpById = user.id;
    data.followUpByName = user.name;
    data.followUpAt = new Date();
    await prisma.pendingItem.update({ where: { id: it.id }, data });
    await prisma.itemLog.create({ data: { itemId: it.id, orderId: it.orderId, byName: user.name, action: 'TINDAK_LANJUT', detail: changes.join(' · ') } });
    n++;
  }
  return n;
}
