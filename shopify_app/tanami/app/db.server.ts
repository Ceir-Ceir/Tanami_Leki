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
  prisma = new PrismaClient({ adapter: adapter }); // Explicitly pass the adapter
} else {
  if (!global.__db__) {
    // In dev, we also pass the adapter to the constructor
    global.__db__ = new PrismaClient({ adapter: adapter });
  }
  prisma = global.__db__;
  // Ensure the dev server doesn't crash on hot-reloads
  prisma.$connect();
}

export default prisma;
