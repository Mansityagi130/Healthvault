import "dotenv/config";
import { z } from "zod";

export const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "Must be at least 32 chars").optional(),
  JWT_REFRESH_SECRET: z.string().min(32, "Must be at least 32 chars").optional(),
  JWT_ISSUER: z.string().default("healthvault-auth"),
  JWT_AUDIENCE: z.string().default("healthvault-users"),
  STORAGE_PATH: z.string().default("./storage"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  MFA_ENCRYPTION_KEY: z.string().min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters long").optional(),
  EMAIL_MODE: z.enum(["smtp", "ethereal", "test"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional().default(587),
  SMTP_SECURE: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("HealthVault Security <no-reply@healthvault.local>"),
});

export function validateEmailConfig(cfg: {
  NODE_ENV: "development" | "test" | "production";
  EMAIL_MODE?: "smtp" | "ethereal" | "test" | undefined;
  SMTP_HOST?: string | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
}): void {
  // Validate supported enum values
  if (cfg.EMAIL_MODE && !["smtp", "ethereal", "test"].includes(cfg.EMAIL_MODE)) {
    throw new Error(`Invalid EMAIL_MODE '${cfg.EMAIL_MODE}'. Must be one of: 'smtp', 'ethereal', 'test'.`);
  }

  // In production, EMAIL_MODE is required and must be 'smtp'
  if (cfg.NODE_ENV === "production") {
    if (!cfg.EMAIL_MODE) {
      throw new Error("Missing required production configuration: EMAIL_MODE (production strictly requires explicit EMAIL_MODE=smtp)");
    }
    if (cfg.EMAIL_MODE !== "smtp") {
      throw new Error(`EMAIL_MODE='${cfg.EMAIL_MODE}' is prohibited in production. Production strictly requires explicit EMAIL_MODE=smtp.`);
    }
  }

  // Ethereal is strictly prohibited in production
  if (cfg.EMAIL_MODE === "ethereal" && cfg.NODE_ENV === "production") {
    throw new Error("EMAIL_MODE='ethereal' is prohibited in production.");
  }

  // Test mode is permitted exclusively in test execution
  if (cfg.EMAIL_MODE === "test" && cfg.NODE_ENV !== "test") {
    throw new Error("EMAIL_MODE='test' is permitted exclusively in test execution (NODE_ENV=test).");
  }

  // In SMTP mode, reject missing or whitespace-only SMTP_HOST, SMTP_USER, and SMTP_PASS
  if (cfg.EMAIL_MODE === "smtp") {
    const missing: string[] = [];
    if (!cfg.SMTP_HOST || cfg.SMTP_HOST.trim() === "") missing.push("SMTP_HOST");
    if (!cfg.SMTP_USER || cfg.SMTP_USER.trim() === "") missing.push("SMTP_USER");
    if (!cfg.SMTP_PASS || cfg.SMTP_PASS.trim() === "") missing.push("SMTP_PASS");
    if (missing.length > 0) {
      throw new Error(`EMAIL_MODE is set to 'smtp' but missing required configuration: ${missing.join(', ')} (must be non-empty and not whitespace-only)`);
    }
  }
}

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
  const missingVars = parsedEnvironment.error.issues.map((e: any) => e.path.join('.')).join(', ');
  console.error(`[FATAL] Missing or invalid configuration variables: ${missingVars}`);
  process.exit(1);
}

const config = parsedEnvironment.data;

// Resolve non-production default EMAIL_MODE if not provided:
// In test: defaults to 'test'
// In development: defaults to 'ethereal'
// In production: must be explicitly provided, otherwise validateEmailConfig throws
if (!config.EMAIL_MODE) {
  if (config.NODE_ENV === "test") {
    config.EMAIL_MODE = "test";
  } else if (config.NODE_ENV === "development") {
    config.EMAIL_MODE = "ethereal";
  }
}

