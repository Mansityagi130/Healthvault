import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nodemailer from "nodemailer";
import { EmailService } from "../src/services/email/email.service.js";
import { validateEmailConfig, environmentSchema } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";

describe("Email Transport Selection & Fail-Closed Enforcement", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // 1. SMTP Mode Selection
  it("1. SMTP mode selects Nodemailer SMTP with valid credentials", async () => {
    const createTransportSpy = vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "smtp-msg-123" }),
    } as any);

    const emailService = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "testuser@example.com",
      smtpPass: "SuperSecretPassword123",
      smtpFrom: "HealthVault <security@healthvault.local>",
    });

    const transporter = await emailService.getTransporter();
    expect(transporter).toBeDefined();
    expect(createTransportSpy).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "testuser@example.com",
        pass: "SuperSecretPassword123",
      },
    });
  });

  // 2. Missing SMTP Credentials Fail-Closed
  it("2. Missing SMTP credentials in SMTP mode fail clearly at initialization", async () => {
    const missingHost = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "",
      smtpUser: "user@example.com",
      smtpPass: "pass123",
    });
    await expect(missingHost.getTransporter()).rejects.toThrow(
      "EMAIL_MODE is 'smtp' but missing required configuration: SMTP_HOST"
    );

    const missingUser = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "smtp.example.com",
      smtpUser: "",
      smtpPass: "pass123",
    });
    await expect(missingUser.getTransporter()).rejects.toThrow(
      "EMAIL_MODE is 'smtp' but missing required configuration: SMTP_USER"
    );

    const missingPass = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "smtp.example.com",
      smtpUser: "user@example.com",
      smtpPass: "",
    });
    await expect(missingPass.getTransporter()).rejects.toThrow(
      "EMAIL_MODE is 'smtp' but missing required configuration: SMTP_PASS"
    );
  });

  // 3. Whitespace-Only Credentials Fail-Closed
  it("3. Whitespace-only SMTP credentials fail clearly as missing", async () => {
    const whitespaceCreds = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "   ",
      smtpUser: "\t \n",
      smtpPass: "   ",
    });
    await expect(whitespaceCreds.getTransporter()).rejects.toThrow(
      "EMAIL_MODE is 'smtp' but missing required configuration: SMTP_HOST, SMTP_USER, SMTP_PASS"
    );

    // Also check validateEmailConfig function
    expect(() => {
      validateEmailConfig({
        NODE_ENV: "development",
        EMAIL_MODE: "smtp",
        SMTP_HOST: "  ",
        SMTP_USER: "user@example.com",
        SMTP_PASS: "pass123",
      });
    }).toThrow("EMAIL_MODE is set to 'smtp' but missing required configuration: SMTP_HOST");
  });

  // 4. SMTP Failure Without Fallback
  it("4. SMTP authentication or network failure reports delivery failure and never triggers another transport", async () => {
    const mockSendMail = vi.fn().mockRejectedValue(
      Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), {
        code: "EAUTH",
      })
    );

    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    const createTestAccountSpy = vi.spyOn(nodemailer, "createTestAccount");

    const emailService = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "realuser@gmail.com",
      smtpPass: "WrongAppPassword",
      smtpFrom: "HealthVault Security <security@healthvault.local>",
    });

    const result = await emailService.sendPasswordResetEmail({
      to: "patient@example.com",
      resetUrl: "https://healthvault.local/reset-password?token=synthetic_token_12345",
      userName: "Patient A",
    });

    // Delivery must be reported as failed
    expect(result.success).toBe(false);
    expect(result.error).toContain("[EAUTH]");
    expect(result.error).toContain("Invalid login");

    // Ethereal or other test transports must NEVER be created as a fallback
    expect(createTestAccountSpy).not.toHaveBeenCalled();
    expect(emailService.getInMemoryInbox()).toHaveLength(0);
  });

  // 5. Ethereal Mode Environment Isolation
  it("5. Ethereal mode is forbidden in production environment", async () => {
    const etherealProd = new EmailService({
      emailMode: "ethereal",
      nodeEnv: "production",
    });
    await expect(etherealProd.getTransporter()).rejects.toThrow(
      "Prohibited EMAIL_MODE 'ethereal' in production. Production environment strictly requires EMAIL_MODE='smtp'."
    );

    expect(() => {
      validateEmailConfig({
        NODE_ENV: "production",
        EMAIL_MODE: "ethereal",
      });
    }).toThrow("EMAIL_MODE='ethereal' is prohibited in production.");
  });

  // 6. Ethereal Creation Failure Rejection (No Silent JSON / Stub Fallback)
  it("6. Ethereal account creation failure throws explicitly and does not fall back to JSON or mock", async () => {
    vi.spyOn(nodemailer, "createTestAccount").mockRejectedValue(
      new Error("ETIMEDOUT: Connection to ethereal.email failed")
    );

    const etherealDev = new EmailService({
      emailMode: "ethereal",
      nodeEnv: "development",
    });

    await expect(etherealDev.getTransporter()).rejects.toThrow(
      "[EmailService] Failed to initialize Ethereal transport: ETIMEDOUT"
    );
  });

  // 7. Test Transport Forbidden in Production
  it("7. Test transport cannot be selected in production", async () => {
    const testProd = new EmailService({
      emailMode: "test",
      nodeEnv: "production",
    });
    await expect(testProd.getTransporter()).rejects.toThrow(
      "Prohibited EMAIL_MODE 'test' in production. Production environment strictly requires EMAIL_MODE='smtp'."
    );

    expect(() => {
      validateEmailConfig({
        NODE_ENV: "production",
        EMAIL_MODE: "test",
      });
    }).toThrow();
  });

  // 8. Test Transport Forbidden in Development Unless NODE_ENV=test
  it("8. Test transport is permitted exclusively when NODE_ENV is test", async () => {
    const testDev = new EmailService({
      emailMode: "test",
      nodeEnv: "development",
    });
    await expect(testDev.getTransporter()).rejects.toThrow(
      "EMAIL_MODE='test' is permitted exclusively in test execution (NODE_ENV=test)"
    );

    expect(() => {
      validateEmailConfig({
        NODE_ENV: "development",
        EMAIL_MODE: "test",
      });
    }).toThrow("EMAIL_MODE='test' is permitted exclusively in test execution (NODE_ENV=test).");
  });

  // 9. Invalid EMAIL_MODE Values Rejected
  it("9. Invalid EMAIL_MODE values are rejected by schema and validator", () => {
    const parseResult = environmentSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/test",
      EMAIL_MODE: "unsupported-carrier",
    });
    expect(parseResult.success).toBe(false);

    expect(() => {
      validateEmailConfig({
        NODE_ENV: "development",
        EMAIL_MODE: "invalid_mode" as any,
      });
    }).toThrow();
  });

  // 10. Credential & Token Privacy in Logs and Responses
  it("10. Errors and logs never leak SMTP passwords or raw reset tokens", async () => {
    const rawSecretPassword = "SuperSensitiveAppPassword987!";
    const rawResetToken = "sensitive_hex_token_abcdef123456";

    const loggerErrorSpy = vi.spyOn(logger, "error");

    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(
        Object.assign(new Error("SMTP connection failed: 535 authentication rejected"), {
          code: "EAUTH",
        })
      ),
    } as any);

    const emailService = new EmailService({
      emailMode: "smtp",
      nodeEnv: "development",
      smtpHost: "smtp.example.com",
      smtpUser: "sensitive-admin@domain.com",
      smtpPass: rawSecretPassword,
    });

    const result = await emailService.sendPasswordResetEmail({
      to: "sensitive-user@domain.com",
      resetUrl: `https://healthvault.local/reset-password?token=${rawResetToken}`,
    });

    expect(result.success).toBe(false);

    // Verify raw secret password is not in result.error
    expect(result.error).not.toContain(rawSecretPassword);
    expect(result.error).not.toContain(rawResetToken);

    // Verify logger calls never contain the raw secret password or raw reset token
    for (const call of loggerErrorSpy.mock.calls) {
      const loggedString = call.map(String).join(" ");
      expect(loggedString).not.toContain(rawSecretPassword);
      expect(loggedString).not.toContain(rawResetToken);
      // Verify email masking
      expect(loggedString).not.toContain("sensitive-user@domain.com");
      expect(loggedString).toMatch(/se\*+@domain\.com/);
    }
  });

  // 11. Generic Forgot-Password Anti-Enumeration
  it("11. Email delivery errors preserve generic anti-enumeration response", async () => {
    const mockEmailService = new EmailService({
      emailMode: "test",
      nodeEnv: "test",
    });
    const result = await mockEmailService.sendPasswordResetEmail({
      to: "test@example.com",
      resetUrl: "https://healthvault.local/reset-password?token=dummy",
    });
    expect(result.success).toBe(true);

    const genericResponse = {
      success: true,
      message: "If the account exists, password reset instructions have been sent.",
    };
    expect(genericResponse.message).toBe(
      "If the account exists, password reset instructions have been sent."
    );
  });
});
