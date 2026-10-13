import 'server-only';
import { prisma } from '@/lib/prisma';
import { monthStartUtc, monthEndUtc, monthsBetween, summarize, type CancelRef, type MonthRow } from '@/lib/kpi';

export type Breakdown = { key: string; label: string; orders: number; items: number; qty: number };

export type KpiData = {
  months: string[];
  rows: MonthRow[];
  total: MonthRow;
  reasons: Breakdown[];
  categories: Breakdown[];
  po: Breakdown[];
  arrival: Breakdown[];
  areas: Array<{ area: string; total: number; processed: number; cancelled: number; open: number }>;
  aging: Array<{ key: string; label: string; orders: number }>;
  topSkus: Array<{ sku: string; orders: number; qty: number; open: number; isPhaseOut: boolean; isClearance: boolean }>;
};

function bump(map: Map<string, Breakdown>, key: string, label: string, orderId: string, qty: number, seen: Map<string, Set<string>>) {
  const b = map.get(key) ?? { key, label, orders: 0, items: 0, qty: 0 };
  b.items++;
  b.qty += qty;
  const s = seen.get(key) ?? new Set<string>();
  if (!s.has(orderId)) { s.add(orderId); b.orders++; }
  seen.set(key, s);
  map.set(key, b);
}

export async function kpiData(fromMonth: string, toMonth: string, ref: CancelRef): Promise<KpiData> {
  const months = monthsBetween(fromMonth, toMonth);
  const from = monthStartUtc(months[0]!);
  const to = monthEndUtc(months[months.length - 1]!);
  const orders = await prisma.pendingOrder.findMany({
    where: { firstPendingAt: { gte: from, lt: to } },
    select: {
      orderId: true, firstPendingAt: true, orderCreatedAt: true, resolution: true, processedAt: true, cancelledAt: true, area: true,
      items: { select: { sku: true, qty: true, reason: true, isPhaseOut: true, isClearance: true, poStatus: true, arrivalStatus: true } },
    },
  });
  const { rows, total } = summarize(orders, months, ref);

  const reasons = new Map<string, Breakdown>(), cats = new Map<string, Breakdown>(), po = new Map<string, Breakdown>(), arr = new Map<string, Breakdown>();
  const sR = new Map<string, Set<string>>(), sC = new Map<string, Set<string>>(), sP = new Map<string, Set<string>>(), sA = new Map<string, Set<string>>();
  const areas = new Map<string, { area: string; total: number; processed: number; cancelled: number; open: number }>();
  const skus = new Map<string, { sku: string; orders: Set<string>; qty: number; open: number; isPhaseOut: boolean; isClearance: boolean }>();
  const aging = [
    { key: 'a1', label: '≤ 1 hari', orders: 0 },
    { key: 'a2', label: '1–2 hari', orders: 0 },
    { key: 'a3', label: '2–7 hari', orders: 0 },
    { key: 'a4', label: '> 7 hari', orders: 0 },
  ];
  const now = Date.now();
  for (const o of orders) {
    const a = o.area || 'Belum diketahui';
    const ar = areas.get(a) ?? { area: a, total: 0, processed: 0, cancelled: 0, open: 0 };
    ar.total++;
    if (o.resolution === 'PROCESSED') ar.processed++; else if (o.resolution === 'CANCELLED') ar.cancelled++; else ar.open++;
    areas.set(a, ar);
    if (o.resolution === 'OPEN') {
      const d = (now - o.firstPendingAt.getTime()) / 86400000;
      aging[d <= 1 ? 0 : d <= 2 ? 1 : d <= 7 ? 2 : 3]!.orders++;
    }
    for (const it of o.items) {
      bump(reasons, it.reason ?? '', it.reason ?? 'Belum diisi Inventory', o.orderId, it.qty, sR);
      const cat = it.isPhaseOut ? 'PHASE_OUT' : it.isClearance ? 'CLEARANCE' : 'AKTIF';
      bump(cats, cat, cat === 'PHASE_OUT' ? 'Phase Out' : cat === 'CLEARANCE' ? 'Clearance' : 'Masih dijual', o.orderId, it.qty, sC);
      bump(po, it.poStatus, it.poStatus === 'SUDAH' ? 'Sudah open PO' : it.poStatus === 'TIDAK_PERLU' ? 'Tidak perlu PO' : 'Belum open PO', o.orderId, it.qty, sP);
      if (it.poStatus === 'SUDAH') bump(arr, it.arrivalStatus, it.arrivalStatus === 'SUDAH' ? 'Sudah datang' : it.arrivalStatus === 'SEBAGIAN' ? 'Datang sebagian' : 'Belum datang', o.orderId, it.qty, sA);
      const k = it.sku.toUpperCase();
      const s = skus.get(k) ?? { sku: it.sku, orders: new Set<string>(), qty: 0, open: 0, isPhaseOut: it.isPhaseOut, isClearance: it.isClearance };
      s.orders.add(o.orderId);
      s.qty += it.qty;
      if (o.resolution === 'OPEN') s.open += it.qty;
      skus.set(k, s);
    }
  }
  const sortB = (m: Map<string, Breakdown>) => [...m.values()].sort((x, y) => y.orders - x.orders || y.qty - x.qty);
  return {
    months, rows, total,
    reasons: sortB(reasons),
    categories: sortB(cats),
    po: sortB(po),
    arrival: sortB(arr),
    areas: [...areas.values()].sort((x, y) => y.total - x.total),
    aging,
    topSkus: [...skus.values()].map((s) => ({ ...s, orders: s.orders.size })).sort((x, y) => y.orders - x.orders || y.qty - x.qty).slice(0, 15),
  };
}

