import 'server-only';
import { prisma } from '@/lib/prisma';
import { itemInclude, toRow, type ItemRow } from './items';
import type { CancelRef } from '@/lib/kpi';

export type ItemFilter = {
  status?: string | null;   // OPEN | PROCESSED | CANCELLED | ALL
  from?: string | null;     // YYYY-MM-DD (WIB, tanggal input)
  to?: string | null;
  mine?: string | null;     // user id
  sku?: string | null;
  orderId?: string | null;
  q?: string | null;
};

const WIB = 7 * 3600 * 1000;
export function dayStartUtc(day: string) { const [y, m, d] = day.split('-').map(Number) as [number, number, number]; return new Date(Date.UTC(y, m - 1, d) - WIB); }
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function buildWhere(f: ItemFilter) {
  const where: Record<string, unknown> = {};
  const order: Record<string, unknown> = {};
  if (f.status && f.status !== 'ALL' && ['OPEN', 'PROCESSED', 'CANCELLED'].includes(f.status)) order.resolution = f.status;
  if (Object.keys(order).length) where.order = order;
  const inputAt: Record<string, Date> = {};
  if (isDay(f.from)) inputAt.gte = dayStartUtc(f.from);
  if (isDay(f.to)) inputAt.lt = new Date(dayStartUtc(f.to).getTime() + 86400000);
  if (Object.keys(inputAt).length) where.inputAt = inputAt;
  if (f.mine) where.inputById = f.mine;
  if (f.sku) where.sku = f.sku;
  if (f.orderId) where.orderId = f.orderId;
  if (f.q) where.OR = [{ orderId: { contains: f.q } }, { sku: { contains: f.q } }];
  return where;
}

export async function listItems(f: ItemFilter, ref: CancelRef, take = 5000): Promise<ItemRow[]> {
  const rows = await prisma.pendingItem.findMany({ where: buildWhere(f), include: itemInclude, orderBy: { inputAt: 'desc' }, take });
  return rows.map((r: (typeof rows)[number]) => toRow(r, ref));
}
