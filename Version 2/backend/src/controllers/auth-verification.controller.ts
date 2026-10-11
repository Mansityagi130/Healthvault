import type { Request, Response } from "express";
import { databaseClient } from "../config/database.js";
import { AuditAction, AccountStatus, NotificationType, NotificationStatus } from "../generated/prisma/enums.js";
import crypto from "crypto";
import { generatePatientIdDisplay } from "../utils/id-generator.js";

const prisma = databaseClient.getClient();

export class AuthVerificationController {
  
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const rawToken = (req.query.token || req.body.token) as string;
      if (!rawToken) {
        res.status(400).json({ error: "Verification token is required" });
        return;
      }

      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const record = await prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { patientProfile: true } } }
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        res.status(400).json({ error: "Invalid or expired verification token" });
        return;
      }

      const patientIdDisplay = record.user.patientProfile?.patientIdDisplay || generatePatientIdDisplay();

      await prisma.$transaction(async (tx) => {
        // Mark token used
        await tx.emailVerificationToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() }
        });

        // Activate user
        await tx.user.update({
          where: { id: record.userId },
          data: {
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            status: AccountStatus.ACTIVE
          }
        });

        // Update PatientProfile display ID
        if (record.user.patientProfile) {
          await tx.patientProfile.update({
            where: { id: record.user.patientProfile.id },
            data: { patientIdDisplay }
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: record.userId,
            action: AuditAction.EMAIL_VERIFIED,
            metadata: { email: record.user.email, patientIdDisplay }
          }
        });
      });

      res.status(200).json({
        message: "Email verified successfully. Your HealthVault account is now ACTIVE.",
        patientIdDisplay
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to verify email" });
    }
  }

  static async resendVerificationEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        // Return 200 to prevent user enumeration
        res.status(200).json({ message: "If account exists, verification email has been resent." });
        return;
      }

      if (user.isEmailVerified) {
        res.status(400).json({ error: "Email is already verified" });
        return;
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Invalidate old tokens
      await prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { expiresAt: new Date() }
      });

      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: AuditAction.EMAIL_VERIFICATION_REQUESTED
        }
      });

      const verificationUrl = `/verify-email?token=${rawToken}`;
      await prisma.outboxEvent.create({
        data: {
          topic: "NOTIFICATION",
          payload: {
            type: NotificationType.EMAIL_VERIFICATION,
            userId: user.id,
            email: user.email,
            verificationUrl
          }
        }
      });

      res.status(200).json({
        message: "Verification email resent successfully.",
        verificationToken: rawToken, // For test & dev logging
        verificationUrl
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  }
}
