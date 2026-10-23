import { db } from "@/lib/db";

/** Empties every table (children first) so each DB test file starts clean. */
export async function resetDb() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%'",
  );
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const t of tables) await db.$executeRawUnsafe(`DELETE FROM "${t.name}"`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}
