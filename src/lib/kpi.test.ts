import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, monthKeyWib, monthsBetween, cancelBucket, monthStartUtc, monthEndUtc, shiftMonth, type KpiOrder } from './kpi';
import { classifyOcs } from './ocs-status';
import { parseBulk, mergeBulk, isClearanceSku, skuInOcsOrder } from './items';

const d = (s: string) => new Date(s);

test('bulan dihitung menurut WIB', () => {
  // 31 Okt 18:00 UTC = 1 Nov 01:00 WIB
  assert.equal(monthKeyWib(d('2026-10-31T18:00:00Z')), '2026-11');
  assert.equal(monthKeyWib(d('2026-10-31T16:59:59Z')), '2026-10');
  assert.equal(monthStartUtc('2026-11').toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(monthEndUtc('2026-12').toISOString(), '2026-12-31T17:00:00.000Z');
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('kategori batal: ≤24 jam, 24–48 jam, >48 jam', () => {
  const s = d('2026-10-01T00:00:00Z');
  assert.equal(cancelBucket(s, d('2026-10-01T23:59:00Z')), 'LE1');
  assert.equal(cancelBucket(s, d('2026-10-02T00:00:00Z')), 'LE1');
  assert.equal(cancelBucket(s, d('2026-10-02T00:01:00Z')), 'D2');
  assert.equal(cancelBucket(s, d('2026-10-03T00:00:00Z')), 'D2');
  assert.equal(cancelBucket(s, d('2026-10-03T00:01:00Z')), 'GT2');
});

test('rekap per bulan menghitung Order ID sekali dan memecah batal', () => {
  const base = { orderCreatedAt: null, processedAt: null, cancelledAt: null } as const;
  const orders: KpiOrder[] = [
    { ...base, orderId: 'A', firstPendingAt: d('2026-10-01T03:00:00Z'), resolution: 'PROCESSED', processedAt: d('2026-10-01T09:00:00Z') },
    { ...base, orderId: 'B', firstPendingAt: d('2026-10-02T03:00:00Z'), resolution: 'CANCELLED', cancelledAt: d('2026-10-02T05:00:00Z') },
    { ...base, orderId: 'C', firstPendingAt: d('2026-10-03T03:00:00Z'), resolution: 'CANCELLED', cancelledAt: d('2026-10-04T15:00:00Z') },
    { ...base, orderId: 'D', firstPendingAt: d('2026-10-04T03:00:00Z'), resolution: 'CANCELLED', cancelledAt: d('2026-10-09T03:00:00Z') },
    { ...base, orderId: 'E', firstPendingAt: d('2026-10-05T03:00:00Z'), resolution: 'OPEN' },
    { ...base, orderId: 'F', firstPendingAt: d('2026-09-30T18:00:00Z'), resolution: 'OPEN' }, // = 1 Okt WIB
    { ...base, orderId: 'G', firstPendingAt: d('2026-11-02T03:00:00Z'), resolution: 'PROCESSED', processedAt: d('2026-11-02T05:00:00Z') },
    { ...base, orderId: 'H', firstPendingAt: d('2026-08-02T03:00:00Z'), resolution: 'PROCESSED' }, // di luar rentang
  ];
  const { rows, total } = summarize(orders, ['2026-10', '2026-11'], 'INPUT');
  const okt = rows[0]!;
  assert.equal(okt.total, 6);
  assert.equal(okt.processed, 1);
  assert.equal(okt.cancelled, 3);
  assert.equal(okt.open, 2);
  assert.deepEqual(okt.buckets, { LE1: 1, D2: 1, GT2: 1 });
  assert.equal(okt.avgHoursToProcess, 6);
  assert.equal(rows[1]!.total, 1);
  assert.equal(total.total, 7);
  assert.equal(total.processed, 2);
  assert.equal(Math.round(total.pctCancelled), 43);
});

test('acuan ORDER memakai tanggal order marketplace', () => {
  const o: KpiOrder = { orderId: 'X', firstPendingAt: d('2026-10-03T00:00:00Z'), orderCreatedAt: d('2026-10-01T00:00:00Z'), resolution: 'CANCELLED', processedAt: null, cancelledAt: d('2026-10-03T12:00:00Z') };
  assert.deepEqual(summarize([o], ['2026-10'], 'INPUT').rows[0]!.buckets, { LE1: 1, D2: 0, GT2: 0 });
  assert.deepEqual(summarize([o], ['2026-10'], 'ORDER').rows[0]!.buckets, { LE1: 0, D2: 0, GT2: 1 });
});

test('klasifikasi status OCS', () => {
  const logs = [
    { CreatedAt: '2026-10-11T04:26:21Z', NewStatusCode: 20000 },
    { CreatedAt: '2026-10-11T11:17:40Z', NewStatusCode: 20022 },
    { CreatedAt: '2026-10-11T13:53:22Z', NewStatusCode: 20030 },
  ];
  const p = classifyOcs(20030, logs, '2026-10-13T02:17:52Z');
  assert.equal(p.resolution, 'PROCESSED');
  assert.equal(p.processedAt?.toISOString(), '2026-10-11T13:53:22.000Z');
  assert.equal(classifyOcs(20022, logs, null).resolution, 'OPEN');
  assert.equal(classifyOcs(20022, logs, null, 20022).resolution, 'PROCESSED');
  assert.equal(classifyOcs(50000, [], '2026-10-12T00:00:00Z').processedAt?.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(classifyOcs(11000, [], null).resolution, 'OPEN');
  const c = classifyOcs(90000, [...logs.slice(0, 2), { CreatedAt: '2026-10-12T01:00:00Z', NewStatusCode: 11000 }, { CreatedAt: '2026-10-12T02:00:00Z', NewStatusCode: 90000 }], null);
  assert.equal(c.resolution, 'CANCELLED');
  assert.equal(c.cancelledAt?.toISOString(), '2026-10-12T02:00:00.000Z');
  assert.equal(classifyOcs(null, [], null).resolution, 'OPEN');
  assert.equal(classifyOcs(11100, [{ CreatedAt: '2026-10-12T03:00:00Z', NewStatusCode: 11100 }], null).resolution, 'CANCELLED');
});

test('tempel massal dari Excel', () => {
  const rows = parseBulk('Order ID\tSKU\tQty\n2704148346952818\tSERUM-VITAMIN-C\t2\n 123456789 ; ACNE-CLEANSER ; \n999,,3\n555|X|0');
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { line: 2, orderId: '2704148346952818', sku: 'SERUM-VITAMIN-C', qty: 2, error: undefined });
  assert.equal(rows[1]!.qty, 1);
  assert.equal(rows[2]!.error, 'SKU kosong');
  assert.equal(rows[3]!.error, 'Jumlah harus ≥ 1');
  const merged = mergeBulk(parseBulk('1\tA\t1\n1\ta\t2\n2\tA\t1'));
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.qty, 3);
});

test('clearance & cek SKU di order', () => {
  assert.equal(isClearanceSku('CS-HANASUI-LIP'), true);
  assert.equal(isClearanceSku('90 CS-FYNE'), true);
  assert.equal(isClearanceSku('FOCUS-SERUM'), false);
  const list = [{ sku: 'SERUM-VITAMIN-C', bundleSku: 'BDL-HANASUI-0000000539', qty: 1, name: null }];
  assert.equal(skuInOcsOrder('serum-vitamin-c', list), true);
  assert.equal(skuInOcsOrder('BDL-HANASUI-0000000539', list), true);
  assert.equal(skuInOcsOrder('LAIN', list), false);
  assert.equal(skuInOcsOrder('LAIN', []), null);
});
