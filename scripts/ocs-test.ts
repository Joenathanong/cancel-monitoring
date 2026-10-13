/*
 * Tes koneksi OCS dari komputer Anda (tanpa database):
 *   npm run ocs:test -- <OrderID>
 * Login memakai OCS_* di .env, lalu memanggil Find Order dan mencetak hasilnya.
 */
import './load-env';

async function main() {
  const base = (process.env.OCS_BASE_URL || 'https://ocs.iegsystem.id').replace(/\/+$/, '');
  const { OCS_USERNAME: username, OCS_PASSWORD: password } = process.env;
  const companydb = process.env.OCS_COMPANY_DB || 'EJI_WMS';
  const orderId = process.argv[2];
  if (!username || !password) throw new Error('Isi OCS_USERNAME dan OCS_PASSWORD di .env');
  console.log(`Login ke ${base} sebagai ${username} (${companydb}) …`);
  const r = await fetch(`${base}/Auth/Login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, companydb }) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const token = (j.Token ?? j.token ?? (j.data as Record<string, unknown> | undefined)?.Token) as string | undefined;
  if (!r.ok || !token) throw new Error(`Login gagal (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 200)}`);
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString());
  console.log(`✓ Login OK — role ${payload.ROLE_CODE}, area ${JSON.stringify(payload.AREAS)}`);
  if (!orderId) { console.log('Tambahkan Order ID untuk mencoba Find Order: npm run ocs:test -- 2704148346952818'); return; }
  const f = await fetch(`${base}/Orders/FindOrder?keyword=${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await f.json().catch(() => null)) as Record<string, unknown> | null;
  const d = (body && ('Order' in body ? body : (body.data as Record<string, unknown>))) as Record<string, unknown> | null;
  const o = d?.Order as Record<string, unknown> | undefined;
  if (!o) { console.log(`HTTP ${f.status} — order tidak ditemukan.`, JSON.stringify(body).slice(0, 300)); return; }
  console.log(`✓ ${o.Id}: ${o.StatusName} (${o.StatusCode}) · ${o.ShopName} · ${o.CommercePlatform} · area ${o.Location}`);
  console.log('  SKU:', ((d!.Skus as Record<string, unknown>[]) ?? []).map((s) => `${s.SellerSku} × ${s.Qty}`).join(', '));
  console.log('  Log:', ((d!.Logs as Record<string, unknown>[]) ?? []).map((l) => `${l.NewStatus}@${String(l.CreatedAt).slice(0, 16)}`).join(' → '));
}

main().catch((e) => { console.error('✗', (e as Error).message); process.exit(1); });
