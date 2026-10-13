import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { SESSION_COOKIE, type SessionPayload, type RoleName, signSession, sessionMaxAgeSec, verifySession } from './session';

export type CurrentUser = SessionPayload & { id: string };

/** Ambil user dari cookie + verifikasi ke DB (aktif & sessionVersion cocok). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const u = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!u || !u.active || u.sessionVersion !== payload.sv) return null;
  return {
    id: u.id,
    sub: u.id,
    username: u.username,
    name: u.name,
    role: u.role as RoleName,
    isLead: u.isLead,
    mustChangePassword: u.mustChangePassword,
    sv: u.sessionVersion,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireRole(check: (r: RoleName) => boolean): Promise<CurrentUser> {
  const u = await requireUser();
  if (!check(u.role)) redirect('/dashboard?denied=1');
  return u;
}

export async function buildSessionFor(userId: string): Promise<{ token: string; payload: SessionPayload }> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const payload: SessionPayload = {
    sub: u.id,
    username: u.username,
    name: u.name,
    role: u.role as RoleName,
    isLead: u.isLead,
    mustChangePassword: u.mustChangePassword,
    sv: u.sessionVersion,
  };
  return { token: await signSession(payload), payload };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSec(),
  };
}

/** Helper API route: user, atau Response 401/403. */
export async function apiUser(check?: (r: RoleName) => boolean): Promise<CurrentUser | Response> {
  const u = await getCurrentUser();
  if (!u) return Response.json({ error: 'Belum login' }, { status: 401 });
  if (check && !check(u.role)) return Response.json({ error: 'Peran Anda tidak diizinkan untuk aksi ini' }, { status: 403 });
  return u;
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
