import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canWrite, isAdmin } from '@/lib/roles';
import { handleApiError, oneOf, ValidationError } from '@/lib/validate';
import { syncOcs } from '@/server/sync';
import { RESOLUTION_LABEL } from '@/lib/ocs-status';

export const maxDuration = 30;

/** Cek ulang satu order ke OCS sekarang. */
export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const u = await apiUser(canWrite);
  if (isResponse(u)) return u;
  const { orderId } = await ctx.params;
  const id = decodeURIComponent(orderId);
  const o = await prisma.pendingOrder.findUnique({ where: { orderId: id } });
  if (!o) return Response.json({ error: 'Order tidak ditemukan' }, { status: 404 });
  const r = await syncOcs({ trigger: 'manual', orderIds: [id], budgetMs: 20000 });
  if (!r.ok) return Response.json({ error: r.message }, { status: 502 });
  return Response.json({ ok: true, message: r.changed ? 'Status order berubah' : 'Status OCS sudah diperbarui' });
}

/**
 * Admin: kunci penyelesaian secara manual (mis. order tidak ada di OCS) atau
 * lepaskan kunci supaya kembali mengikuti OCS. {resolution, at?} | {release:true}
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  try {
    const { orderId } = await ctx.params;
    const id = decodeURIComponent(orderId);
    const o = await prisma.pendingOrder.findUnique({ where: { orderId: id } });
    if (!o) return Response.json({ error: 'Order tidak ditemukan' }, { status: 404 });
    const b = await req.json();
    if (b.release) {
      await prisma.pendingOrder.update({ where: { orderId: id }, data: { manualResolution: false, lastCheckedAt: null } });
      await prisma.itemLog.create({ data: { orderId: id, byName: u.name, action: 'RESOLUSI', detail: 'Kunci manual dilepas — kembali mengikuti status OCS' } });
      await syncOcs({ trigger: 'manual', orderIds: [id], budgetMs: 15000 }).catch(() => null);
      return Response.json({ ok: true });
    }
    const resolution = oneOf(b.resolution, 'Penyelesaian', ['OPEN', 'PROCESSED', 'CANCELLED'] as const);
    const at = b.at ? new Date(String(b.at)) : new Date();
    if (Number.isNaN(at.getTime())) throw new ValidationError('Waktu tidak valid');
    await prisma.pendingOrder.update({
      where: { orderId: id },
      data: {
        manualResolution: true, resolution,
        processedAt: resolution === 'PROCESSED' ? at : null,
        cancelledAt: resolution === 'CANCELLED' ? at : null,
      },
    });
    await prisma.itemLog.create({ data: { orderId: id, byName: u.name, action: 'RESOLUSI', detail: `Ditetapkan manual: ${RESOLUTION_LABEL[resolution]}${b.note ? ` — ${String(b.note).slice(0, 200)}` : ''}` } });
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
