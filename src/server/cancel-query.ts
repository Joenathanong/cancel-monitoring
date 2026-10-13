import 'server-only';
import { prisma } from '@/lib/prisma';
import { cancelSettingsOf, type Settings } from '@/lib/settings';
import { classifyCancel, type CancelResult, type Review, type Stage, type Team, type Verdict } from '@/lib/cancel';
import { dayKeyWib } from '@/lib/kpi';

const WIB = 7 * 3600 * 1000;
export const dayStart = (day: string) => { const [y, m, d] = day.split('-').map(Number) as [number, number, number]; return new Date(Date.UTC(y, m - 1, d) - WIB); };

export type CancelFilter = { from: string; to: string; area?: string | null; platform?: string | null; shop?: string | null };

export type CancelRow = {
  orderId: string; platform: string | null; shopName: string | null; area: string | null; orderType: string | null; isInstant: boolean;
  productName: string | null; totalQty: number | null;
  orderCreatedAt: string; readyAt: string | null; cancelledAt: string | null; ocsUpdatedAt: string;
  lastStatusBeforeCancel: string | null; maxCodeBeforeCancel: number | null;
  picklistNo: string | null; pickerId: string | null; packerId: string | null; detailError: string | null;
  inPendingKiriman: boolean;
  reviewStatus: Review; reviewTeam: Team | null; reviewReason: string | null; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null;
} & CancelResult;

type Count = { key: string; label: string; n: number };

export type CancelDashboard = {
  filter: CancelFilter;
  totals: { orders: number | null; cancelled: number; fault: number; faultValid: number; excluded: number; unreviewed: number; unchecked: number; quick: number; shipped: number; notReady: number; fulfillment: number; inventory: number };
  days: Array<{ day: string; orders: number | null; cancelled: number; fulfillment: number; inventory: number; excluded: number }>;
  stages: Count[]; areas: Count[]; platforms: Count[]; shops: Count[]; hours: Count[]; pickers: Count[]; packers: Count[];
  rows: CancelRow[];
  options: { areas: string[]; platforms: string[]; shops: string[] };
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function bump(m: Map<string, Count>, key: string, label = key) {
  const c = m.get(key) ?? { key, label, n: 0 };
  c.n++;
  m.set(key, c);
}
const top = (m: Map<string, Count>, n = 12) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);

