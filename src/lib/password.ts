// scrypt dari node:crypto — tanpa dependensi native (bcrypt/argon2) yang
// kadang gagal dikompilasi saat npm install di Windows.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384, r = 8, p = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, n, rr, pp, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, salt, expected.length, { N: Number(n), r: Number(rr), p: Number(pp) });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return 'Password minimal 8 karakter';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password harus mengandung huruf dan angka';
  return null;
}
