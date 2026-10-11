import { databaseClient } from "../config/database.js";
import { storage } from "./storage/StorageFactory.js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { AuditAction, AccessAction, AccessOutcome } from "../generated/prisma/enums.js";

const prisma = databaseClient.getClient();

export class ReportShareService {
  /**
   * Patient creates a 24-hour QR share containing specific medical reports.
   * Strictly calculates expiresAt = createdAt + 24 hours.
   */
  static async createShare(
    userId: string,
    recordIds?: string[],
    title?: string
  ) {
    const patient = await prisma.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) {
      const err = new Error("Patient profile not found");
      (err as any).statusCode = 404;
      throw err;
    }

    let finalRecordIds: string[] = [];

    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      // Verify all specified records belong to this patient
      const records = await prisma.medicalRecord.findMany({
        where: {
          id: { in: recordIds },
          patientId: patient.id,
        },
        select: { id: true },
      });

      if (records.length !== recordIds.length) {
        const err = new Error("One or more selected records do not exist or belong to another patient");
        (err as any).statusCode = 400;
        throw err;
      }
      finalRecordIds = recordIds;
    } else {
      // No selection: automatically include all patient's records
      const allRecords = await prisma.medicalRecord.findMany({
        where: { patientId: patient.id },
        select: { id: true },
      });
      finalRecordIds = allRecords.map((r) => r.id);
    }

    // Cryptographically secure token (never stored in DB plaintext)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const selector = uuidv4();

    const now = new Date();
    // Strictly 24 hours expiration from creation
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const share = await prisma.$transaction(async (txn) => {
      const created = await txn.patientReportShare.create({
        data: {
          patientId: patient.id,
          tokenHash,
          selector,
          title: title ? title.trim().slice(0, 100) : null,
          recordIds: finalRecordIds,
          expiresAt,
        },
      });

      await txn.auditLog.create({
        data: {
          actorUserId: userId,
          action: AuditAction.SHARING_SESSION_CREATED,
          targetType: "PatientReportShare",
          targetId: created.id,
          metadata: {
            selector,
            recordCount: finalRecordIds.length,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return created;
    });

    return {
      id: share.id,
      selector: share.selector,
      rawToken,
      shareUrl: `/shared/reports/${rawToken}`,
      recordCount: finalRecordIds.length,
      title: share.title,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    };
  }

  /**
   * Authenticated recipient accesses the shared reports using the token.
   * Enforces validity, active status (not revoked), and strict 24-hr expiry.
   */
  static async getSharedReports(recipientUserId: string, token: string) {
    if (!token || typeof token !== "string") {
      const err = new Error("Share token is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const share = await prisma.patientReportShare.findUnique({
      where: { tokenHash },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientIdDisplay: true,
          },
        },
      },
    });

    if (!share) {
      const err = new Error("Shared report link not found or invalid");
      (err as any).statusCode = 404;
      throw err;
    }

    if (share.revokedAt) {
      const err = new Error("This shared report link has been revoked by the patient");
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date();
    if (now.getTime() >= new Date(share.expiresAt).getTime()) {
      const err = new Error("This shared report link has expired after 24 hours");
      (err as any).statusCode = 410;
      throw err;
    }

    // Update access count and last accessed time
    await prisma.patientReportShare.update({
      where: { id: share.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: now,
        claimedByUserId: share.claimedByUserId ?? recipientUserId,
      },
    });

    const recordIds = Array.isArray(share.recordIds) ? (share.recordIds as string[]) : [];

    const records = await prisma.medicalRecord.findMany({
      where: {
        id: { in: recordIds },
        patientId: share.patientId,
      },
      include: {
        documents: {
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            byteSize: true,
            securityStatus: true,
            verificationStatus: true,
            uploadedAt: true,
          },
        },
        consultation: {
          include: {
            doctorProfile: {
              select: {
                specialty: true,
                registrationNumber: true,
              },
            },
            hospital: {
              select: {
                name: true,
              },
            },
          },
        },
        prescription: {
          include: {
            doctorProfile: {
              select: {
                specialty: true,
                registrationNumber: true,
              },
            },
            items: true,
          },
        },
        labReport: {
          include: {
            results: true,
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    });

    // Record audit logs
    await prisma.auditLog.create({
      data: {
        actorUserId: recipientUserId,
        action: AuditAction.SHARED_RECORD_VIEWED,
        targetType: "PatientReportShare",
        targetId: share.id,
        metadata: {
          recordCount: records.length,
        },
      },
    });

    for (const r of records) {
      await prisma.accessLog.create({
        data: {
          actorUserId: recipientUserId,
          patientId: share.patientId,
          medicalRecordId: r.id,
          resourceType: "MedicalRecord",
          resourceId: r.id,
          action: AccessAction.VIEW,
          outcome: AccessOutcome.ALLOWED,
        },
      });
    }

    const formattedRecords = records.map((rec) => ({
      ...rec,
      documents: rec.documents.map((doc) => ({
        ...doc,
        byteSize: doc.byteSize.toString(),
        isDownloadable: doc.securityStatus === "CLEAN",
        downloadBlockedReason:
          doc.securityStatus !== "CLEAN"
            ? "File is quarantined or undergoing security inspection"
            : null,
      })),
    }));

    return {
      shareId: share.id,
      title: share.title,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      isExpired: false,
      sharedBy: {
        firstName: share.patient.firstName || "Anonymous",
        lastName: share.patient.lastName || "Patient",
        patientIdDisplay: share.patient.patientIdDisplay,
      },
      records: formattedRecords,
    };
  }

  /**
   * Authenticated recipient downloads an authorized document from the share.
   * Enforces 24-hr expiry, revocation, document record inclusion, and CLEAN status.
   */
  static async downloadSharedDocument(
    recipientUserId: string,
    token: string,
    documentId: string
  ) {
    if (!token || typeof token !== "string") {
      const err = new Error("Share token is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const share = await prisma.patientReportShare.findUnique({
      where: { tokenHash },
    });

    if (!share) {
      const err = new Error("Shared report link not found or invalid");
      (err as any).statusCode = 404;
      throw err;
    }

    if (share.revokedAt) {
      const err = new Error("This shared report link has been revoked by the patient");
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date();
    if (now.getTime() >= new Date(share.expiresAt).getTime()) {
      const err = new Error("This shared report link has expired after 24 hours");
      (err as any).statusCode = 410;
      throw err;
    }

    const recordIds = Array.isArray(share.recordIds) ? (share.recordIds as string[]) : [];

    const document = await prisma.medicalDocument.findUnique({
      where: { id: documentId },
      include: { medicalRecord: true },
    });

    if (
      !document ||
      !recordIds.includes(document.medicalRecordId) ||
      document.medicalRecord.patientId !== share.patientId
    ) {
      const err = new Error("Document not found or unauthorized for this share");
      (err as any).statusCode = 404;
      throw err;
    }

    // Security check: Only allow CLEAN documents to be downloaded
    if (document.securityStatus !== "CLEAN") {
      const err = new Error("Document is unavailable due to quarantine or pending virus scan");
      (err as any).statusCode = 403;
      throw err;
    }

    await prisma.accessLog.create({
      data: {
        actorUserId: recipientUserId,
        patientId: share.patientId,
        medicalRecordId: document.medicalRecordId,
        resourceType: "MedicalDocument",
        resourceId: document.id,
        action: AccessAction.DOWNLOAD,
        outcome: AccessOutcome.ALLOWED,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: recipientUserId,
        action: AuditAction.RECORD_DOWNLOADED,
        targetType: "MedicalDocument",
        targetId: document.id,
        metadata: {
          shareId: share.id,
          filename: document.originalFilename,
        },
      },
    });

    const buffer = await storage.get(document.storageKey);

    return {
      metadata: document,
      buffer,
    };
  }

  /**
   * List all QR report shares created by the authenticated patient.
   */
  static async listPatientShares(userId: string) {
    const patient = await prisma.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) {
      const err = new Error("Patient profile not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const shares = await prisma.patientReportShare.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    return shares.map((s) => ({
      id: s.id,
      selector: s.selector,
      title: s.title,
      recordCount: Array.isArray(s.recordIds) ? (s.recordIds as string[]).length : 0,
      recordIds: s.recordIds,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      accessCount: s.accessCount,
      lastAccessedAt: s.lastAccessedAt,
      isExpired: now.getTime() >= new Date(s.expiresAt).getTime(),
      isRevoked: Boolean(s.revokedAt),
    }));
  }

  /**
   * Revoke a report share immediately.
   */
  static async revokeShare(userId: string, shareId: string) {
    const patient = await prisma.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) {
      const err = new Error("Patient profile not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const share = await prisma.patientReportShare.findFirst({
      where: {
        id: shareId,
        patientId: patient.id,
      },
    });

    if (!share) {
      const err = new Error("Report share not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (share.revokedAt) {
      return share;
    }

    const updated = await prisma.$transaction(async (txn) => {
      const s = await txn.patientReportShare.update({
        where: { id: share.id },
        data: { revokedAt: new Date() },
      });

      await txn.auditLog.create({
        data: {
          actorUserId: userId,
          action: AuditAction.SHARING_SESSION_REVOKED,
          targetType: "PatientReportShare",
          targetId: share.id,
        },
      });

      return s;
    });

    return updated;
  }
}