export async function cancelDashboard(f: CancelFilter, s: Settings): Promise<CancelDashboard> {
  const cs = cancelSettingsOf(s);
  const minSla = Math.min(cs.slaHours, cs.slaInstantHours);
  const a = dayStart(f.from), b = new Date(dayStart(f.to).getTime() + 86400000);
  const base: Record<string, unknown> = { orderCreatedAt: { gte: a, lt: b } };
  if (f.area) base.area = f.area;
  if (f.platform) base.platform = f.platform;
  if (f.shop) base.shopName = f.shop;

  const [cancelled, quickBySql, raw, dailies, opts] = await Promise.all([
    prisma.cancelOrder.count({ where: base }),
    prisma.cancelOrder.count({ where: { ...base, calendarHours: { lt: minSla } } }),
    prisma.cancelOrder.findMany({ where: { ...base, calendarHours: { gte: minSla } }, orderBy: { orderCreatedAt: 'desc' }, take: 20000 }),
    prisma.cancelDaily.findMany({ where: { day: { gte: f.from, lte: f.to } } }),
    prisma.cancelOrder.findMany({ where: { orderCreatedAt: { gte: a, lt: b } }, select: { area: true, platform: true, shopName: true }, distinct: ['area', 'platform', 'shopName'] }),
  ]);

  // Order yang juga tercatat di Pending Kiriman → atribusi Inventory
  const ids = raw.map((r: { orderId: string }) => r.orderId);
  const pend = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const got = await prisma.pendingOrder.findMany({ where: { orderId: { in: ids.slice(i, i + 1000) } }, select: { orderId: true } });
    for (const g of got) pend.add(g.orderId);
  }

  const totals = { orders: null as number | null, cancelled, fault: 0, faultValid: 0, excluded: 0, unreviewed: 0, unchecked: 0, quick: quickBySql, shipped: 0, notReady: 0, fulfillment: 0, inventory: 0 };
  const dayMap = new Map<string, CancelDashboard['days'][number]>();
  for (let t = a.getTime(); t < b.getTime(); t += 86400000) {
    const k = dayKeyWib(new Date(t));
    dayMap.set(k, { day: k, orders: null, cancelled: 0, fulfillment: 0, inventory: 0, excluded: 0 });
  }
  const noFilter = !f.area && !f.platform && !f.shop;
  for (const d of dailies) {
    const x = dayMap.get(d.day);
    if (x) { x.orders = noFilter ? d.totalOrders : null; x.cancelled = d.cancelled; }
  }
  if (noFilter && dailies.length === dayMap.size) totals.orders = dailies.reduce((n: number, d: { totalOrders: number }) => n + d.totalOrders, 0);
  if (!noFilter) {
    // dengan saringan, jumlah cancel per hari dihitung dari data sendiri
    for (const x of dayMap.values()) x.cancelled = 0;
  }

  const stages = new Map<string, Count>(), areas = new Map<string, Count>(), platforms = new Map<string, Count>(), shops = new Map<string, Count>(), hours = new Map<string, Count>(), pickers = new Map<string, Count>(), packers = new Map<string, Count>();
  const rows: CancelRow[] = [];
  for (const r of raw) {
    const res = classifyCancel({ ...r, inPendingKiriman: pend.has(r.orderId), reviewTeam: r.reviewTeam }, cs);
    if (res.verdict === 'WAJAR_CEPAT') totals.quick++;
    else if (res.verdict === 'WAJAR_SUDAH_KIRIM') totals.shipped++;
    else if (res.verdict === 'WAJAR_BELUM_SIAP') totals.notReady++;
    else if (res.verdict === 'BELUM_DICEK') totals.unchecked++;
    const day = dayMap.get(dayKeyWib(r.orderCreatedAt));
    if (res.verdict === 'KESALAHAN') {
      totals.fault++;
      if (r.reviewStatus === 'BUKAN_GUDANG') { totals.excluded++; if (day) day.excluded++; }
      else {
        if (r.reviewStatus === 'VALID') totals.faultValid++; else totals.unreviewed++;
        if (res.team === 'FULFILLMENT') { totals.fulfillment++; if (day) day.fulfillment++; } else { totals.inventory++; if (day) day.inventory++; }
        bump(stages, res.stage!, res.stage!);
        bump(areas, r.area ?? '—');
        bump(platforms, r.platform ?? '—');
        bump(shops, r.shopName ?? '—');
        const h = new Date((r.readyAt ?? r.orderCreatedAt).getTime() + WIB).getUTCHours();
        bump(hours, String(h).padStart(2, '0'), `${String(h).padStart(2, '0')}:00`);
        if (res.team === 'FULFILLMENT') {
          if (r.pickerId) bump(pickers, r.pickerId);
          if (r.packerId) bump(packers, r.packerId);
        }
      }
    }
    if (res.verdict === 'KESALAHAN' || res.verdict === 'BELUM_DICEK') {
      rows.push({
        orderId: r.orderId, platform: r.platform, shopName: r.shopName, area: r.area, orderType: r.orderType, isInstant: r.isInstant,
        productName: r.productName, totalQty: r.totalQty,
        orderCreatedAt: iso(r.orderCreatedAt)!, readyAt: iso(r.readyAt), cancelledAt: iso(r.cancelledAt), ocsUpdatedAt: iso(r.ocsUpdatedAt)!,
        lastStatusBeforeCancel: r.lastStatusBeforeCancel, maxCodeBeforeCancel: r.maxCodeBeforeCancel,
        picklistNo: r.picklistNo, pickerId: r.pickerId, packerId: r.packerId, detailError: r.detailError,
        inPendingKiriman: pend.has(r.orderId),
        reviewStatus: r.reviewStatus, reviewTeam: r.reviewTeam, reviewReason: r.reviewReason, reviewNote: r.reviewNote, reviewedBy: r.reviewedBy, reviewedAt: iso(r.reviewedAt),
        ...res,
      });
    }
  }
  if (!noFilter) {
    const all = await prisma.cancelOrder.findMany({ where: base, select: { orderCreatedAt: true } });
    for (const x of all) { const d = dayMap.get(dayKeyWib(x.orderCreatedAt)); if (d) d.cancelled++; }
  }
  const hourList = [...hours.values()].sort((x, y) => x.key.localeCompare(y.key));
  type O = { area: string | null; platform: string | null; shopName: string | null };
  const uniq = (k: keyof O) => [...new Set((opts as O[]).map((o) => o[k]).filter(Boolean) as string[])].sort();
  return {
    filter: f, totals,
    days: [...dayMap.values()],
    stages: top(stages), areas: top(areas), platforms: top(platforms), shops: top(shops), hours: hourList, pickers: top(pickers, 10), packers: top(packers, 10),
    rows,
    options: { areas: uniq('area'), platforms: uniq('platform'), shops: uniq('shopName') },
  };
}

export type { Verdict, Stage, Team };
