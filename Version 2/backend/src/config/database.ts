import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const { Pool } = pg;

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

export class DatabaseConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export const createPrismaClient = (connectionString: string): PrismaClient => {
  // Implement connection pool guardrails for 26B.7 Database Reliability
  const pool = new Pool({
    connectionString,
    max: 20, // Connection limits
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000, // 30 seconds to accommodate remote DB (Neon) cold-start, pooler latency, and TLS handshakes
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  pool.on("error", (err) => {
    logger.error("Unexpected error on idle PostgreSQL client", { error: err.message });
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
};

class PrismaDatabaseClient {
  private client: PrismaClient | undefined;

  public getClient(): PrismaClient {
    if (this.client) {
      return this.client;
    }

    if (!env.DATABASE_URL) {
      throw new DatabaseConfigurationError("DATABASE_URL is not configured.");
    }

    if (env.NODE_ENV === "test") {
      try {
        const parsed = new URL(env.DATABASE_URL);
        const dbName = parsed.pathname.replace(/^\//, "");
        if (!dbName.endsWith("_test") && !dbName.includes("test")) {
          throw new DatabaseConfigurationError(
            `[CRITICAL SAFETY GUARD] Refusing to connect to non-test database "${dbName}" in test environment! Tests must target a test database ending in "_test".`
          );
        }
      } catch (err: unknown) {
        if (err instanceof DatabaseConfigurationError) throw err;
      }
    }

    this.client = createPrismaClient(env.DATABASE_URL);
    return this.client;
  }

  public async disconnect(): Promise<void> {
    await this.client?.$disconnect();
    this.client = undefined;
  }
}

export const databaseClient = new PrismaDatabaseClient();
