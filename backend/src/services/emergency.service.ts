import { databaseClient } from "../config/database.js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { 
  AuditAction, 
  AccessAction, 
  AccessOutcome, 
  QRUsageMode,
  NotificationType,
  EncounterType,
  EncounterStatus
} from "../generated/prisma/enums.js";
import { notificationService } from "./notification.service.js";

const prisma = databaseClient.getClient();

export class EmergencyService {
  /**
   * Fetch patient emergency profile
   */
  static async getProfile(userId: string) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    let emergency = await prisma.emergencyProfile.findUnique({
      where: { patientId: patientProfile.id },
      include: {
        accessTokens: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } }
        }
      }
    });

    if (!emergency) {
      emergency = await prisma.emergencyProfile.create({
        data: {
          patientId: patientProfile.id,
          isActive: true
        },
        include: {
          accessTokens: true
        }
      });
    }

    return emergency;
  }

  /**
   * Update patient emergency profile
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateProfile(userId: string, data: any) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    const updated = await prisma.emergencyProfile.upsert({
      where: { patientId: patientProfile.id },
      update: {
        bloodGroup: data.bloodGroup !== undefined ? data.bloodGroup : undefined,
        allergies: data.allergies !== undefined ? data.allergies : undefined,
        emergencyMedications: data.emergencyMedications !== undefined ? data.emergencyMedications : undefined,
        criticalConditions: data.criticalConditions !== undefined ? data.criticalConditions : undefined,
        emergencyContact: data.emergencyContact !== undefined ? data.emergencyContact : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      },
      create: {
        patientId: patientProfile.id,
        bloodGroup: data.bloodGroup,
        allergies: data.allergies,
        emergencyMedications: data.emergencyMedications,
        criticalConditions: data.criticalConditions,
        emergencyContact: data.emergencyContact,
        isActive: data.isActive ?? true,
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: AuditAction.EMERGENCY_PROFILE_UPDATED,
        targetType: "EmergencyProfile",
        targetId: updated.id
      }
    });

    return updated;
  }

  /**
   * Generate an emergency access QR token
   */
  static async generateEmergencyQr(userId: string, durationHours: number = 24, maxUses?: number) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    const emergency = await this.getProfile(userId);

    const selector = uuidv4();
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    const tokenRecord = await prisma.emergencyProfileAccessToken.create({
      data: {
        emergencyProfileId: emergency.id,
        selector,
        tokenHash,
        usageMode: maxUses === 1 ? QRUsageMode.ONE_TIME : QRUsageMode.CONTROLLED_REUSE,
        maxUses: maxUses || null,
        expiresAt
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: AuditAction.EMERGENCY_QR_CREATED,
        targetType: "EmergencyProfileAccessToken",
        targetId: tokenRecord.id
      }
    });

    return {
      selector,
      token: rawSecret,
      expiresAt,
      usageMode: tokenRecord.usageMode
    };
  }

  /**
   * List active emergency QR tokens for patient
   */
  static async listEmergencyQrs(userId: string) {
    const emergency = await this.getProfile(userId);
    return prisma.emergencyProfileAccessToken.findMany({
      where: {
        emergencyProfileId: emergency.id,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /**
   * Revoke emergency QR token
   */
  static async revokeEmergencyQr(userId: string, selector: string) {
    const emergency = await this.getProfile(userId);

    const token = await prisma.emergencyProfileAccessToken.findUnique({
      where: { selector }
    });

    if (!token || token.emergencyProfileId !== emergency.id) {
      throw new Error("Emergency token not found");
    }

    await prisma.emergencyProfileAccessToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: AuditAction.EMERGENCY_QR_REVOKED,
        targetType: "EmergencyProfileAccessToken",
        targetId: token.id
      }
    });

    return { success: true };
  }

  /**
   * Resolve emergency access (Provider / Emergency Break-Glass)
   */
  static async resolveEmergencyAccess(
    providerUserId: string,
    selector: string,
    rawSecret: string,
    reason: string
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new Error("Reason for emergency access must be at least 5 characters long");
    }

    const tokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    const now = new Date();

    const tokenRecord = await prisma.emergencyProfileAccessToken.findUnique({
      where: { selector },
      include: {
        emergencyProfile: {
          include: {
            patient: { include: { user: true } }
          }
        }
      }
    });

    if (!tokenRecord || tokenRecord.tokenHash !== tokenHash) {
      await prisma.auditLog.create({
        data: {
          actorUserId: providerUserId,
          action: AuditAction.EMERGENCY_ACCESS_DENIED,
          metadata: { reason: "Invalid token or selector" }
        }
      });
      throw new Error("Invalid or expired emergency access QR token.");
    }

    if (tokenRecord.revokedAt || tokenRecord.expiresAt < now) {
      await prisma.auditLog.create({
        data: {
          actorUserId: providerUserId,
          action: AuditAction.EMERGENCY_ACCESS_DENIED,
          targetType: "EmergencyProfileAccessToken",
          targetId: tokenRecord.id,
          metadata: { reason: "Expired or revoked token" }
        }
      });
      throw new Error("Invalid or expired emergency access QR token.");
    }

    if (tokenRecord.maxUses && tokenRecord.useCount >= tokenRecord.maxUses) {
      throw new Error("Emergency access QR token usage limit exceeded.");
    }

    const emergency = tokenRecord.emergencyProfile;
    if (!emergency.isActive) {
      throw new Error("Patient emergency profile is currently inactive.");
    }

    // Update usage count
    await prisma.emergencyProfileAccessToken.update({
      where: { id: tokenRecord.id },
      data: {
        useCount: { increment: 1 },
        consumedAt: now
      }
    });

    const patient = emergency.patient;

    // Log AccessLog & AuditLog
    await prisma.accessLog.create({
      data: {
        actorUserId: providerUserId,
        patientId: patient.id,
        resourceType: "EmergencyProfile",
        resourceId: emergency.id,
        action: AccessAction.EMERGENCY_VIEW,
        outcome: AccessOutcome.ALLOWED,
        purpose: reason
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: providerUserId,
        action: AuditAction.EMERGENCY_PROFILE_ACCESSED,
        targetType: "EmergencyProfile",
        targetId: emergency.id,
        metadata: {
          patientId: patient.id,
          reason,
          selector
        }
      }
    });

    // Notify Patient via In-App Notification
    const providerUser = await prisma.user.findUnique({ where: { id: providerUserId } });
    const providerName = providerUser?.email || "Healthcare Provider";

    await notificationService.createNotification({
      userId: patient.userId,
      type: NotificationType.EMERGENCY_ACCESS,
      title: "Emergency Medical Profile Accessed",
      message: `Your emergency profile was accessed by ${providerName}. Reason: "${reason}".`,
      relatedResource: { type: "EmergencyProfile", id: emergency.id }
    });

    // Create Emergency Encounter if provider is linked to a hospital
    const membership = await prisma.hospitalMembership.findFirst({
      where: { userId: providerUserId, status: "ACTIVE" }
    });

    let emergencyEncounter = null;
    if (membership) {
      emergencyEncounter = await prisma.encounter.create({
        data: {
          patientId: patient.id,
          hospitalId: membership.hospitalId,
          departmentId: membership.departmentId ?? null,
          providerId: providerUserId,
          type: EncounterType.EMERGENCY,
          status: EncounterStatus.IN_PROGRESS,
          reason: `EMERGENCY ACCESS: ${reason}`,
          startedAt: now
        }
      });
    }

    return {
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "Emergency Patient",
      bloodGroup: emergency.bloodGroup,
      allergies: emergency.allergies,
      emergencyMedications: emergency.emergencyMedications,
      criticalConditions: emergency.criticalConditions,
      emergencyContact: emergency.emergencyContact,
      emergencyEncounterId: emergencyEncounter?.id || null
    };
  }

  /**
   * Get Emergency Access History for Patient
   */
  static async getAccessHistory(userId: string) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    const logs = await prisma.accessLog.findMany({
      where: {
        patientId: patientProfile.id,
        action: AccessAction.EMERGENCY_VIEW
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            doctorProfile: true
          }
        }
      },
      orderBy: { occurredAt: "desc" }
    });

    return logs.map(l => ({
      id: l.id,
      accessedAt: l.occurredAt,
      actorName: l.actor?.email || "Unknown Provider",
      doctorSpecialty: l.actor?.doctorProfile?.specialty || null,
      reason: l.purpose,
      outcome: l.outcome
    }));
  }
}
