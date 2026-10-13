import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canFollowUp, canWrite, isAdmin } from '@/lib/roles';
import { getSettings } from '@/lib/settings';
import { handleApiError, ValidationError } from '@/lib/validate';
import { itemInclude, toRow } from '@/server/items';
import { applyFollowUp, parseFollowUp } from '@/server/followup';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  const settings = await getSettings();
  const it = await prisma.pendingItem.findUnique({ where: { id }, include: itemInclude });
  if (!it) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
  const [siblings, logs, order] = await Promise.all([
    prisma.pendingItem.findMany({ where: { orderId: it.orderId, NOT: { id } }, select: { id: true, sku: true, qty: true } }),
    prisma.itemLog.findMany({ where: { OR: [{ itemId: id }, { orderId: it.orderId, itemId: null }] }, orderBy: { at: 'desc' }, take: 100 }),
    prisma.pendingOrder.findUnique({ where: { orderId: it.orderId }, select: { ocsSkus: true } }),
  ]);
  return Response.json({
    row: toRow(it, settings.cancelRef),
    siblings,
    ocsSkus: order?.ocsSkus ?? null,
    logs: logs.map((l: (typeof logs)[number]) => ({ id: l.id, at: l.at.toISOString(), byName: l.byName, action: l.action, detail: l.detail })),
  });
}

/**
 * Ubah item.
 * - Penginput (Fulfillment) / Admin: qty & catatan, selama order masih OPEN.
 * - Inventory / Admin: kolom tindak lanjut (alasan, PO, kedatangan).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser(canWrite);
  if (isResponse(u)) return u;
  try {
    const { id } = await ctx.params;
    const it = await prisma.pendingItem.findUnique({ where: { id }, include: { order: { select: { resolution: true } } } });
    if (!it) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    const b = await req.json();
    const settings = await getSettings();

    if (b.qty !== undefined || b.note !== undefined) {
      if (!(isAdmin(u.role) || it.inputById === u.id)) throw new ValidationError('Hanya penginput atau Admin yang bisa mengubah qty/catatan');
      const data: Record<string, unknown> = {};
      const changes: string[] = [];
      if (b.qty !== undefined) {
        const q = Math.trunc(Number(b.qty));
        if (!Number.isFinite(q) || q < 1 || q > 100000) throw new ValidationError('Jumlah pending minimal 1');
        if (q !== it.qty) { data.qty = q; changes.push(`qty ${it.qty} → ${q}`); }
      }
      if (b.note !== undefined) {
        const n = String(b.note ?? '').trim().slice(0, 500) || null;
        if (n !== it.note) { data.note = n; changes.push('catatan diubah'); }
      }
      if (changes.length) {
        await prisma.pendingItem.update({ where: { id }, data });
        await prisma.itemLog.create({ data: { itemId: id, orderId: it.orderId, byName: u.name, action: 'UBAH', detail: changes.join(', ') } });
      }
    }

    if (b.followUp) {
      if (!canFollowUp(u.role)) throw new ValidationError('Tindak lanjut hanya untuk Inventory / Admin');
      const fu = parseFollowUp(b.followUp, settings.reasons);
      const ids = [id];
      if (b.applyToSameSku) {
        const more = await prisma.pendingItem.findMany({ where: { sku: it.sku, NOT: { id }, order: { resolution: 'OPEN' } }, select: { id: true } });
        ids.push(...more.map((m: { id: string }) => m.id));
      }
      const n = await applyFollowUp(u, ids, fu);
      return Response.json({ ok: true, updated: n });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser(canWrite);
  if (isResponse(u)) return u;
  try {
    const { id } = await ctx.params;
    const it = await prisma.pendingItem.findUnique({ where: { id } });
    if (!it) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (!isAdmin(u.role)) {
      if (it.inputById !== u.id) throw new ValidationError('Hanya penginput atau Admin yang bisa menghapus');
      if (it.followUpAt) throw new ValidationError('Sudah ditindaklanjuti Inventory — minta Admin bila memang salah input');
    }
    await prisma.itemLog.create({ data: { itemId: null, orderId: it.orderId, byName: u.name, action: 'HAPUS', detail: `Baris ${it.sku} × ${it.qty} dihapus (input ${it.inputByName})` } });
    await prisma.itemLog.updateMany({ where: { itemId: id }, data: { itemId: null } });
    await prisma.pendingItem.delete({ where: { id } });
    const left = await prisma.pendingItem.count({ where: { orderId: it.orderId } });
    if (!left) {
      await prisma.itemLog.deleteMany({ where: { orderId: it.orderId } });
      await prisma.pendingOrder.delete({ where: { orderId: it.orderId } });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
