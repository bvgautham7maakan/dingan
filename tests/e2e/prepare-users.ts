import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();
(async () => {
  const passwordHash = await hash("Test1234", { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.user.updateMany({ where: { username: { not: "aneesh" } }, data: { passwordHash, mustChangePassword: false } });
  await db.$disconnect();
})();
