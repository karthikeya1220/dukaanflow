import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// Prisma 7 requires a driver adapter; the client is server-only.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
