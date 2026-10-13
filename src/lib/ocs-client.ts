import 'server-only';
import { getInternal, setInternal } from './settings';
import type { OcsLog } from './ocs-status';
import type { OcsSku } from './items';

/*
 * Klien OCS (ocs.iegsystem.id) — hanya memakai endpoint BACA:
 *   POST /Auth/Login        {username,password,companydb} → {Token}
 *   GET  /Orders/FindOrder?keyword=<order id / resi / package id>
 * (dibongkar 13 Okt 2026 dari tombol "Find Order" di halaman Picklist).
 * Token JWT berlaku 24 jam; disimpan di tabel app_settings supaya fungsi
 * serverless Vercel tidak login ulang di setiap permintaan.
 */

const TOKEN_KEY = 'ocs_token';

export class OcsError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

function cfg() {
  const base = (process.env.OCS_BASE_URL || 'https://ocs.iegsystem.id').replace(/\/+$/, '');
  const username = process.env.OCS_USERNAME || '';
  const password = process.env.OCS_PASSWORD || '';
  const companydb = process.env.OCS_COMPANY_DB || 'EJI_WMS';
  return { base, username, password, companydb };
}

export function ocsConfigured() {
  const c = cfg();
  return Boolean(c.username && c.password);
}

let memToken: { token: string; exp: number } | null = null;
/** Satu login bersama untuk permintaan paralel — mencegah 4 worker sinkron login sendiri-sendiri. */
let inflight: Promise<string> | null = null;

function jwtExp(token: string): number {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp * 1000 : Date.now() + 6 * 3600 * 1000;
  } catch {
    return Date.now() + 6 * 3600 * 1000;
  }
}

async function http(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { base } = cfg();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  try {
    return await fetch(base + path, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'OCS tidak menjawab (timeout)' : `Tidak bisa terhubung ke OCS: ${(e as Error).message}`;
    throw new OcsError(msg);
  } finally {
    clearTimeout(t);
  }
}

function pickToken(j: unknown): string | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  for (const k of ['Token', 'token', 'accessToken', 'AccessToken']) if (typeof o[k] === 'string') return o[k] as string;
  for (const k of ['data', 'Data']) { const t = pickToken(o[k]); if (t) return t; }
  return null;
}

export async function ocsLogin(): Promise<string> {
  const c = cfg();
  if (!c.username || !c.password) throw new OcsError('OCS_USERNAME / OCS_PASSWORD belum diisi di .env');
  const res = await http('/Auth/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: c.username, password: c.password, companydb: c.companydb }),
  });
  const text = await res.text();
  let j: unknown = null;
  try { j = JSON.parse(text); } catch { /* bukan JSON */ }
  const token = pickToken(j);
  if (!res.ok || !token) {
    const msg = (j as { message?: string; Message?: string } | null)?.message || (j as { Message?: string } | null)?.Message || text.slice(0, 160) || `HTTP ${res.status}`;
    throw new OcsError(`Login OCS gagal: ${msg}`, res.status);
  }
  memToken = { token, exp: jwtExp(token) };
  await setInternal(TOKEN_KEY, JSON.stringify(memToken)).catch(() => {});
  return token;
}

async function getToken(force = false): Promise<string> {
  if (inflight) return inflight;
  inflight = resolveToken(force).finally(() => { inflight = null; });
  return inflight;
}

async function resolveToken(force: boolean): Promise<string> {
  const margin = 10 * 60 * 1000;
  if (!force && memToken && memToken.exp - margin > Date.now()) return memToken.token;
  if (!force) {
    const raw = await getInternal(TOKEN_KEY).catch(() => null);
    if (raw) {
      try {
        const t = JSON.parse(raw) as { token: string; exp: number };
        if (t.token && t.exp - margin > Date.now()) { memToken = t; return t.token; }
      } catch { /* abaikan */ }
    }
  }
  return ocsLogin();
}

export async function getJson(path: string, timeoutMs = 20000): Promise<{ status: number; body: unknown }> {
  let token = await getToken();
  let res = await http(path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeoutMs });
  if (res.status === 401) {
    token = await getToken(true);
    res = await http(path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeoutMs });
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

export type OcsOrderInfo = {
  found: boolean;
  matchedBy: string | null;
  orderId: string | null;
  statusCode: number | null;
  statusName: string | null;
  rawStatus: string | null;
  platform: string | null;
  shopName: string | null;
  area: string | null;
  orderType: string | null;
  trackingNumber: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  skus: OcsSku[];
  logs: OcsLog[];
  picklists: Array<Record<string, unknown>>;
  isInstant: boolean | null;
};

const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

