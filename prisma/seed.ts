import bcrypt from "bcryptjs";
import { prisma } from "../src/config/db.config.js";
import { env } from "../src/config/env.config.js";

async function main() {
  console.log("🌱 Menjalankan database seed...");

  if (env.NODE_ENV === "production") {
    throw new Error("Seed akun tidak diizinkan pada production.");
  }
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.log("ℹ️ SEED_ADMIN_EMAIL/PASSWORD tidak diatur; akun seed dilewati.");
    return;
  }

  const defaultEmail = env.SEED_ADMIN_EMAIL;
  const existingUser = await prisma.user.findUnique({
    where: { email: defaultEmail },
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: defaultEmail,
        name: "Ivan Developer",
        passwordHash,
        roles: ["owner", "dev"],
      },
    });
    console.log(`✅ Akun seed berhasil dibuat: ${user.email}`);
  } else {
    console.log(`ℹ️ User ${defaultEmail} sudah ada di database.`);
  }

  console.log("🌱 Database seed selesai.");
}

main()
  .catch((e) => {
    console.error("❌ Gagal menjalankan seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
