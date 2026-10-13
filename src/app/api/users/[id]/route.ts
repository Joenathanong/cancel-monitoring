import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { isAdmin } from '@/lib/roles';
import { bool, handleApiError, oneOf, str, ValidationError } from '@/lib/validate';
import { ROLES, parseUsername } from '@/lib/users';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  try {
    const { id } = await ctx.params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return Response.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });
    const b = await req.json();
    const data: Record<string, unknown> = {};
    if (b.username !== undefined) data.username = parseUsername(b.username);
    if (b.name !== undefined) data.name = str(b.name, 'Nama', { min: 2, max: 120 });
    if (b.role !== undefined) data.role = oneOf(b.role, 'Peran', ROLES);
    if (b.isLead !== undefined) data.isLead = bool(b.isLead, false);
    if (b.active !== undefined) {
      data.active = bool(b.active, true);
      if (!data.active && id === u.id) throw new ValidationError('Tidak bisa menonaktifkan akun sendiri');
    }
    if (b.password) {
      const weak = validatePasswordStrength(String(b.password));
      if (weak) throw new ValidationError(weak);
      data.passwordHash = hashPassword(String(b.password));
      data.mustChangePassword = true;
      data.sessionVersion = { increment: 1 };
    }
    if (data.role && data.role !== 'ADMIN' && id === u.id) throw new ValidationError('Tidak bisa menurunkan peran akun sendiri');
    if (data.role && data.role !== target.role) data.sessionVersion = { increment: 1 };
    await prisma.user.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  try {
    const { id } = await ctx.params;
    if (id === u.id) throw new ValidationError('Tidak bisa menghapus akun sendiri');
    const used = await prisma.pendingItem.count({ where: { OR: [{ inputById: id }, { followUpById: id }] } });
    if (used) throw new ValidationError('Pengguna punya riwayat input/tindak lanjut — nonaktifkan saja, jangan dihapus');
    await prisma.user.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
