'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, PlugZap, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Field, Spinner, Chip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { OCS_STATUS } from '@/lib/ocs-status';
import { fmtDateTime } from '@/lib/utils';
import type { Settings } from '@/lib/settings';

type Env = { ocsUser: string; ocsDb: string; ocsUrl: string; doiUser: string; doiUrl: string; ocsOk: boolean; doiOk: boolean; cron: boolean };
type Run = { id: string; kind: string; trigger: string; startedAt: string; finishedAt: string | null; ok: boolean; checked: number; changed: number; message: string | null };
type Status = { phaseOutCount: number; openOrders: number; notFound: number; errored: number; runs: Run[] };

export function SettingsForm({ initial, env }: { initial: Settings; env: Env }) {
  const router = useRouter();
  const { toast } = useToast();
  const [s, setS] = useState({
    appName: initial.appName,
    reasons: initial.reasons.join('\n'),
    processedMinCode: String(initial.processedMinCode),
    cancelRef: initial.cancelRef,
    autoSyncMinutes: String(initial.autoSyncMinutes),
    ocsBatch: String(initial.ocsBatch),
    phaseOutSyncHours: String(initial.phaseOutSyncHours),
    agingWarnDays: String(initial.agingWarnDays),
    cancelSlaHours: String(initial.cancelSlaHours),
    cancelSlaInstantHours: String(initial.cancelSlaInstantHours),
    cancelCutoff: initial.cancelCutoff,
    workStart: initial.workStart,
    workEnd: initial.workEnd,
    cancelStartDate: initial.cancelStartDate,
    cancelSyncMinutes: String(initial.cancelSyncMinutes),
    cancelDetailBatch: String(initial.cancelDetailBatch),
    cancelRescanDays: String(initial.cancelRescanDays),
    cancelReviewReasons: initial.cancelReviewReasons.join('\n'),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [testOrder, setTestOrder] = useState('');
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function loadStatus() { try { setStatus(await api<Status>('/api/sync/status')); } catch { /* abaikan */ } }
  useEffect(() => { void loadStatus(); }, []);

  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setS((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setBusy('save');
    try {
      await api('/api/settings', { method: 'PUT', json: s });
      toast('Pengaturan disimpan', 'positive');
      router.refresh();
    } catch (e) { toast((e as Error).message, 'negative'); } finally { setBusy(null); }
  }
  async function test(target: 'ocs' | 'doi') {
    setBusy(`test-${target}`);
    try {
      const r = await api<{ ok: boolean; message: string }>('/api/sync/test', { method: 'POST', json: { target, orderId: testOrder || undefined } });
      setTestMsg((m) => ({ ...m, [target]: r }));
    } catch (e) { setTestMsg((m) => ({ ...m, [target]: { ok: false, message: (e as Error).message } })); } finally { setBusy(null); }
  }
  async function sync(kind: 'ocs' | 'phase-out') {
    setBusy(`sync-${kind}`);
    try {
      const r = await api<{ ocs?: { ok: boolean; message: string }; phaseOut?: { ok: boolean; message: string } }>('/api/sync', { method: 'POST', json: { kind } });
      const x = r.ocs ?? r.phaseOut!;
      toast(x.message, x.ok ? 'positive' : 'negative');
      void loadStatus();
    } catch (e) { toast((e as Error).message, 'negative'); } finally { setBusy(null); }
  }

  return (
    <>
      <section className="card flex flex-col gap-3">
        <div className="card-title">Koneksi</div>
        <div className="text-xs text-label">Akun diisi di file <code>.env</code> (lokal) atau Environment Variables Vercel — tidak disimpan di database. Setelah mengubah di Vercel, lakukan Redeploy.</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-control border border-subtle p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><b>OCS · Find Order</b>{env.ocsOk ? <Chip tone="positive" icon={<CheckCircle2 />}>Terisi</Chip> : <Chip tone="negative" icon={<XCircle />}>Belum diisi</Chip>}</div>
            <div className="text-xs text-label break-all">{env.ocsUrl} · user <b>{env.ocsUser || '—'}</b> · DB {env.ocsDb}</div>
            <div className="flex gap-2">
              <input className="input !h-9 !text-sm mono" placeholder="Order ID untuk tes (opsional)" value={testOrder} onChange={(e) => setTestOrder(e.target.value)} aria-label="Order ID untuk tes" />
              <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => test('ocs')} disabled={!!busy}>{busy === 'test-ocs' ? <Spinner /> : <PlugZap />} Tes</button>
            </div>
            {testMsg.ocs && <div className={`text-xs ${testMsg.ocs.ok ? 'text-positive' : 'text-negative'}`}>{testMsg.ocs.message}</div>}
            <div className="text-xs text-label">Pakai akun OCS yang punya akses <b>semua area</b>, supaya order cabang juga ditemukan.</div>
          </div>
          <div className="rounded-control border border-subtle p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><b>doi-monitor · Phase Out</b>{env.doiOk ? <Chip tone="positive" icon={<CheckCircle2 />}>Terisi</Chip> : <Chip tone="negative" icon={<XCircle />}>Belum diisi</Chip>}</div>
            <div className="text-xs text-label break-all">{env.doiUrl} · user <b>{env.doiUser || '—'}</b></div>
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => test('doi')} disabled={!!busy}>{busy === 'test-doi' ? <Spinner /> : <PlugZap />} Tes</button></div>
            {testMsg.doi && <div className={`text-xs ${testMsg.doi.ok ? 'text-positive' : 'text-negative'}`}>{testMsg.doi.message}</div>}
            <div className="text-xs text-label">Cukup akun doi-monitor peran <b>Lihat saja</b>.</div>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="card-title">Sinkronisasi</div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => sync('phase-out')} disabled={!!busy}>{busy === 'sync-phase-out' ? <Spinner /> : <RefreshCw />} Tarik Phase Out</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => sync('ocs')} disabled={!!busy}>{busy === 'sync-ocs' ? <Spinner /> : <RefreshCw />} Cek status OCS</button>
          </div>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip tone="brand">{status.phaseOutCount} SKU phase out tersimpan</Chip>
            <Chip tone="critical">{status.openOrders} order masih pending</Chip>
            {status.notFound > 0 && <Chip tone="neutral">{status.notFound} order tidak ada di OCS</Chip>}
            {status.errored > 0 && <Chip tone="negative">{status.errored} order gagal dicek</Chip>}
            <Chip tone={env.cron ? 'positive' : 'neutral'}>{env.cron ? 'CRON_SECRET terisi' : 'CRON_SECRET belum diisi'}</Chip>
          </div>
        )}
        <div className="table-card">
          <div className="table-scroll" style={{ maxHeight: 260 }}>
            <table className="rtable">
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Pemicu</th><th className="n">Dicek</th><th className="n">Berubah</th><th>Hasil</th></tr></thead>
              <tbody>
                {(status?.runs ?? []).map((r) => (
                  <tr key={r.id}>
                    <td data-label="Waktu" className="title">{fmtDateTime(r.startedAt)}</td>
                    <td data-label="Jenis">{({ OCS: 'Status OCS', PHASE_OUT: 'Phase Out', CANCEL_LIST: 'Daftar cancel', CANCEL_DETAIL: 'Log cancel' } as Record<string, string>)[r.kind] ?? r.kind}</td>
                    <td data-label="Pemicu">{r.trigger}</td>
                    <td data-label="Dicek" className="n">{r.checked}</td>
                    <td data-label="Berubah" className="n">{r.changed}</td>
                    <td data-label="Hasil" className={r.ok ? '' : 'text-negative'} title={r.message ?? ''} style={{ whiteSpace: 'normal' }}>{r.finishedAt ? r.message : 'berjalan…'}</td>
                  </tr>
                ))}
                {status && !status.runs.length && <tr><td colSpan={6} className="text-center text-label py-6">Belum pernah sinkron</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="card-title">Aturan KPI</div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Order dianggap terselesaikan (terproses) mulai status" htmlFor="st-min" hint="Bawaan: MANIFESTED — sudah diserahkan ke kurir. Status di atasnya (In transit, Delivered, Completed, Return) ikut terhitung terproses.">
            <select id="st-min" className="select" value={s.processedMinCode} onChange={set('processedMinCode')}>
              {OCS_STATUS.filter((x) => x.code >= 20001 && x.code < 90000 && ![20012, 20015, 20021].includes(x.code)).map((x) => <option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}
            </select>
          </Field>
          <Field label="Waktu batal dihitung sejak" htmlFor="st-ref" hint="Dipakai untuk kategori ≤ 1 hari / hari ke-2 / > 2 hari.">
            <select id="st-ref" className="select" value={s.cancelRef} onChange={set('cancelRef')}>
              <option value="INPUT">Fulfillment menginput pending</option>
              <option value="ORDER">Order dibuat di marketplace</option>
            </select>
          </Field>
          <Field label="Peringatan umur pending (hari)" htmlFor="st-age" hint="Baris pending lebih tua dari ini diberi tanda merah.">
            <input id="st-age" className="input" inputMode="numeric" value={s.agingWarnDays} onChange={set('agingWarnDays')} />
          </Field>
          <Field label="Nama aplikasi" htmlFor="st-name"><input id="st-name" className="input" value={s.appName} onChange={set('appName')} /></Field>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="card-title">Sinkron otomatis</div>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Cek status OCS tiap (menit)" htmlFor="st-auto" hint="Dipicu saat halaman dibuka. 0 = hanya manual / cron.">
            <input id="st-auto" className="input" inputMode="numeric" value={s.autoSyncMinutes} onChange={set('autoSyncMinutes')} />
          </Field>
          <Field label="Order per sinkron" htmlFor="st-batch" hint="Order paling lama belum dicek didahulukan.">
            <input id="st-batch" className="input" inputMode="numeric" value={s.ocsBatch} onChange={set('ocsBatch')} />
          </Field>
          <Field label="Tarik Phase Out tiap (jam)" htmlFor="st-po"><input id="st-po" className="input" inputMode="numeric" value={s.phaseOutSyncHours} onChange={set('phaseOutSyncHours')} /></Field>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="card-title">Monitoring Cancel</div>
        <div className="text-xs text-label">Cancel dihitung kesalahan gudang bila order sudah lewat batas jam <b>kerja</b> sejak READY TO PROCESS dan belum mencapai batas status saat dibatalkan. Perubahan di sini langsung berlaku ke semua data lama.</div>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Batas jam — order reguler" htmlFor="st-csla" hint="Bawaan 4 jam"><input id="st-csla" className="input" inputMode="decimal" value={s.cancelSlaHours} onChange={set('cancelSlaHours')} /></Field>
          <Field label="Batas jam — order instant" htmlFor="st-cslai" hint="Untuk order bertanda Instant di OCS"><input id="st-cslai" className="input" inputMode="decimal" value={s.cancelSlaInstantHours} onChange={set('cancelSlaInstantHours')} /></Field>
          <Field label="Dianggap sudah diserahkan mulai status" htmlFor="st-cut">
            <select id="st-cut" className="select" value={s.cancelCutoff} onChange={set('cancelCutoff')}>
              <option value="MANIFESTED">MANIFESTED (diserahkan ke kurir)</option>
              <option value="IN_TRANSIT">IN TRANSIT</option>
            </select>
          </Field>
          <Field label="Jam kerja mulai" htmlFor="st-ws" hint="Shift 1"><input id="st-ws" className="input" type="time" value={s.workStart} onChange={set('workStart')} /></Field>
          <Field label="Jam kerja selesai" htmlFor="st-we" hint="Akhir shift 2 (23:59 = sampai tengah malam)"><input id="st-we" className="input" type="time" value={s.workEnd} onChange={set('workEnd')} /></Field>
          <Field label="Tarik data mulai tanggal" htmlFor="st-csd" hint="Tanggal order dibuat"><input id="st-csd" className="input" type="date" value={s.cancelStartDate} onChange={set('cancelStartDate')} /></Field>
          <Field label="Sinkron otomatis tiap (menit)" htmlFor="st-csm" hint="Dipicu saat halaman dibuka. 0 = manual / cron saja"><input id="st-csm" className="input" inputMode="numeric" value={s.cancelSyncMinutes} onChange={set('cancelSyncMinutes')} /></Field>
          <Field label="Pantau ulang order N hari terakhir" htmlFor="st-crd" hint="Menangkap cancel otomatis marketplace yang datang beberapa hari setelah order"><input id="st-crd" className="input" inputMode="numeric" value={s.cancelRescanDays} onChange={set('cancelRescanDays')} /></Field>
          <Field label="Log dibuka per sinkron" htmlFor="st-cdb"><input id="st-cdb" className="input" inputMode="numeric" value={s.cancelDetailBatch} onChange={set('cancelDetailBatch')} /></Field>
        </div>
        <Field label="Alasan 'bukan kesalahan gudang' (satu per baris)" htmlFor="st-crr" hint="Pilihan saat lead mereview">
          <textarea id="st-crr" className="textarea !min-h-[130px]" value={s.cancelReviewReasons} onChange={set('cancelReviewReasons')} />
        </Field>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="card-title">Daftar alasan pending</div>
        <Field label="Satu alasan per baris" htmlFor="st-reasons" hint="Muncul sebagai pilihan saat Inventory mengisi tindak lanjut.">
          <textarea id="st-reasons" className="textarea !min-h-[200px]" value={s.reasons} onChange={set('reasons')} />
        </Field>
      </section>

      <div className="flex justify-end sticky bottom-0 py-2" style={{ background: 'var(--bg-canvas)' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? <Spinner /> : <Save />} Simpan pengaturan</button>
      </div>
    </>
  );
}
