import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShift, workHoursBetween, parseHm } from './workhours';
import { classifyCancel, digestFindOrder, needsDetail, type CancelInput, type CancelSettings } from './cancel';

// Jam WIB → Date UTC
const W = (s: string) => new Date(s + '+07:00');
const shift = makeShift('08:00', '23:59');

test('jam kerja 08:00–23:59 WIB', () => {
  assert.equal(parseHm('23:59', true), 1440);
  assert.equal(workHoursBetween(W('2026-10-05T09:00:00'), W('2026-10-05T13:00:00'), shift), 4);
  // order masuk 23:00, batal besok 09:00 → 1 jam (23–24) + 1 jam (08–09)
  assert.equal(workHoursBetween(W('2026-10-05T23:00:00'), W('2026-10-06T09:00:00'), shift), 2);
  // masuk 02:00 dini hari, batal 07:59 → 0 jam kerja
  assert.equal(workHoursBetween(W('2026-10-06T02:00:00'), W('2026-10-06T07:59:00'), shift), 0);
  // melintasi dua hari penuh
  assert.equal(workHoursBetween(W('2026-10-05T08:00:00'), W('2026-10-07T08:00:00'), shift), 32);
  assert.equal(workHoursBetween(W('2026-10-05T10:00:00'), W('2026-10-05T09:00:00'), shift), 0);
  assert.deepEqual(makeShift('xx', '07:00'), { startMin: 0, endMin: 1440 });
});

const S: CancelSettings = { slaHours: 4, slaInstantHours: 2, cutoff: 'MANIFESTED', shift };
const base: CancelInput = {
  isInstant: false, orderCreatedAt: W('2026-10-05T09:00:00'), ocsUpdatedAt: W('2026-10-05T15:00:00'),
  detailedAt: W('2026-10-06T00:00:00'), readyAt: W('2026-10-05T09:05:00'), cancelledAt: W('2026-10-05T14:30:00'),
  maxCodeBeforeCancel: 20016, hasPicklist: true, picked: true, packed: false, pickFailed: false, inPendingKiriman: false, reviewTeam: null,
};

test('klasifikasi cancel', () => {
  const r = classifyCancel(base, S);
  assert.equal(r.verdict, 'KESALAHAN');
  assert.equal(r.team, 'FULFILLMENT');
  assert.equal(r.stage, 'PICKED');
  // cancel cepat (24 menit) → wajar
  assert.equal(classifyCancel({ ...base, cancelledAt: W('2026-10-05T09:29:00') }, S).verdict, 'WAJAR_CEPAT');
  // sudah MANIFESTED sebelum cancel → wajar; tapi bila batas IN TRANSIT → kesalahan
  const man = { ...base, maxCodeBeforeCancel: 20030 };
  assert.equal(classifyCancel(man, S).verdict, 'WAJAR_SUDAH_KIRIM');
  assert.equal(classifyCancel(man, { ...S, cutoff: 'IN_TRANSIT' }).verdict, 'KESALAHAN');
  // instant memakai batas 2 jam
  const inst = { ...base, isInstant: true, cancelledAt: W('2026-10-05T11:30:00') };
  assert.equal(classifyCancel(inst, S).verdict, 'KESALAHAN');
  assert.equal(classifyCancel({ ...inst, isInstant: false }, S).verdict, 'WAJAR_CEPAT');
  // malam hari tidak dihitung: ready 22:30, cancel besok 10:00 → 1,5 + 2 = 3,5 jam < 4
  assert.equal(classifyCancel({ ...base, readyAt: W('2026-10-05T22:30:00'), cancelledAt: W('2026-10-06T10:00:00') }, S).verdict, 'WAJAR_CEPAT');
  // atribusi
  assert.equal(classifyCancel({ ...base, picked: false }, S).team, 'INVENTORY');
  assert.equal(classifyCancel({ ...base, picked: false, pickFailed: true }, S).stage, 'PICK_FAILED');
  assert.equal(classifyCancel({ ...base, picked: false, hasPicklist: false }, S).team, 'FULFILLMENT');
  assert.equal(classifyCancel({ ...base, inPendingKiriman: true }, S).team, 'INVENTORY');
  assert.equal(classifyCancel({ ...base, reviewTeam: 'INVENTORY' }, S).team, 'INVENTORY');
  // belum dibuka lognya
  const nd = { ...base, detailedAt: null };
  assert.equal(classifyCancel(nd, S).verdict, 'BELUM_DICEK');
  assert.equal(classifyCancel({ ...nd, ocsUpdatedAt: W('2026-10-05T10:00:00') }, S).verdict, 'WAJAR_CEPAT');
  assert.equal(needsDetail(nd, S), true);
  assert.equal(needsDetail({ ...nd, ocsUpdatedAt: W('2026-10-05T12:59:00') }, S), false);
});

test('ringkas log Find Order', () => {
  const d = digestFindOrder(
    [
      { CreatedAt: '2026-10-13T04:37:29Z', NewStatusCode: 20000, NewStatus: 'READY_TO_PROCESS' },
      { CreatedAt: '2026-10-13T04:46:02Z', NewStatusCode: 20001, NewStatus: 'PROCESSED' },
      { CreatedAt: '2026-10-13T06:10:00Z', NewStatusCode: 20013, NewStatus: 'PICKED' },
      { CreatedAt: '2026-10-13T09:00:01Z', NewStatusCode: 90000, NewStatus: 'CANCELLED' },
      { CreatedAt: '2026-10-13T09:30:00Z', NewStatusCode: 30000, NewStatus: 'IN_TRANSIT' },
    ],
    [{ PicklistNo: 'PICK-1', IsPickCompleted: true, PickerId: 'PICKER097', PackerId: '' }],
  );
  assert.equal(d.readyAt?.toISOString(), '2026-10-13T04:37:29.000Z');
  assert.equal(d.cancelledAt?.toISOString(), '2026-10-13T09:00:01.000Z');
  assert.equal(d.maxCodeBeforeCancel, 20013);
  assert.equal(d.picked, true);
  assert.equal(d.packed, false);
  assert.equal(d.pickerId, 'PICKER097');
  assert.equal(d.packerId, null);
  assert.equal(digestFindOrder([], []).hasPicklist, false);
});
