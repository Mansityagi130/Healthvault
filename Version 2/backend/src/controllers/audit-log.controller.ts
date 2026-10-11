import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";

const prisma = databaseClient.getClient();

export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: true,
        hospitalMemberships: {
          where: { status: "ACTIVE" },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const action = req.query.action as string | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Flexible Prisma query builder
    const where: any = {};

    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate && !isNaN(startDate.getTime())) where.occurredAt.gte = startDate;
      if (endDate && !isNaN(endDate.getTime())) where.occurredAt.lte = endDate;
    }

    if (action) {
      where.action = action;
    }

    const isPatient = !!user.patientProfile;
    const isHospitalAdmin = user.hospitalMemberships.some(m => m.role === "HOSPITAL_ADMIN");

    if (isPatient) {
      const patientId = user.patientProfile!.id;
      const patientRecords = await prisma.medicalRecord.findMany({
        where: { patientId },
        select: { id: true },
      });
      const recordIds = patientRecords.map(r => r.id);

      where.OR = [
        { actorUserId: userId },
        { targetId: patientId },
        { targetId: userId },
        ...(recordIds.length > 0 ? [{ targetId: { in: recordIds } }] : []),
      ];
    } else if (isHospitalAdmin) {
      const adminHospitalIds = user.hospitalMemberships
        .filter(m => m.role === "HOSPITAL_ADMIN")
        .map(m => m.hospitalId);

      const hospitalMembers = await prisma.hospitalMembership.findMany({
        where: { hospitalId: { in: adminHospitalIds } },
        select: { userId: true },
      });
      const memberUserIds = hospitalMembers.map(m => m.userId);

      where.OR = [
        { actorUserId: { in: memberUserIds } },
        { targetId: { in: adminHospitalIds } },
      ];
    } else {
      where.actorUserId = userId;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: pageSize,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              publicId: true,
              isPlatformAdmin: true,
            },
          },
        },
      }),
    ]);

    // Sanitize metadata to remove sensitive credentials or tokens
    const sanitizedLogs = logs.map(log => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Metadata object sanitization
      let metadata = log.metadata as Record<string, any> | null;
      if (metadata && typeof metadata === "object") {
        const cleanMeta = { ...metadata };
        delete cleanMeta.password;
        delete cleanMeta.token;
        delete cleanMeta.secret;
        delete cleanMeta.mfaSecret;
        delete cleanMeta.accessToken;
        delete cleanMeta.refreshToken;
        metadata = cleanMeta;
      }
      return {
        ...log,
        metadata,
      };
    });

    res.status(200).json({
      logs: sanitizedLogs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
