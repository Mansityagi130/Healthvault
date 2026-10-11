import { describe, it, expect } from "vitest";
import { validateProductionSecrets } from "../src/config/env.js";

describe("Production Secrets & Configuration Hardening Unit Tests", () => {
  it("1. Passes in development or test environment with default configs", () => {
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "development",
      });
    }).not.toThrow();

    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "test",
      });
    }).not.toThrow();
  });

  it("2. Fails in production if any required secrets are missing", () => {
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        // missing all secrets
      });
    }).toThrow("[FATAL] Missing required production configuration");

    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "a_valid_high_entropy_secret_for_access_token_32c",
        // missing refresh, mfa, db
      });
    }).toThrow("JWT_REFRESH_SECRET");
  });

  it("3. Fails in production if any secret is less than 32 characters (insufficient entropy)", () => {
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "too_short_secret",
        JWT_REFRESH_SECRET: "a_valid_high_entropy_secret_for_refresh_token_32c",
        MFA_ENCRYPTION_KEY: "a_valid_high_entropy_secret_for_mfa_encrypt_32c",
        DATABASE_URL: "postgresql://usr:strongpass12345@prod.db.internal:5432/healthvault",
      });
    }).toThrow("JWT_ACCESS_SECRET must be at least 32 characters");
  });

  it("4. Fails in production if JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical", () => {
    const sharedSecret = "a_shared_32_character_signing_key_used_for_both";
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: sharedSecret,
        JWT_REFRESH_SECRET: sharedSecret,
        MFA_ENCRYPTION_KEY: "a_valid_high_entropy_secret_for_mfa_encrypt_32c",
        DATABASE_URL: "postgresql://usr:strongpass12345@prod.db.internal:5432/healthvault",
      });
    }).toThrow("must be distinct, separate keys");
  });

  it("5. Fails in production if known development placeholders or default passwords are used", () => {
    // Development placeholder for access token
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "super_secret_access_token_key_at_least_32_chars_long",
        JWT_REFRESH_SECRET: "a_valid_high_entropy_secret_for_refresh_token_32c",
        MFA_ENCRYPTION_KEY: "a_valid_high_entropy_secret_for_mfa_encrypt_32c",
        DATABASE_URL: "postgresql://usr:strongpass12345@prod.db.internal:5432/healthvault",
      });
    }).toThrow("Prohibited development placeholder secret detected in JWT_ACCESS_SECRET");

    // Development database password placeholder
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "a_valid_high_entropy_secret_for_access_token_32c",
        JWT_REFRESH_SECRET: "a_valid_high_entropy_secret_for_refresh_token_32c",
        MFA_ENCRYPTION_KEY: "a_valid_high_entropy_secret_for_mfa_encrypt_32c",
        DATABASE_URL: "postgresql://healthvault_user:secure_dev_db_password_123@postgres:5432/healthvault",
      });
    }).toThrow("Prohibited development placeholder credential detected in DATABASE_URL");
  });

  it("6. Succeeds in production with strong, distinct, non-placeholder secrets", () => {
    expect(() => {
      validateProductionSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "9b3c4f7a1d8e2056b4c91a783e4d5f608123456789abcdef0123456789abcdef",
        JWT_REFRESH_SECRET: "1a2b3c4d5e6f708192a3b4c5d6e7f8091123456789abcdef0123456789abcdef",
        MFA_ENCRYPTION_KEY: "f0e1d2c3b4a5968778695a4b3c2d1e0f0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://app_user:Kx9#mP2$vL7@qR4!zT8@db.production.internal:5432/healthvault",
      });
    }).not.toThrow();
  });
});
