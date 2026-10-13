import 'server-only';
import { prisma } from './prisma';
import { DEFAULT_REASONS } from './items';
import { DEFAULT_PROCESSED_MIN_CODE } from './ocs-status';
import type { CancelRef } from './kpi';
import type { Cutoff, CancelSettings } from './cancel';
import { makeShift } from './workhours';

export const SETTING_DEFAULTS: Record<string, string> = {
  app_name: 'Pending Kiriman IEG',
  reasons: DEFAULT_REASONS.join('\n'),
  processed_min_code: String(DEFAULT_PROCESSED_MIN_CODE),
  cancel_ref: 'INPUT',
  auto_sync_minutes: '15',
  ocs_batch: '40',
  phase_out_sync_hours: '6',
  aging_warn_days: '2',
  // ── Monitoring Cancel ──
  cancel_sla_hours: '4',
  cancel_sla_instant_hours: '2',
  cancel_cutoff: 'MANIFESTED',
  work_start: '08:00',
  work_end: '23:59',
  cancel_start_date: '2026-10-01',
  cancel_sync_minutes: '30',
  cancel_detail_batch: '80',
  cancel_rescan_days: '7',
  cancel_review_reasons: [
    'Pembeli membatalkan (sudah dikonfirmasi)',
    'Dibatalkan sistem / marketplace',
    'Masalah alamat / ekspedisi',
    'Order duplikat / fraud',
    'Kendala di luar gudang (supplier / promo)',
    'Lainnya',
  ].join('\n'),
};

export type Settings = {
  appName: string;
  reasons: string[];
  processedMinCode: number;
  cancelRef: CancelRef;
  autoSyncMinutes: number;
  ocsBatch: number;
  phaseOutSyncHours: number;
  agingWarnDays: number;
  cancelSlaHours: number;
  cancelSlaInstantHours: number;
  cancelCutoff: Cutoff;
  workStart: string;
  workEnd: string;
  cancelStartDate: string;
  cancelSyncMinutes: number;
  cancelDetailBatch: number;
  cancelRescanDays: number;
  cancelReviewReasons: string[];
};

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.keys(SETTING_DEFAULTS) } } });
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  const dec = (k: string, min: number, max: number) => { const v = parseFloat(String(map[k]).replace(',', '.')); return Math.min(max, Math.max(min, Number.isFinite(v) ? v : parseFloat(SETTING_DEFAULTS[k]!))); };
  const num = (k: string, min: number, max: number) => Math.min(max, Math.max(min, parseInt(map[k]!, 10) || parseInt(SETTING_DEFAULTS[k]!, 10)));
  return {
    appName: map.app_name!,
    reasons: map.reasons!.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    processedMinCode: num('processed_min_code', 1, 99999),
    cancelRef: map.cancel_ref === 'ORDER' ? 'ORDER' : 'INPUT',
    autoSyncMinutes: num('auto_sync_minutes', 0, 1440),
    ocsBatch: num('ocs_batch', 5, 200),
    phaseOutSyncHours: num('phase_out_sync_hours', 1, 168),
    agingWarnDays: num('aging_warn_days', 1, 60),
    cancelSlaHours: dec('cancel_sla_hours', 0.25, 240),
    cancelSlaInstantHours: dec('cancel_sla_instant_hours', 0.25, 240),
    cancelCutoff: map.cancel_cutoff === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'MANIFESTED',
    workStart: /^\d{1,2}:\d{2}$/.test(map.work_start!) ? map.work_start! : '08:00',
    workEnd: /^\d{1,2}:\d{2}$/.test(map.work_end!) ? map.work_end! : '23:59',
    cancelStartDate: /^\d{4}-\d{2}-\d{2}$/.test(map.cancel_start_date!) ? map.cancel_start_date! : '2026-10-01',
    cancelSyncMinutes: num('cancel_sync_minutes', 0, 1440),
    cancelDetailBatch: num('cancel_detail_batch', 10, 500),
    cancelRescanDays: num('cancel_rescan_days', 1, 30),
    cancelReviewReasons: map.cancel_review_reasons!.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
  };
}

export async function setSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

/** Nilai internal (token OCS, dsb) — tidak tampil di halaman Pengaturan. */
export async function getInternal(key: string): Promise<string | null> {
  const r = await prisma.appSetting.findUnique({ where: { key } });
  return r?.value ?? null;
}
export async function setInternal(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export function cancelSettingsOf(s: Settings): CancelSettings {
  return { slaHours: s.cancelSlaHours, slaInstantHours: s.cancelSlaInstantHours, cutoff: s.cancelCutoff, shift: makeShift(s.workStart, s.workEnd) };
}
