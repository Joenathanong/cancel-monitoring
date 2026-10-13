import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findOrder, ocsConfigured } from '@/lib/ocs-client';
import { cleanOrderId } from '@/lib/items';
import { classifySku } from '@/server/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Pratinjau order dari OCS (Find Order) + baris pending yang sudah tercatat untuk order ini. */
export async function GET(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const orderId = cleanOrderId(new URL(req.url).searchParams.get('orderId'));
  if (!orderId) return Response.json({ error: 'Order ID kosong' }, { status: 400 });
  const existing = await prisma.pendingItem.findMany({ where: { orderId }, select: { id: true, sku: true, qty: true, inputByName: true, inputAt: true } });
  if (!ocsConfigured()) return Response.json({ configured: false, ocs: null, existing });
  try {
    const info = await findOrder(orderId);
    // Tandai golongan setiap SKU di order, supaya Fulfillment langsung tahu.
    const skus = await Promise.all(info.skus.map(async (s) => ({ ...s, ...(await classifySku(s.sku)) })));
    return Response.json({ configured: true, ocs: { ...info, skus }, existing });
  } catch (e) {
    return Response.json({ configured: true, ocs: null, error: (e as Error).message, existing });
  }
}
