import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

let prisma: PrismaClient;

declare global {
  var __db__: PrismaClient | undefined;
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in your .env file");
}

// Setup the Postgres driver
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({ adapter });
} else {
  if (!global.__db__) {
    // We pass the adapter here to satisfy Prisma 7's new requirements
    global.__db__ = new PrismaClient({ adapter });
  }
  prisma = global.__db__;
}

export default prisma;
