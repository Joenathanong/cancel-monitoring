import { str, ValidationError } from './validate';

export const ROLES = ['ADMIN', 'FULFILLMENT', 'INVENTORY', 'VIEWER'] as const;

export function parseUsername(v: unknown): string {
  const s = str(v, 'Username', { min: 3, max: 64 }).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(s)) throw new ValidationError('Username hanya huruf kecil, angka, titik, minus, garis bawah');
  return s;
}
