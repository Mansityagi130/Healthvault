import nodemailer from "nodemailer";
import type { Transporter, TestAccount } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

export interface PasswordResetEmailOptions {
  to: string;
  resetUrl: string;
  userName?: string;
}

export interface VerificationEmailOptions {
  to: string;
  verificationUrl: string;
  userName?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
  error?: string;
}

export interface MockEmailRecord {
  to: string;
  subject: string;
  text: string;
  html: string;
  resetUrl?: string;
  timestamp: Date;
}

export interface EmailServiceConfig {
  emailMode?: "smtp" | "ethereal" | "test" | undefined;
  nodeEnv?: "development" | "test" | "production" | undefined;
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
  smtpSecure?: boolean | undefined;
  smtpUser?: string | undefined;
  smtpPass?: string | undefined;
  smtpFrom?: string | undefined;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private etherealAccount: TestAccount | null = null;
  private inMemoryInbox: MockEmailRecord[] = [];
  private lastDeliveryResult: EmailDeliveryResult | null = null;

  constructor(private readonly configOverride?: EmailServiceConfig | undefined) {}

  public getEffectiveConfig(): {
    emailMode: "smtp" | "ethereal" | "test";
    nodeEnv: "development" | "test" | "production";
    smtpHost: string | undefined;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | undefined;
    smtpPass: string | undefined;
    smtpFrom: string;
  } {
    const nodeEnv = (this.configOverride?.nodeEnv ?? env.NODE_ENV) as "development" | "test" | "production";
    const emailMode = (this.configOverride?.emailMode ?? env.EMAIL_MODE) as "smtp" | "ethereal" | "test";
    const smtpHost = this.configOverride?.smtpHost ?? env.SMTP_HOST;
    const smtpPort = this.configOverride?.smtpPort ?? env.SMTP_PORT ?? 587;
    const smtpSecure = this.configOverride?.smtpSecure ?? env.SMTP_SECURE ?? false;
    const smtpUser = this.configOverride?.smtpUser ?? env.SMTP_USER;
    const smtpPass = this.configOverride?.smtpPass ?? env.SMTP_PASS;
    const smtpFrom = this.configOverride?.smtpFrom ?? env.SMTP_FROM;

    return {
      emailMode,
      nodeEnv,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPass,
      smtpFrom,
    };
  }