export type SkuSummaryRow = {
  sku: string; orders: number; items: number; qty: number; oldestInputAt: string;
  isPhaseOut: boolean; phaseOutInfo: string | null; isClearance: boolean;
  reasons: string; po: { BELUM: number; SUDAH: number; TIDAK_PERLU: number }; poNumbers: string; nearestEta: string | null;
  arrived: number; noFollowUp: number;
};

/** Rekap SKU dari item yang ordernya masih OPEN — dasar Inventory membuka PO. */
export async function skuSummary(): Promise<SkuSummaryRow[]> {
  const items = await prisma.pendingItem.findMany({
    where: { order: { resolution: 'OPEN' } },
    select: { sku: true, orderId: true, qty: true, inputAt: true, isPhaseOut: true, phaseOutInfo: true, isClearance: true, reason: true, poStatus: true, poNumber: true, poEta: true, arrivalStatus: true, followUpAt: true },
  });
  const map = new Map<string, SkuSummaryRow & { _orders: Set<string>; _reasons: Set<string>; _po: Set<string> }>();
  for (const it of items) {
    const k = it.sku.toUpperCase();
    let r = map.get(k);
    if (!r) {
      r = { sku: it.sku, orders: 0, items: 0, qty: 0, oldestInputAt: it.inputAt.toISOString(), isPhaseOut: it.isPhaseOut, phaseOutInfo: it.phaseOutInfo, isClearance: it.isClearance, reasons: '', po: { BELUM: 0, SUDAH: 0, TIDAK_PERLU: 0 }, poNumbers: '', nearestEta: null, arrived: 0, noFollowUp: 0, _orders: new Set(), _reasons: new Set(), _po: new Set() };
      map.set(k, r);
    }
    r._orders.add(it.orderId);
    r.items++;
    r.qty += it.qty;
    if (it.inputAt.toISOString() < r.oldestInputAt) r.oldestInputAt = it.inputAt.toISOString();
    if (it.reason) r._reasons.add(it.reason);
    r.po[it.poStatus as 'BELUM' | 'SUDAH' | 'TIDAK_PERLU']++;
    if (it.poNumber) r._po.add(it.poNumber);
    if (it.poEta && (!r.nearestEta || it.poEta.toISOString() < r.nearestEta)) r.nearestEta = it.poEta.toISOString();
    if (it.arrivalStatus !== 'BELUM') r.arrived++;
    if (!it.followUpAt) r.noFollowUp++;
  }
  return [...map.values()]
    .map(({ _orders, _reasons, _po, ...r }) => ({ ...r, orders: _orders.size, reasons: [..._reasons].join(', '), poNumbers: [..._po].join(', ') }))
    .sort((a, b) => b.orders - a.orders || b.qty - a.qty);
}
