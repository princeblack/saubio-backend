import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  const tables = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';`;

  if (!tables.length) {
    console.log('No user tables detected, nothing to truncate.');
    return;
  }

  const tableNames = tables.map((table) => `"${table.tablename}"`).join(', ');
  console.log(`Truncating tables: ${tableNames}`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  console.log('Database reset complete.');
}

resetDatabase()
  .catch((error) => {
    console.error('Failed to reset database', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
