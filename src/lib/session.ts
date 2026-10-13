// Sesi berbasis cookie JWT (jose) — dipakai di middleware (Edge) maupun server.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'pk_session';

export type RoleName = 'ADMIN' | 'FULFILLMENT' | 'INVENTORY' | 'VIEWER';

export type SessionPayload = {
  sub: string;        // user id
  username: string;
  name: string;
  role: RoleName;
  isLead: boolean;
  mustChangePassword: boolean;
  sv: number;         // sessionVersion
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET belum diisi (minimal 16 karakter)');
  return new TextEncoder().encode(s);
}

export function sessionMaxAgeSec() {
  const days = Number(process.env.AUTH_SESSION_DAYS || 30);
  return Math.max(1, days) * 24 * 60 * 60;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAgeSec()}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
