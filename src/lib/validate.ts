// Validator kecil tanpa dependensi (pengganti zod) — cukup untuk payload JSON sederhana.
export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
  }
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; required?: boolean } = {}): string {
  const { min = 0, max = 10000, required = true } = opts;
  if (v === undefined || v === null || v === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return '';
  }
  if (typeof v !== 'string') throw new ValidationError(`${field} harus teks`);
  const s = v.trim();
  if (s.length < min) throw new ValidationError(`${field} minimal ${min} karakter`);
  if (s.length > max) throw new ValidationError(`${field} maksimal ${max} karakter`);
  return s;
}

export function optStr(v: unknown, field: string, max = 10000): string | null {
  const s = str(v, field, { required: false, max });
  return s === '' ? null : s;
}

export function oneOf<T extends string>(v: unknown, field: string, values: readonly T[], fallback?: T): T {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || !values.includes(v as T)) throw new ValidationError(`${field} tidak valid`);
  return v as T;
}

export function bool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return fallback;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number; fallback?: number } = {}): number {
  if (v === undefined || v === null || v === '') {
    if (opts.fallback !== undefined) return opts.fallback;
    throw new ValidationError(`${field} wajib diisi`);
  }
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} harus angka`);
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`${field} minimal ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`${field} maksimal ${opts.max}`);
  return n;
}

export function email(v: unknown): string {
  const s = str(v, 'Email', { max: 191 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError('Format email tidak valid');
  return s;
}

export function dateOrNull(v: unknown, field: string): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} bukan tanggal valid`);
  return d;
}

/** Bungkus handler API: ValidationError → 400, error lain → 500 dengan pesan ringkas. */
export function handleApiError(e: unknown): Response {
  if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: e.status });
  const err = e as { code?: string; message?: string };
  if (err?.code === 'P2002') return Response.json({ error: 'Data duplikat (kode/email sudah dipakai)' }, { status: 409 });
  if (err?.code === 'P2025') return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
  console.error(e);
  return Response.json({ error: err?.message || 'Terjadi kesalahan server' }, { status: 500 });
}
