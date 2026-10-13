/* Seed: admin pertama + pengaturan bawaan. Aman dijalankan berulang. */
import '../scripts/load-env';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  const name = process.env.SEED_ADMIN_NAME || 'Administrator';
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    console.log(`Admin "${username}" sudah ada — dilewati.`);
  } else {
    await prisma.user.create({ data: { username, name, role: 'ADMIN', passwordHash: hashPassword(password), mustChangePassword: true } });
    console.log(`Admin dibuat: ${username} / ${password} (wajib ganti saat login pertama)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