  public maskEmail(email: string): string {
    if (!email || !email.includes("@")) return "***";
    const parts = email.split("@");
    const local = parts[0] || "";
    const domain = parts[1] || "";
    const maskedLocal = local.length <= 2 
      ? (local[0] || "*") + "*" 
      : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 2));
    return `${maskedLocal}@${domain}`;
  }

  public async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    const cfg = this.getEffectiveConfig();

    // 1. Production safety: strictly requires EMAIL_MODE=smtp
    if (cfg.nodeEnv === "production" && cfg.emailMode !== "smtp") {
      throw new Error(
        `[EmailService] Prohibited EMAIL_MODE '${cfg.emailMode}' in production. Production environment strictly requires EMAIL_MODE='smtp'.`
      );
    }

    // 2. Test mode safety: permitted only in test environment
    if (cfg.emailMode === "test" && cfg.nodeEnv !== "test") {
      throw new Error(
        `[EmailService] EMAIL_MODE='test' is permitted exclusively in test execution (NODE_ENV=test). Current NODE_ENV='${cfg.nodeEnv}'.`
      );
    }

    // 3. Ethereal mode safety: forbidden in production
    if (cfg.emailMode === "ethereal" && cfg.nodeEnv === "production") {
      throw new Error(
        "[EmailService] EMAIL_MODE='ethereal' is forbidden in production environment."
      );
    }

    // MODE: SMTP
    if (cfg.emailMode === "smtp") {
      const missing: string[] = [];
      if (!cfg.smtpHost || cfg.smtpHost.trim() === "") missing.push("SMTP_HOST");
      if (!cfg.smtpUser || cfg.smtpUser.trim() === "") missing.push("SMTP_USER");
      if (!cfg.smtpPass || cfg.smtpPass.trim() === "") missing.push("SMTP_PASS");

      if (missing.length > 0) {
        throw new Error(
          `[EmailService] EMAIL_MODE is 'smtp' but missing required configuration: ${missing.join(", ")} (must be non-empty and not whitespace-only).`
        );
      }

      logger.info(`[EmailService] Initializing real SMTP transport: ${cfg.smtpHost}:${cfg.smtpPort} (secure: ${cfg.smtpSecure})`);
      this.transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpSecure,
        auth: {
          user: cfg.smtpUser,
          pass: cfg.smtpPass,
        },
      });
      return this.transporter;
    }

    // MODE: Ethereal
    if (cfg.emailMode === "ethereal") {
      try {
        logger.info("[EmailService] Initializing Ethereal test inbox...");
        this.etherealAccount = await nodemailer.createTestAccount();
        logger.info(`[EmailService] Ethereal account created: ${this.etherealAccount.user}`);

        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: this.etherealAccount.user,
            pass: this.etherealAccount.pass,
          },
        });
        return this.transporter;
      } catch (etherealErr) {
        const errorMsg = etherealErr instanceof Error ? etherealErr.message : String(etherealErr);
        logger.error(`[EmailService] Failed to initialize Ethereal test transport: ${errorMsg}`);
        // Never substitute JSON or mock transport on failure!
        throw new Error(`[EmailService] Failed to initialize Ethereal transport: ${errorMsg}`);
      }
    }

    // MODE: Test
    if (cfg.emailMode === "test") {
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      return this.transporter;
    }

    throw new Error(`[EmailService] Unsupported or invalid EMAIL_MODE: '${cfg.emailMode}'`);
  }

  public async sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<EmailDeliveryResult> {
    const { to, resetUrl, userName } = options;
    const maskedTo = this.maskEmail(to);

    const greeting = userName ? `Hello ${userName},` : "Hello,";
    const subject = "HealthVault — Reset Your Password";

    const textContent = `
${greeting}

A request was received to reset the password for your HealthVault account.

To reset your password, visit the following secure link:
${resetUrl}

This link is single-use and will expire in 1 hour.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
HealthVault Security Team
https://healthvault.local
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #0f766e; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .content { padding: 32px 28px; line-height: 1.6; }
    .btn { display: inline-block; background-color: #0f766e; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 20px 0; text-align: center; }
    .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
    .note { font-size: 13px; color: #64748b; margin-top: 20px; }
    .fallback-url { font-size: 11px; word-break: break-all; color: #0f766e; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>HealthVault</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-top: 0;">${greeting}</p>
      <p>We received a request to reset your password for your HealthVault account.</p>
      <div style="text-align: center;">
        <a href="${resetUrl}" class="btn" target="_blank">Reset Password Now</a>
      </div>
      <p class="note"><strong>Note:</strong> This link is single-use and will expire in <strong>1 hour</strong>.</p>
      <p class="note">If you did not request this, you can safely ignore this email. Your account remains secure.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Button not working? Copy and paste this URL into your browser:</p>
      <p class="fallback-url">${resetUrl}</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">HealthVault Digital Health Platform • Privacy & Security Guaranteed</p>
    </div>
  </div>
</body>
</html>
`.trim();

    try {
      const transporter = await this.getTransporter();
      const cfg = this.getEffectiveConfig();
      const mailOptions = {
        from: cfg.smtpFrom,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      };

      const info = await transporter.sendMail(mailOptions);

      // Record in in-memory list for test inspection
      this.inMemoryInbox.push({
        to,
        subject,
        text: textContent,
        html: htmlContent,
        resetUrl,
        timestamp: new Date(),
      });

      let previewUrl: string | false = false;
      if (nodemailer.getTestMessageUrl) {
        previewUrl = nodemailer.getTestMessageUrl(info);
      }

      logger.info(`[EmailService] Password reset email accepted for ${maskedTo} (MessageId: ${info.messageId})`);
      if (previewUrl) {
        logger.info(`[EmailService] Preview delivered email at: ${previewUrl}`);
      }

      const result: EmailDeliveryResult = {
        success: true,
        messageId: info.messageId,
        previewUrl,
      };
      this.lastDeliveryResult = result;
      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string })?.code || "EMAIL_DELIVERY_FAILED";
      logger.error(`[EmailService] Delivery failed for ${maskedTo}: [${errorCode}] ${errorMsg}`);

      const result: EmailDeliveryResult = {
        success: false,
        error: `[${errorCode}] ${errorMsg}`,
      };
      this.lastDeliveryResult = result;
      return result;
    }
  }

  public getInMemoryInbox(): MockEmailRecord[] {
    return [...this.inMemoryInbox];
  }

  public getLastDeliveryResult(): EmailDeliveryResult | null {
    return this.lastDeliveryResult;
  }

  public clearInbox(): void {
    this.inMemoryInbox = [];
    this.lastDeliveryResult = null;
  }

  public resetTransporter(): void {
    this.transporter = null;
    this.etherealAccount = null;
  }
}

export const emailService = new EmailService();
