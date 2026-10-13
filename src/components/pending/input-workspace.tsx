'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Save, Plus, ClipboardPaste, ScanLine, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Field, Spinner, Chip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { cleanOrderId, mergeBulk, parseBulk, type BulkLine } from '@/lib/items';
import { fmtShort, toDateInput } from '@/lib/utils';
import type { ItemRow } from '@/server/items';
import type { RoleName } from '@/lib/session';
import { ItemsTable } from './items-table';
import { ItemDetail } from './item-detail';
import { OcsChip, CategoryChips } from './chips';

type LookupSku = { sku: string; bundleSku: string | null; qty: number; name: string | null; isPhaseOut: boolean; phaseOutInfo: string | null; isClearance: boolean };
type Lookup = {
  configured: boolean;
  error?: string;
  ocs: null | { found: boolean; orderId: string | null; statusCode: number | null; statusName: string | null; platform: string | null; shopName: string | null; area: string | null; orderType: string | null; createdAt: string | null; skus: LookupSku[] };
  existing: { id: string; sku: string; qty: number; inputByName: string; inputAt: string }[];
};
type SaveResult = { saved: number; failed: number; results: { orderId: string; sku: string; qty: number; ok: boolean; error?: string; warning?: string }[]; sync: { checked: number; message: string } | null };

