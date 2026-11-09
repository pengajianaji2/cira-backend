import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatabaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationDatabaseUrl) {
  throw new Error("Set DIRECT_URL or DATABASE_URL explicitly before running Prisma commands.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: migrationDatabaseUrl,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
