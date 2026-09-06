import { PrismaClient } from "@prisma/client";
import { isProd } from "@/src/lib/env";

/**
 * Single shared PrismaClient. In dev, cache it on globalThis so hot-reload /
 * repeated imports don't exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["error", "warn"],
  });

if (!isProd) globalForPrisma.prisma = prisma;
