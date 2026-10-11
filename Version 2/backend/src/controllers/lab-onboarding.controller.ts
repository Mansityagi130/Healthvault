import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";
import { 
  AuditAction, 
  ProfileVerificationStatus, 
  MembershipRole, 
  MembershipStatus, 
  AccountStatus
} from "../generated/prisma/enums.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";

const prisma = databaseClient.getClient();

const registerLabSchema = z.object({
  name: z.string().min(2),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional()
  }).optional(),
  contactEmail: z.string().email().optional(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().optional(),
  adminLastName: z.string().optional(),
  adminPassword: z.string().min(8).optional()
}).strict();

const inviteStaffSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(MembershipRole).default(MembershipRole.LAB_USER)
}).strict();

export class LabOnboardingController {
  
  static async registerLab(req: Request, res: Response): Promise<void> {
    try {
      const data = registerLabSchema.parse(req.body);

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Laboratory in PENDING verification state
        const lab = await tx.lab.create({
          data: {
            name: data.name,
            address: data.address || {},
            verificationStatus: ProfileVerificationStatus.PENDING
          }
        });

        // 2. Setup Lab Admin User & Membership
        let adminUser = await tx.user.findUnique({ where: { email: data.adminEmail } });
        if (!adminUser) {
          if (!data.adminPassword) {
            throw new Error("Password is required for creating new admin account");
          }
          const passwordHash = await bcrypt.hash(data.adminPassword, 12);
          adminUser = await tx.user.create({
            data: {
              email: data.adminEmail,
              passwordHash,
              status: AccountStatus.ACTIVE,
              isEmailVerified: true
            }
          });
        }

        const membership = await tx.labMembership.create({
          data: {
            labId: lab.id,
            userId: adminUser.id,
            role: MembershipRole.LAB_ADMIN,
            status: MembershipStatus.ACTIVE
          }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: adminUser.id,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema preservation
            action: AuditAction.MEMBERSHIP_CREATED as any,
            targetType: "Lab",
            targetId: lab.id,
            metadata: { event: "LAB_REGISTERED", labName: lab.name }
          }
        });

        return { lab, adminUser, membership };
      });

      res.status(201).json({
        message: "Laboratory registered successfully. Awaiting platform verification.",
        lab: result.lab
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      res.status(400).json({ error: err.message || "Registration failed" });
    }
  }

  static async inviteStaff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const labId = req.params.labId as string;
      const data = inviteStaffSchema.parse(req.body);

      // Verify lab membership for caller
      const membership = await prisma.labMembership.findUnique({
        where: { labId_userId: { labId, userId: req.user!.id } }
      });
      if (!membership || membership.role !== MembershipRole.LAB_ADMIN || membership.status !== MembershipStatus.ACTIVE) {
        res.status(403).json({ error: "Requires active LAB_ADMIN role" });
        return;
      }

      // Verify target user exists
      let targetUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (!targetUser) {
        res.status(404).json({ error: "User not found. Target email must belong to a registered account." });
        return;
      }

      // Check duplicate membership
      const existingMember = await prisma.labMembership.findUnique({
        where: { labId_userId: { labId, userId: targetUser.id } }
      });
      if (existingMember) {
        res.status(400).json({ error: "User is already a member of this laboratory" });
        return;
      }

      const newMembership = await prisma.labMembership.create({
        data: {
          labId,
          userId: targetUser.id,
          role: data.role,
          status: MembershipStatus.ACTIVE
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema preservation
          action: AuditAction.MEMBERSHIP_CREATED as any,
          targetType: "LabMembership",
          targetId: newMembership.id,
          metadata: { labId, role: data.role }
        }
      });

      res.status(201).json(newMembership);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Failed to invite staff" });
    }
  }
}
