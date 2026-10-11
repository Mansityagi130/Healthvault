import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";
import { AuditAction, HospitalVerificationStatus, HospitalStatus, NotificationType, NotificationStatus, ProfileVerificationStatus } from "../generated/prisma/enums.js";
import { generateHospitalIdDisplay } from "../utils/id-generator.js";

const prisma = databaseClient.getClient();

export class PlatformAdminController {
  static async getHospitals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, verificationStatus } = req.query;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query filter construction
      const where: any = {};
      if (status) where.status = status as HospitalStatus;
      if (verificationStatus) where.verificationStatus = verificationStatus as HospitalVerificationStatus;

      const hospitals = await prisma.hospital.findMany({
        where,
        include: {
          memberships: {
            include: {
              user: {
                select: { id: true, email: true, phone: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      res.status(200).json(hospitals);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getHospitalDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const hospital = await prisma.hospital.findUnique({
        where: { id: hospitalId },
        include: {
          memberships: {
            include: {
              user: {
                select: { id: true, email: true, phone: true, doctorProfile: true }
              }
            }
          },
          departments: true,
          invitations: true
        }
      });

      if (!hospital) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      res.status(200).json(hospital);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async verifyHospital(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;

      const existing = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!existing) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      const hospitalIdDisplay = existing.hospitalIdDisplay || generateHospitalIdDisplay();

      const updated = await prisma.$transaction(async (tx) => {
        const h = await tx.hospital.update({
          where: { id: hospitalId },
          data: {
            verificationStatus: HospitalVerificationStatus.VERIFIED,
            status: HospitalStatus.ACTIVE,
            verifiedAt: new Date(),
            reviewedByUserId: req.user!.id,
            hospitalIdDisplay
          }
        });

        // Activate hospital admin memberships
        await tx.hospitalMembership.updateMany({
          where: { hospitalId, role: "HOSPITAL_ADMIN" },
          data: { status: "ACTIVE", verifiedAt: new Date() }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: req.user!.id,
            action: AuditAction.HOSPITAL_VERIFIED,
            targetType: "Hospital",
            targetId: hospitalId,
            metadata: { hospitalIdDisplay, verifiedAt: new Date() }
          }
        });

        return h;
      });

      // Notify hospital admin users
      const admins = await prisma.hospitalMembership.findMany({
        where: { hospitalId, role: "HOSPITAL_ADMIN" }
      });
      for (const admin of admins) {
        const notif = await prisma.notification.create({
          data: {
            userId: admin.userId,
            type: NotificationType.HOSPITAL_VERIFICATION_APPROVED,
            status: NotificationStatus.PENDING,
            payload: {
              title: "Hospital Verified",
              message: `Your hospital ${existing.name} has been verified by HealthVault Platform Admin. Hospital ID: ${hospitalIdDisplay}`,
              hospitalId,
              hospitalIdDisplay
            }
          }
        });
        await prisma.outboxEvent.create({
          data: {
            topic: "NOTIFICATION",
            payload: { notificationId: notif.id }
          }
        });
      }

      res.status(200).json({
        message: "Hospital successfully verified",
        hospital: updated
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to verify hospital" });
    }
  }

  static async rejectHospital(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        res.status(400).json({ error: "Rejection reason is required" });
        return;
      }

      const existing = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!existing) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      const updated = await prisma.hospital.update({
        where: { id: hospitalId },
        data: {
          verificationStatus: HospitalVerificationStatus.REJECTED,
          rejectionReason,
          reviewedByUserId: req.user!.id
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.HOSPITAL_REJECTED,
          targetType: "Hospital",
          targetId: hospitalId,
          metadata: { rejectionReason }
        }
      });

      const admins = await prisma.hospitalMembership.findMany({
        where: { hospitalId, role: "HOSPITAL_ADMIN" }
      });
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.userId,
            type: NotificationType.HOSPITAL_VERIFICATION_REJECTED,
            status: NotificationStatus.PENDING,
            payload: {
              title: "Hospital Verification Rejected",
              message: `Verification for ${existing.name} was rejected. Reason: ${rejectionReason}`,
              hospitalId
            }
          }
        });
      }

      res.status(200).json({
        message: "Hospital application rejected",
        hospital: updated
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to reject hospital" });
    }
  }

  static async suspendHospital(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { suspendedReason } = req.body;

      if (!suspendedReason) {
        res.status(400).json({ error: "Suspension reason is required" });
        return;
      }

      const existing = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!existing) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      const updated = await prisma.hospital.update({
        where: { id: hospitalId },
        data: {
          status: HospitalStatus.SUSPENDED,
          suspendedReason,
          reviewedByUserId: req.user!.id
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.HOSPITAL_SUSPENDED,
          targetType: "Hospital",
          targetId: hospitalId,
          metadata: { suspendedReason }
        }
      });

      res.status(200).json({
        message: "Hospital suspended successfully",
        hospital: updated
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to suspend hospital" });
    }
  }

  static async restoreHospital(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;

      const existing = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!existing) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      const updated = await prisma.hospital.update({
        where: { id: hospitalId },
        data: {
          status: HospitalStatus.ACTIVE,
          suspendedReason: null,
          reviewedByUserId: req.user!.id
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.HOSPITAL_RESTORED,
          targetType: "Hospital",
          targetId: hospitalId
        }
      });

      res.status(200).json({
        message: "Hospital restored to active status",
        hospital: updated
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to restore hospital" });
    }
  }

  static async getAuditLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              AuditAction.HOSPITAL_REGISTERED,
              AuditAction.HOSPITAL_SUBMITTED,
              AuditAction.HOSPITAL_VERIFIED,
              AuditAction.HOSPITAL_REJECTED,
              AuditAction.HOSPITAL_SUSPENDED,
              AuditAction.HOSPITAL_RESTORED,
              AuditAction.DOCTOR_INVITED,
              AuditAction.DOCTOR_INVITATION_ACCEPTED,
              AuditAction.EMAIL_VERIFIED
            ]
          }
        },
        include: {
          actor: {
            select: { id: true, email: true }
          }
        },
        orderBy: { occurredAt: "desc" },
        take: 100
      });

      res.status(200).json(auditLogs);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  }

  static async getLabs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { verificationStatus } = req.query;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query filter construction
      const where: any = {};
      if (verificationStatus) where.verificationStatus = verificationStatus;

      const labs = await prisma.lab.findMany({
        where,
        include: {
          memberships: {
            include: {
              user: {
                select: { id: true, email: true, phone: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      res.status(200).json(labs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch labs" });
    }
  }

  static async verifyLab(req: AuthRequest, res: Response): Promise<void> {
    try {
      const labId = req.params.labId as string;

      const existing = await prisma.lab.findUnique({ where: { id: labId } });
      if (!existing) {
        res.status(404).json({ error: "Laboratory not found" });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const lab = await tx.lab.update({
          where: { id: labId },
          data: {
            verificationStatus: ProfileVerificationStatus.VERIFIED
          }
        });

        await tx.labMembership.updateMany({
          where: { labId },
          data: { status: "ACTIVE" }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: req.user!.id,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema preservation
            action: AuditAction.RECORD_UPLOADED as any,
            targetType: "Lab",
            targetId: labId,
            metadata: { event: "LAB_VERIFIED", labId }
          }
        });

        return lab;
      });

      res.status(200).json({
        message: "Laboratory verified successfully",
        lab: updated
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to verify laboratory" });
    }
  }

  static async rejectLab(req: AuthRequest, res: Response): Promise<void> {
    try {
      const labId = req.params.labId as string;

      const existing = await prisma.lab.findUnique({ where: { id: labId } });
      if (!existing) {
        res.status(404).json({ error: "Laboratory not found" });
        return;
      }

      const updated = await prisma.lab.update({
        where: { id: labId },
        data: {
          verificationStatus: ProfileVerificationStatus.REJECTED
        }
      });

      res.status(200).json({
        message: "Laboratory rejected",
        lab: updated
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to reject laboratory" });
    }
  }

  static async suspendLab(req: AuthRequest, res: Response): Promise<void> {
    try {
      const labId = req.params.labId as string;

      const existing = await prisma.lab.findUnique({ where: { id: labId } });
      if (!existing) {
        res.status(404).json({ error: "Laboratory not found" });
        return;
      }

      const updated = await prisma.lab.update({
        where: { id: labId },
        data: {
          verificationStatus: ProfileVerificationStatus.REJECTED
        }
      });

      res.status(200).json({
        message: "Laboratory suspended",
        lab: updated
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to suspend laboratory" });
    }
  }
}
