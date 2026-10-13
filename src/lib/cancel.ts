// Klasifikasi order CANCEL untuk Monitoring Cancel — modul murni, diuji di cancel.test.ts.
//
// Aturan yang ditetapkan user (13 Okt 2026):
// - Cancel dihitung KESALAHAN GUDANG bila order sudah lewat x jam kerja sejak
//   READY TO PROCESS dan belum mencapai batas (MANIFESTED / IN TRANSIT, pilihan
//   di Pengaturan) saat dibatalkan. Di bawah x jam = cancel wajar dari pembeli.
// - Jam kerja hanya 08:00–23:59 WIB (diatur di Pengaturan).
// - Order instant punya x sendiri.
// - Atribusi: Inventory bila order tercatat di Pending Kiriman, atau sudah masuk
//   picklist tapi tidak pernah dipick / gagal pick. Fulfillment bila sudah dipick
//   tapi tidak sampai batas tepat waktu (dan bila belum masuk picklist sama sekali).
import { workHoursBetween, type Shift } from './workhours';

export const CUTOFF = { MANIFESTED: 20030, IN_TRANSIT: 30000 } as const;
export type Cutoff = keyof typeof CUTOFF;
export const CUTOFF_LABEL: Record<Cutoff, string> = { MANIFESTED: 'MANIFESTED', IN_TRANSIT: 'IN TRANSIT' };

export type Verdict = 'KESALAHAN' | 'WAJAR_CEPAT' | 'WAJAR_SUDAH_KIRIM' | 'BELUM_DICEK';
export const VERDICT_LABEL: Record<Verdict, string> = {
  KESALAHAN: 'Kesalahan gudang',
  WAJAR_CEPAT: 'Wajar (di bawah batas jam)',
  WAJAR_SUDAH_KIRIM: 'Wajar (sudah diserahkan)',
  BELUM_DICEK: 'Log belum dicek',
};

export type Team = 'FULFILLMENT' | 'INVENTORY';
export const TEAM_LABEL: Record<Team, string> = { FULFILLMENT: 'Fulfillment', INVENTORY: 'Inventory' };

export type Stage = 'NO_PICKLIST' | 'NOT_PICKED' | 'PICK_FAILED' | 'PICKED' | 'PACKED' | 'SHIPPED';
export const STAGE_LABEL: Record<Stage, string> = {
  NO_PICKLIST: 'Belum masuk picklist',
  NOT_PICKED: 'Picklist dibuat, belum dipick',
  PICK_FAILED: 'Gagal pick',
  PICKED: 'Sudah dipick, belum dipack',
  PACKED: 'Sudah dipack, belum diserahkan',
  SHIPPED: 'Sudah diserahkan kurir',
};

export type Review = 'BELUM' | 'VALID' | 'BUKAN_GUDANG';
export const REVIEW_LABEL: Record<Review, string> = { BELUM: 'Belum direview', VALID: 'Dikonfirmasi', BUKAN_GUDANG: 'Bukan kesalahan gudang' };

export type CancelSettings = { slaHours: number; slaInstantHours: number; cutoff: Cutoff; shift: Shift };

/** Bahan klasifikasi — sebagian besar kolom tabel cancel_orders. */
export type CancelInput = {
  isInstant: boolean;
  orderCreatedAt: Date;
  ocsUpdatedAt: Date;
  detailedAt: Date | null;
  readyAt: Date | null;
  cancelledAt: Date | null;
  maxCodeBeforeCancel: number | null;
  hasPicklist: boolean | null;
  picked: boolean | null;
  packed: boolean | null;
  pickFailed: boolean | null;
  inPendingKiriman: boolean;
  reviewTeam: Team | null;
};

export type CancelResult = {
  verdict: Verdict;
  slaHours: number;
  workHours: number;
  stage: Stage | null;
  team: Team | null;
  autoTeam: Team | null;
};

export function slaFor(isInstant: boolean, s: CancelSettings) {
  return isInstant ? s.slaInstantHours : s.slaHours;
}

/**
 * Batas atas jam kerja tanpa membuka log: dari order dibuat sampai terakhir
 * berubah (≈ waktu cancel). READY TO PROCESS selalu ≥ dibuat dan waktu cancel
 * selalu ≤ terakhir berubah, jadi bila batas atas ini sudah di bawah x jam,
 * order PASTI wajar dan lognya tidak perlu dibuka.
 */
export function upperBoundHours(i: Pick<CancelInput, 'orderCreatedAt' | 'ocsUpdatedAt'>, s: CancelSettings) {
  return workHoursBetween(i.orderCreatedAt, i.ocsUpdatedAt, s.shift);
}