try {
  validateEmailConfig(config);
} catch (err: unknown) {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

export const PROHIBITED_PLACEHOLDER_SECRETS = [
  "super_secret_access_token_key_at_least_32_chars_long",
  "super_secret_refresh_token_key_at_least_32_chars_long",
  "super_secret_mfa_encryption_key_at_least_32_chars_long",
  "fallback_access_secret_for_dev_only_32_chars_min",
  "fallback_refresh_secret_for_dev_only_32_chars_min",
  "fallback_mfa_encryption_key_for_dev_only_32_chars_min",
  "secure_dev_db_password_123",
  "password123",
  "changeme",
  "change_me",
  "default_secret",
  "test_secret",
];

export function validateProductionSecrets(cfg: {
  NODE_ENV: string;
  JWT_ACCESS_SECRET?: string | undefined;
  JWT_REFRESH_SECRET?: string | undefined;
  MFA_ENCRYPTION_KEY?: string | undefined;
  DATABASE_URL?: string | undefined;
}): void {
  if (cfg.NODE_ENV !== "production") return;

  const missingProd: string[] = [];
  if (!cfg.JWT_ACCESS_SECRET || cfg.JWT_ACCESS_SECRET.trim() === "") missingProd.push("JWT_ACCESS_SECRET");
  if (!cfg.JWT_REFRESH_SECRET || cfg.JWT_REFRESH_SECRET.trim() === "") missingProd.push("JWT_REFRESH_SECRET");
  if (!cfg.MFA_ENCRYPTION_KEY || cfg.MFA_ENCRYPTION_KEY.trim() === "") missingProd.push("MFA_ENCRYPTION_KEY");
  if (!cfg.DATABASE_URL || cfg.DATABASE_URL.trim() === "") missingProd.push("DATABASE_URL");

  if (missingProd.length > 0) {
    throw new Error(`[FATAL] Missing required production configuration: ${missingProd.join(', ')}`);
  }

  // Length checks (minimum 32 characters for 256-bit cryptographic entropy)
  if (cfg.JWT_ACCESS_SECRET!.length < 32) {
    throw new Error("[FATAL] JWT_ACCESS_SECRET must be at least 32 characters in production.");
  }
  if (cfg.JWT_REFRESH_SECRET!.length < 32) {
    throw new Error("[FATAL] JWT_REFRESH_SECRET must be at least 32 characters in production.");
  }
  if (cfg.MFA_ENCRYPTION_KEY!.length < 32) {
    throw new Error("[FATAL] MFA_ENCRYPTION_KEY must be at least 32 characters in production.");
  }

  // Key separation check
  if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
    throw new Error("[FATAL] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct, separate keys in production.");
  }

  // Prohibited placeholder checks
  for (const placeholder of PROHIBITED_PLACEHOLDER_SECRETS) {
    const p = placeholder.toLowerCase();
    if (cfg.JWT_ACCESS_SECRET!.toLowerCase().includes(p)) {
      throw new Error(`[FATAL] Prohibited development placeholder secret detected in JWT_ACCESS_SECRET for production. Production startup aborted.`);
    }
    if (cfg.JWT_REFRESH_SECRET!.toLowerCase().includes(p)) {
      throw new Error(`[FATAL] Prohibited development placeholder secret detected in JWT_REFRESH_SECRET for production. Production startup aborted.`);
    }
    if (cfg.MFA_ENCRYPTION_KEY!.toLowerCase().includes(p)) {
      throw new Error(`[FATAL] Prohibited development placeholder secret detected in MFA_ENCRYPTION_KEY for production. Production startup aborted.`);
    }
    if (cfg.DATABASE_URL && cfg.DATABASE_URL.toLowerCase().includes(p)) {
      throw new Error(`[FATAL] Prohibited development placeholder credential detected in DATABASE_URL for production. Production startup aborted.`);
    }
  }
}

if (config.NODE_ENV === "production") {
  try {
    validateProductionSecrets(config);
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
} else {
  // Safe fallbacks for local dev only
  config.JWT_ACCESS_SECRET = config.JWT_ACCESS_SECRET || "fallback_access_secret_for_dev_only_32_chars_min";
  config.JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET || "fallback_refresh_secret_for_dev_only_32_chars_min";
  config.MFA_ENCRYPTION_KEY = config.MFA_ENCRYPTION_KEY || "fallback_mfa_encryption_key_for_dev_only_32_chars_min";
}

export const env = {
  ...config,
  EMAIL_MODE: config.EMAIL_MODE as "smtp" | "ethereal" | "test",
  JWT_ACCESS_SECRET: config.JWT_ACCESS_SECRET as string,
  JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET as string,
  MFA_ENCRYPTION_KEY: config.MFA_ENCRYPTION_KEY as string,
};
