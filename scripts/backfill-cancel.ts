/*
 * Backfill Monitoring Cancel dari komputer Anda (tanpa batas waktu Vercel):
 *   npm run backfill:cancel                     → mulai dari "Tanggal mulai" di Pengaturan (bawaan 2026-10-01)
 *   npm run backfill:cancel -- --from 2026-09-01 → ubah tanggal mulai lalu tarik dari sana
 *   npm run backfill:cancel -- --detail-only    → hanya buka log yang belum dicek
 * Aman dihentikan (Ctrl+C) dan dijalankan ulang — lanjut dari posisi terakhir.
 */
import './load-env';
import { syncCancelList, syncCancelDetail } from '../src/server/cancel-sync';
import { setSettings, setInternal } from '../src/lib/settings';
import { prisma } from '../src/lib/prisma';

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('--from harus YYYY-MM-DD');
    await setSettings({ cancel_start_date: from });
    await setInternal('cancel_list_cursor', '');
    console.log(`Tanggal mulai diatur ke ${from}`);
  }
  if (!args.includes('--detail-only')) {
    console.log('1/2 Menarik daftar order CANCELLED dari OCS …');
    let fails = 0;
    for (let i = 1; ; i++) {
      const r = await syncCancelList({ trigger: 'backfill', budgetMs: 120000 });
      console.log(`  [${i}] ${r.message}`);
      if (!r.ok) {
        // OCS kadang lambat/timeout — posisi sudah tersimpan, tunggu sebentar lalu lanjut
        if (++fails > 5) throw new Error(`${r.message} (gagal 5x berturut-turut — coba lagi nanti)`);
        console.log(`      ↻ coba lagi dalam ${fails * 10} detik …`);
        await new Promise((res) => setTimeout(res, fails * 10000));
        continue;
      }
      fails = 0;
      if (r.done) break;
    }
  }
  console.log('2/2 Membuka log order yang mungkin kesalahan gudang …');
  for (let i = 1; ; i++) {
    const r = await syncCancelDetail({ trigger: 'backfill', limit: 200, budgetMs: 120000 });
    console.log(`  [${i}] ${r.message}`);
    if (!r.ok && r.processed === 0) throw new Error(r.message);
    if (r.done || r.processed === 0) break;
  }
  const total = await prisma.cancelOrder.count();
  console.log(`Selesai. ${total} order cancel tersimpan.`);
}

main()
  .catch((e) => { console.error('✗', (e as Error).message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
