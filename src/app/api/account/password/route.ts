import { cookies } from 'next/headers';
import { apiUser, isResponse, buildSessionFor, sessionCookieOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/password';
import { handleApiError, str, ValidationError } from '@/lib/validate';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  try {
    const b = await req.json();
    const current = str(b.current, 'Password saat ini', { max: 200 });
    const next = str(b.next, 'Password baru', { max: 200 });
    const weak = validatePasswordStrength(next);
    if (weak) throw new ValidationError(weak);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!verifyPassword(current, user.passwordHash)) throw new ValidationError('Password saat ini salah');
    if (current === next) throw new ValidationError('Password baru harus berbeda');
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    // Terbitkan sesi baru (sessionVersion naik) supaya sesi ini tetap hidup, sesi lain keluar.
    const { token } = await buildSessionFor(u.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
