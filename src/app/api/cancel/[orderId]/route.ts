import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canReviewCancel } from '@/lib/roles';
import { getSettings, cancelSettingsOf } from '@/lib/settings';
import { classifyCancel, REVIEW_LABEL, TEAM_LABEL } from '@/lib/cancel';
import { handleApiError, oneOf, ValidationError } from '@/lib/validate';
import { findOrder } from '@/lib/ocs-client';
import { digestFindOrder, type LogLite, type PicklistLite } from '@/lib/cancel';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const id = decodeURIComponent((await ctx.params).orderId);
  const r = await prisma.cancelOrder.findUnique({ where: { orderId: id } });
  if (!r) return Response.json({ error: 'Order tidak ditemukan' }, { status: 404 });
  const s = await getSettings();
  const pend = await prisma.pendingOrder.findUnique({ where: { orderId: id }, select: { orderId: true } });
  const res = classifyCancel({ ...r, inPendingKiriman: Boolean(pend), reviewTeam: r.reviewTeam }, cancelSettingsOf(s));
  return Response.json({ row: { ...r, inPendingKiriman: Boolean(pend), ...res }, canReview: canReviewCancel(u) });
}

/** Buka ulang log satu order dari OCS sekarang. */
export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const id = decodeURIComponent((await ctx.params).orderId);
  try {
    const info = await findOrder(id);
    if (!info.found) throw new ValidationError('Order tidak ditemukan lewat Find Order');
    const d = digestFindOrder(info.logs as LogLite[], info.picklists as PicklistLite[]);
    await prisma.cancelOrder.update({
      where: { orderId: id },
      data: {
        detailedAt: new Date(), detailError: null, readyAt: d.readyAt, cancelledAt: d.cancelledAt, maxCodeBeforeCancel: d.maxCodeBeforeCancel,
        lastStatusBeforeCancel: d.lastStatusBeforeCancel?.slice(0, 64) ?? null, hasPicklist: d.hasPicklist, picked: d.picked, packed: d.packed, pickFailed: d.pickFailed,
        picklistNo: d.picklistNo?.slice(0, 40) ?? null, pickerId: d.pickerId?.slice(0, 64) ?? null, packerId: d.packerId?.slice(0, 64) ?? null,
        ocsLogs: info.logs.map((l) => ({ at: l.CreatedAt, code: l.NewStatusCode, status: l.NewStatus })),
      },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Review lead: {reviewStatus, reviewTeam?, reviewReason?, reviewNote?} */
export async function PATCH(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  if (!canReviewCancel(u)) return Response.json({ error: 'Review hanya untuk Admin atau Lead' }, { status: 403 });
  try {
    const id = decodeURIComponent((await ctx.params).orderId);
    const b = await req.json();
    const status = oneOf(b.reviewStatus, 'Status review', ['BELUM', 'VALID', 'BUKAN_GUDANG'] as const);
    const team = b.reviewTeam ? oneOf(b.reviewTeam, 'Tim', ['FULFILLMENT', 'INVENTORY'] as const) : null;
    const reason = String(b.reviewReason ?? '').trim().slice(0, 160) || null;
    const note = String(b.reviewNote ?? '').trim().slice(0, 2000) || null;
    if (status === 'BUKAN_GUDANG' && !reason) throw new ValidationError('Isi alasan kenapa bukan kesalahan gudang');
    await prisma.cancelOrder.update({
      where: { orderId: id },
      data: status === 'BELUM'
        ? { reviewStatus: 'BELUM', reviewTeam: null, reviewReason: null, reviewNote: null, reviewedBy: null, reviewedAt: null }
        : { reviewStatus: status, reviewTeam: team, reviewReason: reason, reviewNote: note, reviewedBy: u.name, reviewedAt: new Date() },
    });
    return Response.json({ ok: true, message: `${REVIEW_LABEL[status]}${team ? ` · ${TEAM_LABEL[team]}` : ''}` });
  } catch (e) {
    return handleApiError(e);
  }
}