/** Bentuk respons OCS: kadang {statusCode,data:{…}}, kadang langsung {MatchedBy,Order,…}. */
export function normalizeFindOrder(body: unknown): OcsOrderInfo {
  const empty: OcsOrderInfo = { found: false, matchedBy: null, orderId: null, statusCode: null, statusName: null, rawStatus: null, platform: null, shopName: null, area: null, orderType: null, trackingNumber: null, createdAt: null, updatedAt: null, skus: [], logs: [], picklists: [], isInstant: null };
  if (!body || typeof body !== 'object') return empty;
  let d = body as Record<string, unknown>;
  if (!('Order' in d)) {
    const inner = (d.data ?? d.Data) as Record<string, unknown> | null | undefined;
    if (!inner || typeof inner !== 'object' || !('Order' in inner)) return empty;
    d = inner;
  }
  const o = (d.Order ?? null) as Record<string, unknown> | null;
  if (!o) return empty;
  const skus = Array.isArray(d.Skus)
    ? (d.Skus as Record<string, unknown>[]).map((x) => ({ sku: String(x.SellerSku ?? ''), bundleSku: s(x.BundleSku), qty: Number(x.Qty) || 0, name: s(x.ProductName) }))
    : [];
  const logs = Array.isArray(d.Logs)
    ? (d.Logs as Record<string, unknown>[]).map((l) => ({ CreatedAt: s(l.CreatedAt), NewStatusCode: Number(l.NewStatusCode), NewStatus: s(l.NewStatus) }))
    : [];
  const code = Number(o.StatusCode);
  return {
    found: true,
    matchedBy: s(d.MatchedBy),
    orderId: s(o.Id),
    statusCode: Number.isFinite(code) ? code : null,
    statusName: s(o.StatusName),
    rawStatus: s(o.Status),
    platform: s(o.CommercePlatform),
    shopName: s(o.ShopName),
    area: s(o.Location),
    orderType: s(o.SoiOrMoi),
    trackingNumber: s(o.TrackingNumber),
    createdAt: s(o.CreatedAt),
    updatedAt: s(o.UpdatedAt),
    skus,
    logs,
    picklists: Array.isArray(d.Picklists) ? (d.Picklists as Array<Record<string, unknown>>) : [],
    isInstant: typeof o.IsInstant === 'boolean' ? o.IsInstant : null,
  };
}

/** Cari satu order lewat Find Order. Tidak ditemukan → found:false (bukan error). */
export async function findOrder(keyword: string): Promise<OcsOrderInfo> {
  const { status, body } = await getJson(`/Orders/FindOrder?keyword=${encodeURIComponent(keyword)}`);
  if (status === 404 || status === 204) return normalizeFindOrder(null);
  if (status >= 400) {
    const msg = typeof body === 'string' ? body.slice(0, 160) : (body as { message?: string; Message?: string } | null)?.message ?? (body as { Message?: string } | null)?.Message ?? '';
    throw new OcsError(`OCS menjawab HTTP ${status}${msg ? `: ${msg}` : ''}`, status);
  }
  return normalizeFindOrder(body);
}

// ── OData daftar order (halaman Orders OCS) ─────────────────────────────────
export type OdataOrder = {
  Id: string; StatusCode: number; ShopName: string | null; CommercePlatform: string | null; Location: string | null;
  SoiOrMoi: string | null; IsInstant: boolean | null; PickId: string | null; TotalQtyOrder: number | null; ProductName: string | null;
  CreatedAt: string; UpdatedAt: string;
};

const ODATA_SELECT = 'Id,StatusCode,ShopName,CommercePlatform,Location,SoiOrMoi,IsInstant,PickId,TotalQtyOrder,ProductName,CreatedAt,UpdatedAt';
// OCS menolak $select dengan HTTP 500 ("Unable to cast … SelectSome", 13 Okt 2026) → tidak dipakai.
let selectSupported = false;

/** Tanggal OData v4 tanpa kutip, mis. 2026-09-30T17:00:00Z */
export const odataDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * GET /odata/DTO_Orders dengan $filter. Mengembalikan {rows, count}.
 * $select dicoba dulu (hemat data); bila OCS menolaknya, diulang tanpa $select.
 */
export async function odataOrders(filter: string, opts: { top?: number; skip?: number; count?: boolean; orderby?: string; timeoutMs?: number } = {}): Promise<{ rows: OdataOrder[]; count: number | null }> {
  const build = (withSelect: boolean) => {
    const q: string[] = [`$filter=${encodeURIComponent(filter)}`];
    if (opts.orderby) q.push(`$orderby=${encodeURIComponent(opts.orderby)}`);
    q.push(`$top=${opts.top ?? 1000}`);
    if (opts.skip) q.push(`$skip=${opts.skip}`);
    if (opts.count) q.push('$count=true');
    if (withSelect) q.push(`$select=${ODATA_SELECT}`);
    return `/odata/DTO_Orders?${q.join('&')}`;
  };
  // Daftar order OCS bisa lambat; di Vercel waktunya dibatasi pemanggil (opts.timeoutMs).
  const timeoutMs = opts.timeoutMs ?? (Number(process.env.OCS_ODATA_TIMEOUT_MS) || 60000);
  let r: { status: number; body: unknown };
  try {
    r = await getJson(build(selectSupported), timeoutMs);
  } catch (e) {
    // Ulang sekali saat timeout — hanya bila pemanggil tidak membatasi waktu.
    const isTimeout = e instanceof OcsError && /timeout/.test(e.message);
    if (!isTimeout || opts.timeoutMs !== undefined) throw e;
    r = await getJson(build(selectSupported), timeoutMs);
  }
  if (r.status >= 400 && selectSupported) { selectSupported = false; r = await getJson(build(false), timeoutMs); }
  if (r.status >= 400) throw new OcsError(`OData DTO_Orders HTTP ${r.status}: ${typeof r.body === 'string' ? r.body.slice(0, 160) : JSON.stringify(r.body).slice(0, 160)}`, r.status);
  const b = (r.body ?? {}) as Record<string, unknown>;
  const rows = (Array.isArray(b.value) ? b.value : Array.isArray((b.d as Record<string, unknown> | undefined)?.results) ? (b.d as { results: unknown[] }).results : Array.isArray(b) ? b : []) as OdataOrder[];
  const rawCount = b['@odata.count'] ?? b['odata.count'] ?? (b.d as Record<string, unknown> | undefined)?.__count;
  return { rows, count: rawCount === undefined ? null : Number(rawCount) };
}
