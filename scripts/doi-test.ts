/* Tes koneksi doi-monitor dari komputer Anda: npm run doi:test */
import './load-env';

async function main() {
  const base = (process.env.DOI_MONITOR_URL || 'https://doi-monitor.vercel.app').replace(/\/+$/, '');
  const { DOI_MONITOR_USERNAME: username, DOI_MONITOR_PASSWORD: password } = process.env;
  if (!username || !password) throw new Error('Isi DOI_MONITOR_USERNAME dan DOI_MONITOR_PASSWORD di .env');
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), redirect: 'manual' });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c?.startsWith('doi_session='));
  if (!r.ok || !cookie) throw new Error(`Login gagal (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
  console.log('✓ Login doi-monitor OK');
  const p = await fetch(`${base}/api/phase-out`, { headers: { Cookie: cookie } });
  const j = (await p.json()) as { rows?: Array<{ matchType: string; matchValue: string; skus: string | null }> };
  const rows = j.rows ?? [];
  console.log(`✓ ${rows.length} baris phase out. Contoh:`);
  for (const x of rows.slice(0, 5)) console.log(`  ${x.matchType}:${x.matchValue} → ${x.skus ?? '(tidak ada SKU cocok)'}`);
}

main().catch((e) => { console.error('✗', (e as Error).message); process.exit(1); });
