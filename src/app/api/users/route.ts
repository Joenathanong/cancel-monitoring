import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { isAdmin } from '@/lib/roles';
import { bool, handleApiError, oneOf, str, ValidationError } from '@/lib/validate';
import { ROLES, parseUsername } from '@/lib/users';

export async function GET() {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  const rows = await prisma.user.findMany({
    orderBy: [{ name: 'asc' }],
    select: { id: true, username: true, name: true, role: true, isLead: true, active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true },
  });
  return Response.json({ rows });
}

export async function POST(req: Request) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  try {
    const b = await req.json();
    const username = parseUsername(b.username);
    const name = str(b.name, 'Nama', { min: 2, max: 120 });
    const role = oneOf(b.role, 'Peran', ROLES, 'FULFILLMENT');
    const password = str(b.password, 'Password', { max: 200 });
    const weak = validatePasswordStrength(password);
    if (weak) throw new ValidationError(weak);
    const row = await prisma.user.create({
      data: { username, name, role, isLead: bool(b.isLead, false), passwordHash: hashPassword(password), mustChangePassword: bool(b.mustChangePassword, true) },
      select: { id: true, username: true, name: true, role: true },
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
