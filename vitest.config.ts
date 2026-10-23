import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/unit/empty.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/unit/setup-db.ts"],
    env: { DATABASE_URL: "file:../data/test-unit.db" },
  },
});