export function needsDetail(i: Pick<CancelInput, 'isInstant' | 'orderCreatedAt' | 'ocsUpdatedAt' | 'detailedAt'>, s: CancelSettings) {
  return !i.detailedAt && upperBoundHours(i, s) >= slaFor(i.isInstant, s);
}

export function stageOf(i: Pick<CancelInput, 'hasPicklist' | 'picked' | 'packed' | 'pickFailed' | 'maxCodeBeforeCancel'>, cutoff: Cutoff): Stage {
  if ((i.maxCodeBeforeCancel ?? 0) >= CUTOFF[cutoff]) return 'SHIPPED';
  if (i.packed) return 'PACKED';
  if (i.picked) return 'PICKED';
  if (i.pickFailed) return 'PICK_FAILED';
  if (i.hasPicklist) return 'NOT_PICKED';
  return 'NO_PICKLIST';
}

export function autoTeamOf(stage: Stage, inPendingKiriman: boolean): Team {
  if (inPendingKiriman) return 'INVENTORY';
  if (stage === 'NOT_PICKED' || stage === 'PICK_FAILED') return 'INVENTORY';
  return 'FULFILLMENT';
}

export function classifyCancel(i: CancelInput, s: CancelSettings): CancelResult {
  const sla = slaFor(i.isInstant, s);
  if (!i.detailedAt) {
    const ub = upperBoundHours(i, s);
    return { verdict: ub < sla ? 'WAJAR_CEPAT' : 'BELUM_DICEK', slaHours: sla, workHours: ub, stage: null, team: null, autoTeam: null };
  }
  const ready = i.readyAt ?? i.orderCreatedAt;
  const cancel = i.cancelledAt ?? i.ocsUpdatedAt;
  const wh = workHoursBetween(ready, cancel, s.shift);
  const stage = stageOf(i, s.cutoff);
  if (stage === 'SHIPPED') return { verdict: 'WAJAR_SUDAH_KIRIM', slaHours: sla, workHours: wh, stage, team: null, autoTeam: null };
  if (wh < sla) return { verdict: 'WAJAR_CEPAT', slaHours: sla, workHours: wh, stage, team: null, autoTeam: null };
  const autoTeam = autoTeamOf(stage, i.inPendingKiriman);
  return { verdict: 'KESALAHAN', slaHours: sla, workHours: wh, stage, team: i.reviewTeam ?? autoTeam, autoTeam };
}

export type LogLite = { CreatedAt?: string | null; NewStatusCode?: number | null; NewStatus?: string | null };
export type PicklistLite = { IsPickCompleted?: boolean; IsPackCompleted?: boolean; IsManifestCompleted?: boolean; PickerId?: string | null; PackerId?: string | null; PicklistNo?: string | null };

const CANCEL_CODES = new Set([11000, 11100, 90000]);

/** Ringkas log + picklist Find Order menjadi kolom tabel cancel_orders. */
export function digestFindOrder(logs: LogLite[], picklists: PicklistLite[]) {
  const L = logs
    .map((l) => ({ at: l.CreatedAt ? new Date(l.CreatedAt) : null, code: Number(l.NewStatusCode), name: l.NewStatus ?? null }))
    .filter((l) => l.at && !Number.isNaN(l.at.getTime()) && Number.isFinite(l.code))
    .sort((a, b) => a.at!.getTime() - b.at!.getTime()) as Array<{ at: Date; code: number; name: string | null }>;
  const cancel = L.find((l) => l.code === 90000 || l.code === 11100) ?? L.find((l) => l.code === 11000) ?? null;
  const ready = L.find((l) => l.code === 20000) ?? null;
  const before = L.filter((l) => !CANCEL_CODES.has(l.code) && (!cancel || l.at <= cancel.at));
  const max = before.reduce<{ code: number; name: string | null } | null>((m, l) => (!m || l.code > m.code ? { code: l.code, name: l.name } : m), null);
  const P = picklists ?? [];
  return {
    readyAt: ready?.at ?? null,
    cancelledAt: cancel?.at ?? null,
    maxCodeBeforeCancel: max?.code ?? null,
    lastStatusBeforeCancel: max?.name ?? null,
    hasPicklist: P.length > 0,
    picked: P.some((p) => p.IsPickCompleted) || before.some((l) => l.code >= 20013 && l.code < 20030 && l.code !== 20015 && l.code !== 20021),
    packed: P.some((p) => p.IsPackCompleted) || before.some((l) => l.code >= 20022 && l.code < 20030),
    pickFailed: before.some((l) => l.code === 20012),
    picklistNo: P.find((p) => p.PicklistNo)?.PicklistNo ?? null,
    pickerId: P.find((p) => p.PickerId)?.PickerId || null,
    packerId: P.find((p) => p.PackerId)?.PackerId || null,
  };
}
