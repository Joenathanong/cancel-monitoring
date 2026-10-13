import 'server-only';

/*
 * Klien doi-monitor (doi-monitor.vercel.app) — hanya membaca daftar Phase Out.
 *   POST /api/auth/login {username,password} → cookie doi_session
 *   GET  /api/phase-out                      → {ok, rows:[{matchType, matchValue, skus, name, reason, disposition, replacementSku, …}]}
 * Baris SAP di doi-monitor dicocokkan lewat 6 digit terakhir kode SAP dan
 * hasilnya sudah dijabarkan ke kolom `skus` ("A, B") — jadi kita cukup
 * memakai `skus` itu, ditambah baris bertipe SKU (matchValue = SKU OCS).
 */

export class DoiError extends Error {}

function cfg() {
  return {
    base: (process.env.DOI_MONITOR_URL || 'https://doi-monitor.vercel.app').replace(/\/+$/, ''),
    username: process.env.DOI_MONITOR_USERNAME || '',
    password: process.env.DOI_MONITOR_PASSWORD || '',
  };
}

export function doiConfigured() {
  const c = cfg();
  return Boolean(c.username && c.password);
}

async function http(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store', redirect: 'manual' });
  } catch (e) {
    throw new DoiError((e as Error).name === 'AbortError' ? 'doi-monitor tidak menjawab (timeout)' : `Tidak bisa terhubung ke doi-monitor: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

function sessionCookie(res: Response): string | null {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const c of list) {
    const first = c.split(';')[0]?.trim();
    if (first && first.includes('=') && !first.endsWith('=')) {
      if (first.startsWith('doi_session=')) return first;
    }
  }
  // nama cookie bisa berubah — ambil cookie pertama yang terisi
  const any = list.map((c) => c.split(';')[0]?.trim()).find((c) => c && c.includes('=') && !c.endsWith('='));
  return any ?? null;
}

async function login(): Promise<string> {
  const c = cfg();
  if (!c.username || !c.password) throw new DoiError('DOI_MONITOR_USERNAME / DOI_MONITOR_PASSWORD belum diisi di .env');
  const res = await http(`${c.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: c.username, password: c.password }),
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || j?.ok === false) throw new DoiError(`Login doi-monitor gagal: ${j?.error || `HTTP ${res.status}`}`);
  const cookie = sessionCookie(res);
  if (!cookie) throw new DoiError('Login doi-monitor berhasil tapi cookie sesi tidak diterima');
  return cookie;
}

export type PhaseOutEntry = {
  sku: string;
  sourceKey: string;
  name: string | null;
  reason: string | null;
  disposition: string | null;
  replacement: string | null;
};

type DoiRow = {
  key?: string; matchType?: string; matchValue?: string; sapCode?: string | null; skus?: string | null; name?: string | null;
  reason?: string | null; disposition?: string | null; replacementSku?: string | null;
};

/** Jabarkan baris doi-monitor ke daftar per SKU (satu SKU satu entri). */
export function expandPhaseOut(rows: DoiRow[]): { entries: PhaseOutEntry[]; unmatched: number } {
  const map = new Map<string, PhaseOutEntry>();
  let unmatched = 0;
  for (const r of rows) {
    const skus = new Set<string>();
    if (r.matchType === 'SKU' && r.matchValue) skus.add(r.matchValue.trim());
    for (const x of String(r.skus ?? '').split(',')) if (x.trim()) skus.add(x.trim());
    if (!skus.size) { unmatched++; continue; }
    for (const sku of skus) {
      const k = sku.toUpperCase();
      if (map.has(k)) continue;
      map.set(k, {
        sku,
        sourceKey: String(r.key ?? `${r.matchType}:${r.matchValue}`).slice(0, 160),
        name: r.name ? String(r.name).slice(0, 255) : null,
        reason: r.reason ? String(r.reason).slice(0, 160) : null,
        disposition: r.disposition ? String(r.disposition).slice(0, 32) : null,
        replacement: r.replacementSku ? String(r.replacementSku).slice(0, 120) : null,
      });
    }
  }
  return { entries: [...map.values()], unmatched };
}

export async function fetchPhaseOut(): Promise<{ entries: PhaseOutEntry[]; rows: number; unmatched: number }> {
  const c = cfg();
  const cookie = await login();
  const res = await http(`${c.base}/api/phase-out`, { headers: { Cookie: cookie, Accept: 'application/json' } });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; rows?: DoiRow[] } | null;
  if (!res.ok || !j || !Array.isArray(j.rows)) throw new DoiError(`Gagal membaca daftar phase out: ${j?.error || `HTTP ${res.status}`}`);
  const { entries, unmatched } = expandPhaseOut(j.rows);
  return { entries, rows: j.rows.length, unmatched };
}
