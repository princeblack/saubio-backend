import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main() {
  const prisma = new PrismaClient();
  const email = 'admin@saubio.de';
  const password = 'Africadmc01';
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User already exists: ${email}`);
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Saubio',
        lastName: 'Admin',
        preferredLocale: 'de',
        roles: [UserRole.ADMIN],
        hashedPassword,
      },
    });
    console.log(`Created admin user ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
