import { PrismaClient, PrismaClientType } from "./prisma-wasm";

const globalForPrisma = globalThis as unknown as {
  // 🛡️ FIX (tsc): النوع الصريح للعميل (PrismaClient في wasm مش class type)
  prisma: PrismaClientType | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
