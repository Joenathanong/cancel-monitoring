/* Reset password user dari CLI: npm run db:passwd -- username PasswordBaru */
import '../scripts/load-env';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Pakai: npm run db:passwd -- username PasswordBaru');
    process.exit(1);
  }
  await prisma.user.update({
    where: { username: username.toLowerCase() },
    data: { passwordHash: hashPassword(password), mustChangePassword: true, sessionVersion: { increment: 1 }, active: true },
  });
  console.log('Password diganti untuk', username);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
