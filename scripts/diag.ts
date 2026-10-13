/*
 * Diagnosa koneksi database & login:
 *   npm run diag                       → cek koneksi TiDB, database aktif, tabel, daftar user
 *   npm run diag -- admin Admin123!    → sekaligus cek apakah password itu cocok untuk user tsb
 */
import './load-env';
import { PrismaClient } from '@prisma/client';
import { verifyPassword } from '../src/lib/password';

const url = process.env.DATABASE_URL || '';
const m = url.match(/^mysql:\/\/([^:]+):([^@]*)@([^/]+)\/([^?]*)/);
console.log('DATABASE_URL →', m ? `user ${m[1]} · host ${m[3]} · database "${m[4]}" · panjang password ${m[2].length}` : '(tidak terbaca / kosong)');

const prisma = new PrismaClient();

async function main() {
  let info: Array<{ db: string; who: string }>;
  try {
    info = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db, CURRENT_USER() AS who');
  } catch (e) {
    const err = e as { errorCode?: string; message?: string };
    const code = err.errorCode || '';
    console.error('\n✗ GAGAL TERHUBUNG KE TiDB', code ? `(${code})` : '');
    console.error(String(err.message).split('\n').filter(Boolean).slice(-2).join('\n'));
    if (code === 'P1000' || /Access denied|Authentication failed/i.test(String(err.message)))
      console.error('\n→ User/password TiDB yang SALAH (bukan login aplikasi). Di TiDB Cloud: Connect → Reset password → salin password BARU ke DATABASE_URL di .env, lalu HENTIKAN (Ctrl+C) dan jalankan lagi `npm run dev`.');
    else if (code === 'P1001') console.error('\n→ Server TiDB tidak terjangkau: cek internet / host di DATABASE_URL.');
    else if (code === 'P1003') console.error('\n→ Database belum ada: jalankan query CREATE DATABASE di prisma/setup-tidb.sql.');
    process.exit(1);
  }
  console.log(`✓ Terhubung ke TiDB sebagai ${info[0]!.who}, database aktif: "${info[0]!.db}"`);

  const tables = await prisma.$queryRawUnsafe<Array<Record<string, string>>>('SHOW TABLES');
  const names = tables.map((t: Record<string, string>) => Object.values(t)[0]);
  console.log(`  Tabel (${names.length}):`, names.join(', ') || '(kosong)');
  if (!names.includes('users')) {
    console.error('\n✗ Tabel "users" tidak ada di database ini → query setup-tidb.sql kemungkinan dijalankan di database lain. Jalankan ulang dengan `USE pending_kiriman;` di baris atas, atau jalankan `npm run setup`.');
    process.exit(1);
  }
  type U = { username: string; role: string; active: boolean; passwordHash: string };
  const users: U[] = await prisma.user.findMany({ select: { username: true, role: true, active: true, passwordHash: true } });
  console.log(`  User (${users.length}):`, users.map((u) => `${u.username} [${u.role}${u.active ? '' : ', NONAKTIF'}]`).join(', ') || '(kosong)');
  if (!users.length) console.error('\n✗ Belum ada user → jalankan `npm run db:seed` (membuat admin / Admin123!).');

  const [username, password] = process.argv.slice(2);
  if (username && password) {
    const u = users.find((x) => x.username === username.toLowerCase());
    if (!u) console.error(`\n✗ User "${username}" tidak ada di database ini.`);
    else if (!u.active) console.error(`\n✗ User "${username}" NONAKTIF.`);
    else if (!u.passwordHash.startsWith('scrypt$')) console.error(`\n✗ Format passwordHash user "${username}" rusak (harus diawali "scrypt$"). Perbaiki: npm run db:passwd -- ${username} PasswordBaru`);
    else console.log(verifyPassword(password, u.passwordHash) ? `\n✓ Password cocok untuk "${username}" — login aplikasi seharusnya berhasil (restart \`npm run dev\` bila .env baru diubah).` : `\n✗ Password TIDAK cocok untuk "${username}". Atur ulang: npm run db:passwd -- ${username} PasswordBaru`);
  }
}

main().finally(() => prisma.$disconnect());
