import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://healthvault_user:build_placeholder@localhost:5432/healthvault?schema=public",
  },
});
