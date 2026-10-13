import { apiUser, isResponse } from '@/lib/auth';
import { getSettings, setSettings, setInternal } from '@/lib/settings';
import { isAdmin } from '@/lib/roles';
import { handleApiError, ValidationError } from '@/lib/validate';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const u = await apiUser();
  if (isResponse(u)) return u;
  return Response.json(await getSettings());
}

export async function PUT(req: Request) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  try {
    const b = await req.json();
    const vals: Record<string, string> = {};
    if (b.appName !== undefined) vals.app_name = String(b.appName).trim().slice(0, 60) || 'Pending Kiriman IEG';
    if (b.reasons !== undefined) {
      const list = (Array.isArray(b.reasons) ? b.reasons : String(b.reasons).split(/\r?\n/)).map((s: unknown) => String(s).trim().slice(0, 120)).filter(Boolean);
      if (!list.length) throw new ValidationError('Daftar alasan tidak boleh kosong');
      vals.reasons = [...new Set(list)].join('\n');
    }
    const n = (v: unknown, name: string, min: number, max: number) => {
      const x = parseInt(String(v), 10);
      if (!Number.isFinite(x) || x < min || x > max) throw new ValidationError(`${name} harus ${min}–${max}`);
      return String(x);
    };
    if (b.processedMinCode !== undefined) vals.processed_min_code = n(b.processedMinCode, 'Batas status terproses', 1, 99999);
    if (b.cancelRef !== undefined) vals.cancel_ref = b.cancelRef === 'ORDER' ? 'ORDER' : 'INPUT';
    if (b.autoSyncMinutes !== undefined) vals.auto_sync_minutes = n(b.autoSyncMinutes, 'Interval sinkron', 0, 1440);
    if (b.ocsBatch !== undefined) vals.ocs_batch = n(b.ocsBatch, 'Jumlah order per sinkron', 5, 200);
    if (b.phaseOutSyncHours !== undefined) vals.phase_out_sync_hours = n(b.phaseOutSyncHours, 'Interval phase out', 1, 168);
    if (b.agingWarnDays !== undefined) vals.aging_warn_days = n(b.agingWarnDays, 'Batas umur pending', 1, 60);
    const dec = (v: unknown, name: string, min: number, max: number) => {
      const x = parseFloat(String(v).replace(',', '.'));
      if (!Number.isFinite(x) || x < min || x > max) throw new ValidationError(`${name} harus ${min}–${max}`);
      return String(Math.round(x * 100) / 100);
    };
    const hm = (v: unknown, name: string) => {
      const t = String(v ?? '').trim();
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) throw new ValidationError(`${name} harus format JJ:MM`);
      return t.padStart(5, '0');
    };
    if (b.cancelSlaHours !== undefined) vals.cancel_sla_hours = dec(b.cancelSlaHours, 'Batas jam order reguler', 0.25, 240);
    if (b.cancelSlaInstantHours !== undefined) vals.cancel_sla_instant_hours = dec(b.cancelSlaInstantHours, 'Batas jam order instant', 0.25, 240);
    if (b.cancelCutoff !== undefined) vals.cancel_cutoff = b.cancelCutoff === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'MANIFESTED';
    if (b.workStart !== undefined) vals.work_start = hm(b.workStart, 'Jam mulai kerja');
    if (b.workEnd !== undefined) vals.work_end = hm(b.workEnd, 'Jam selesai kerja');
    if (vals.work_start && vals.work_end && vals.work_end <= vals.work_start) throw new ValidationError('Jam selesai kerja harus setelah jam mulai');
    if (b.cancelStartDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.cancelStartDate))) throw new ValidationError('Tanggal mulai harus YYYY-MM-DD');
      vals.cancel_start_date = String(b.cancelStartDate);
      // tanggal mulai berubah → backfill diulang dari tanggal baru
      if (vals.cancel_start_date !== (await getSettings()).cancelStartDate) await setInternal('cancel_list_cursor', '');
    }
    if (b.cancelSyncMinutes !== undefined) vals.cancel_sync_minutes = n(b.cancelSyncMinutes, 'Interval sinkron cancel', 0, 1440);
    if (b.cancelRescanDays !== undefined) vals.cancel_rescan_days = n(b.cancelRescanDays, 'Pantau ulang order', 1, 30);
    if (b.cancelDetailBatch !== undefined) vals.cancel_detail_batch = n(b.cancelDetailBatch, 'Log per sinkron', 10, 500);
    if (b.cancelReviewReasons !== undefined) {
      const list = (Array.isArray(b.cancelReviewReasons) ? b.cancelReviewReasons : String(b.cancelReviewReasons).split(/\r?\n/)).map((x: unknown) => String(x).trim().slice(0, 160)).filter(Boolean);
      if (!list.length) throw new ValidationError('Daftar alasan review tidak boleh kosong');
      vals.cancel_review_reasons = [...new Set(list)].join('\n');
    }
    await setSettings(vals);
    if (vals.processed_min_code) {
      // Batas "terproses" dinaikkan → order TERPROSES yang statusnya di bawah batas baru
      // dikembalikan ke OPEN supaya dicek ulang pada sinkron berikutnya.
      await prisma.pendingOrder.updateMany({
        where: { resolution: 'PROCESSED', manualResolution: false, ocsStatusCode: { lt: Number(vals.processed_min_code) } },
        data: { resolution: 'OPEN', processedAt: null, lastCheckedAt: null },
      });
      // Batas diturunkan → order OPEN yang sudah melewatinya didahulukan di sinkron berikutnya.
      await prisma.pendingOrder.updateMany({
        where: { resolution: 'OPEN', manualResolution: false, ocsStatusCode: { gte: Number(vals.processed_min_code) } },
        data: { lastCheckedAt: null },
      });
    }
    return Response.json({ ok: true, settings: await getSettings() });
  } catch (e) {
    return handleApiError(e);
  }
}
