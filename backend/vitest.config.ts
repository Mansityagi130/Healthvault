import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_TEST_URL || "postgresql://healthvault_user:secure_dev_db_password_123@127.0.0.1:5432/healthvault_test",
      DIRECT_DATABASE_URL: process.env.DATABASE_TEST_URL || "postgresql://healthvault_user:secure_dev_db_password_123@127.0.0.1:5432/healthvault_test",
    },
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    maxConcurrency: 1,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    hookTimeout: 120000,
    testTimeout: 60000,
  },
});
