import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env.config.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
