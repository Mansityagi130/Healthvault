import { beforeAll } from "vitest";

function verifyTestDatabaseUrl(name: string, urlStr?: string): void {
  if (!urlStr) {
    throw new Error(`[CRITICAL SAFETY GUARD] Execution aborted! ${name} is empty or undefined.`);
  }
  try {
    const parsed = new URL(urlStr);
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!dbName.endsWith("_test") && !dbName.includes("test")) {
      throw new Error(
        `[CRITICAL SAFETY GUARD] Execution aborted! Vitest detected non-test database "${dbName}" in ${name}. Integration tests must exclusively target an isolated database ending in "_test" to prevent data loss on the main database.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("[CRITICAL SAFETY GUARD]")) {
      throw err;
    }
    throw new Error(`[CRITICAL SAFETY GUARD] Invalid ${name} URL: ${String(err)}`);
  }
}

beforeAll(() => {
  verifyTestDatabaseUrl("DATABASE_URL", process.env.DATABASE_URL);
  verifyTestDatabaseUrl("DIRECT_DATABASE_URL", process.env.DIRECT_DATABASE_URL);
});