export function InputWorkspace({ me, reasons, agingWarnDays }: { me: { id: string; role: RoleName }; reasons: string[]; agingWarnDays: number }) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [range, setRange] = useState<'today' | '7d' | 'all'>('today');
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const today = toDateInput(new Date());
      const from = range === 'today' ? today : range === '7d' ? toDateInput(new Date(Date.now() - 6 * 86400000)) : '';
      const q = new URLSearchParams({ mine: '1', status: 'ALL', ...(from ? { from } : {}) });
      const x = await api<{ rows: ItemRow[] }>(`/api/items?${q}`);
      setRows(x.rows);
    } catch { /* abaikan */ } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { void loadMine(); }, [loadMine]);

  return (
    <>
      <div className="seg self-start" role="tablist" aria-label="Cara input">
        <button type="button" role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'is-active' : ''} onClick={() => setMode('single')}><ScanLine className="inline w-4 h-4 mr-1" />Satu per satu</button>
        <button type="button" role="tab" aria-selected={mode === 'bulk'} className={mode === 'bulk' ? 'is-active' : ''} onClick={() => setMode('bulk')}><ClipboardPaste className="inline w-4 h-4 mr-1" />Tempel banyak</button>
      </div>
      {mode === 'single' ? <SingleForm onSaved={loadMine} /> : <BulkForm onSaved={loadMine} />}

      <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
        <h2 className="text-base font-semibold">Input saya</h2>
        <div className="seg" role="tablist" aria-label="Rentang">
          {([['today', 'Hari ini'], ['7d', '7 hari'], ['all', 'Semua']] as const).map(([k, l]) => (
            <button key={k} type="button" className={range === k ? 'is-active' : ''} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>
      {loading && !rows.length ? <div className="py-6 grid place-items-center"><Spinner /></div> : (
        <ItemsTable id="input-mine" rows={rows} onOpen={(r) => setOpenId(r.id)} agingWarnDays={agingWarnDays} compact />
      )}
      <ItemDetail id={openId} onClose={() => setOpenId(null)} onChanged={loadMine} me={me} reasons={reasons} />
    </>
  );
}

function SingleForm({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [look, setLook] = useState<Lookup | null>(null);
  const [lookFor, setLookFor] = useState('');
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const orderRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  async function lookup(id = orderId) {
    const clean = cleanOrderId(id);
    if (!clean || clean === lookFor) return;
    setLookFor(clean);
    setLooking(true);
    setLook(null);
    try {
      setLook(await api<Lookup>(`/api/ocs/lookup?orderId=${encodeURIComponent(clean)}`));
    } catch (e) {
      setLook({ configured: true, error: (e as Error).message, ocs: null, existing: [] });
    } finally {
      setLooking(false);
    }
  }

  function pickSku(s: LookupSku) {
    setSku(s.sku);
    setQty(String(s.qty || 1));
    setTimeout(() => qtyRef.current?.select(), 0);
  }

  async function save(keepOrder: boolean) {
    setErr(null);
    if (!cleanOrderId(orderId)) { setErr('Order ID wajib diisi'); orderRef.current?.focus(); return; }
    if (!sku.trim()) { setErr('SKU OCS wajib diisi'); skuRef.current?.focus(); return; }
    if (!(Number(qty) >= 1)) { setErr('Jumlah pending minimal 1'); qtyRef.current?.focus(); return; }
    setBusy(true);
    try {
      const r = await api<SaveResult>('/api/items', { method: 'POST', json: { orderId, sku, qty: Number(qty), note } });
      const res = r.results[0]!;
      if (!res.ok) throw new Error(res.error || 'Gagal menyimpan');
      toast(`Tersimpan: ${res.orderId} · ${res.sku} × ${res.qty}${res.warning ? ` — ${res.warning}` : ''}`, res.warning ? 'default' : 'positive');
      setSku(''); setQty(''); setNote('');
      if (keepOrder) {
        setLookFor('');
        void lookup(orderId);
        skuRef.current?.focus();
      } else {
        setOrderId(''); setLook(null); setLookFor('');
        orderRef.current?.focus();
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ocs = look?.ocs;
  const existingSkus = new Set((look?.existing ?? []).map((e) => e.sku.toUpperCase()));
  return (
    <form className="card flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
      {err && <div className="alert alert-negative" role="alert">{err}</div>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_120px]">
        <Field label="Order ID" htmlFor="in-order" required>
          <div className="flex gap-2">
            <input
              id="in-order" ref={orderRef} className="input mono" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onBlur={() => void lookup()}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); skuRef.current?.focus(); } }}
              placeholder="scan / ketik Order ID"
            />
            <button type="button" className="btn btn-secondary btn-icon" onClick={() => { setLookFor(''); void lookup(); }} aria-label="Cek order di OCS" title="Cek order di OCS (Find Order)">{looking ? <Spinner /> : <Search />}</button>
          </div>
        </Field>
        <Field label="SKU OCS" htmlFor="in-sku" required>
          <input
            id="in-sku" ref={skuRef} className="input mono" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="next" list="ocs-skus"
            value={sku} onChange={(e) => setSku(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); qtyRef.current?.focus(); } }}
            placeholder="mis. SERUM-VITAMIN-C"
          />
          <datalist id="ocs-skus">{ocs?.skus.map((s) => <option key={s.sku + (s.bundleSku ?? '')} value={s.sku} />)}</datalist>
        </Field>
        <Field label="Jumlah pending" htmlFor="in-qty" required>
          <input id="in-qty" ref={qtyRef} className="input tabular" inputMode="numeric" autoComplete="off" enterKeyHint="done" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </Field>
      </div>

      {(looking || look) && (
        <div className="rounded-control border border-subtle bg-surface-alt p-3 flex flex-col gap-2 text-sm" aria-live="polite">
          {looking && <span className="flex items-center gap-2 text-label"><Spinner /> Mencari order di OCS…</span>}
          {look && !look.configured && <span className="text-label">Akun OCS belum diatur — order tetap bisa disimpan, status dicek setelah akun diisi.</span>}
          {look?.error && <span className="text-negative flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> OCS: {look.error} — data tetap bisa disimpan.</span>}
          {look && look.configured && !look.error && ocs && !ocs.found && <span className="text-critical flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Order {lookFor} tidak ditemukan di OCS. Periksa lagi nomornya.</span>}
          {ocs?.found && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <OcsChip code={ocs.statusCode} name={ocs.statusName} found />
                <span className="font-medium">{[ocs.shopName, ocs.platform, ocs.area, ocs.orderType].filter(Boolean).join(' · ')}</span>
                {ocs.createdAt && <span className="text-label">order {fmtShort(ocs.createdAt)}</span>}
              </div>
              {ocs.statusCode !== null && (ocs.statusCode === 90000 || ocs.statusCode === 11100 || ocs.statusCode >= 20030) && (
                <div className="text-critical text-xs font-semibold">Perhatian: order ini sudah {ocs.statusCode === 90000 || ocs.statusCode === 11100 ? 'BATAL' : 'diproses/dikirim'} di OCS.</div>
              )}
              {ocs.skus.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-label">Ketuk SKU untuk mengisi otomatis:</span>
                  <div className="flex flex-wrap gap-2">
                    {ocs.skus.map((s, i) => {
                      const done = existingSkus.has(s.sku.toUpperCase());
                      return (
                        <button key={i} type="button" className={`btn btn-sm ${sku.toUpperCase() === s.sku.toUpperCase() ? 'btn-primary' : 'btn-secondary'} !h-auto !py-1.5 flex-col !items-start text-left max-w-full`} onClick={() => pickSku(s)} title={s.name ?? ''}>
                          <span className="mono text-xs truncate max-w-[260px]">{s.sku} × {s.qty}{done ? ' ✓' : ''}</span>
                          {s.bundleSku && <span className="text-[10px] opacity-80 truncate max-w-[260px]">bundle {s.bundleSku}</span>}
                          <CategoryChips isPhaseOut={s.isPhaseOut} isClearance={s.isClearance} info={s.phaseOutInfo} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {look && look.existing.length > 0 && (
            <div className="text-xs text-label">
              Sudah dicatat untuk order ini: {look.existing.map((e) => `${e.sku} × ${e.qty} (${e.inputByName})`).join(', ')}
            </div>
          )}
        </div>
      )}

      <Field label="Catatan (opsional)" htmlFor="in-note">
        <input id="in-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. rak kosong, sisa 1 pcs rusak" />
      </Field>
      <div className="flex gap-2 flex-wrap justify-end">
        <button type="button" className="btn btn-secondary max-sm:w-full" disabled={busy} onClick={() => void save(true)}><Plus /> Simpan + SKU lain di order ini</button>
        <button type="submit" className="btn btn-primary max-sm:w-full" disabled={busy}>{busy ? <Spinner /> : <Save />} Simpan</button>
      </div>
    </form>
  );
}

function BulkForm({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const lines: BulkLine[] = mergeBulk(parseBulk(text));
  const valid = lines.filter((l) => !l.error);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<SaveResult>('/api/items', { method: 'POST', json: { lines: valid.map(({ orderId, sku, qty }) => ({ orderId, sku, qty })) } });
      setResult(r);
      toast(`${r.saved} baris tersimpan${r.failed ? `, ${r.failed} gagal` : ''}`, r.failed ? 'default' : 'positive');
      if (!r.failed) setText('');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'negative');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <Field label="Tempel dari Excel / Google Sheet" htmlFor="bulk" hint="Satu baris per SKU: Order ID · SKU OCS · Jumlah (dipisah TAB, ; atau ,). Baris judul dilewati, jumlah kosong = 1, baris dobel dijumlahkan.">
        <textarea id="bulk" className="textarea mono !min-h-[160px]" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder={'2704148346952818\tSERUM-VITAMIN-C\t1\n2704148346952818\tHANASUI-TONE-UP-SERUM-SUNSCREEN\t2'} spellCheck={false} />
      </Field>
      {lines.length > 0 && !result && (
        <div className="text-sm flex flex-col gap-1">
          <div className="flex gap-2 flex-wrap"><Chip tone="positive">{valid.length} siap disimpan</Chip>{lines.length - valid.length > 0 && <Chip tone="negative">{lines.length - valid.length} bermasalah</Chip>}</div>
          <ul className="max-h-[220px] overflow-y-auto flex flex-col gap-0.5 text-xs" style={{ overscrollBehavior: 'contain' }}>
            {lines.map((l) => (
              <li key={l.line} className={`flex gap-2 ${l.error ? 'text-negative' : ''}`}>
                <span className="text-label w-10 shrink-0">#{l.line}</span>
                <span className="mono truncate">{l.orderId || '—'} · {l.sku || '—'} × {l.qty}</span>
                {l.error && <span className="shrink-0">— {l.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && (
        <div className="text-sm flex flex-col gap-1">
          {result.sync && <div className="text-xs text-label">OCS: {result.sync.message}</div>}
          <ul className="max-h-[260px] overflow-y-auto flex flex-col gap-1 text-xs" style={{ overscrollBehavior: 'contain' }}>
            {result.results.map((r, i) => (
              <li key={i} className="flex gap-2 items-start">
                {r.ok ? <CheckCircle2 className="w-4 h-4 text-positive shrink-0" /> : <XCircle className="w-4 h-4 text-negative shrink-0" />}
                <span className="mono">{r.orderId} · {r.sku} × {r.qty}</span>
                {(r.error || r.warning) && <span className={r.error ? 'text-negative' : 'text-critical'}>— {r.error ?? r.warning}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary max-sm:w-full" onClick={save} disabled={busy || !valid.length}>{busy ? <Spinner /> : <Save />} Simpan {valid.length || ''} baris</button>
      </div>
    </div>
  );
}
