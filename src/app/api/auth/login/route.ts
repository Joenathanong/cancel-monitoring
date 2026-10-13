import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { buildSessionFor, sessionCookieOptions } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';
import { str, handleApiError } from '@/lib/validate';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = str(body.username, 'Username', { max: 64 }).toLowerCase();
    const password = str(body.password, 'Password', { max: 200 });

    const user = await prisma.user.findUnique({ where: { username } });
    // Pesan sama untuk username tidak ada / password salah.
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      await new Promise((r) => setTimeout(r, 300));
      return Response.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token, payload } = await buildSessionFor(user.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    return Response.json({ ok: true, mustChangePassword: payload.mustChangePassword, user: { name: payload.name, role: payload.role } });
  } catch (e) {
    return handleApiError(e);
  }
}
