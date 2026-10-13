/* TiDB memakai collation utf8mb4_bin (peka huruf besar-kecil) secara bawaan.
 * Skrip ini mengubah semua tabel ke utf8mb4_general_ci supaya pencarian
 * "inventory" juga menemukan "Inventory". Jalankan setelah `prisma db push`,
 * dan ulangi setiap kali menambah tabel baru. */
import '../scripts/load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = "BASE TABLE"',
  );
  for (const r of rows) {
    if (r.TABLE_NAME.startsWith('_prisma')) continue;
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${r.TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
      );
      console.log('ok', r.TABLE_NAME);
    } catch (e) {
      // TiDB tidak bisa mengganti collation kolom ber-index. Tabel buatan Prisma sudah
      // utf8mb4_unicode_ci (juga tidak peka huruf besar-kecil), jadi aman dilewati.
      console.log('lewati', r.TABLE_NAME, '—', String((e as { meta?: { message?: string } }).meta?.message ?? (e as Error).message).slice(0, 90));
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
