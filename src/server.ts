import app from "./app.js";
import { env } from "./config/env.config.js";
import { prisma } from "./config/db.config.js";

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Cira PM Backend aktif di http://localhost:${env.PORT}`);
  console.log(`📡 API Base URL: http://localhost:${env.PORT}/api/v1`);
});

let shuttingDown = false;
const shutdown = async (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n🛑 Menutup koneksi server dan database...");
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(async (error) => {
    if (error) {
      console.error("Gagal menutup HTTP server:", error);
      exitCode = 1;
    }
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error("Gagal menutup koneksi database:", disconnectError);
      exitCode = 1;
    }
    clearTimeout(forceExit);
    process.exit(exitCode);
  });
};

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));
process.once("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  void shutdown(1);
});
