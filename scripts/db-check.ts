// M0 connectivity check: PrismaClient + PrismaPg adapter against local Supabase Postgres.
// Run: npx tsx scripts/db-check.ts
import { prisma } from "../src/db";

async function main() {
  const rows = (await prisma.$queryRaw`SELECT 1 AS ok`) as Array<{ ok: number }>;
  if (rows.length !== 1 || rows[0].ok !== 1) {
    throw new Error(`unexpected raw query result: ${JSON.stringify(rows)}`);
  }
  const userCount = await prisma.user.count();
  console.log(`db-check OK: raw SELECT 1 passed, public.users reachable (count=${userCount})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("db-check FAILED:", err);
    process.exit(1);
  });
