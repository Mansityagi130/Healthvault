import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";
import { 
  AuditAction, 
  HospitalVerificationStatus, 
  HospitalStatus, 
  MembershipRole, 
  MembershipStatus, 
  InvitationStatus, 
  AccountStatus, 
  ProfileVerificationStatus,
  NotificationType,
  NotificationStatus
} from "../generated/prisma/enums.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { generateDoctorIdDisplay } from "../utils/id-generator.js";

const prisma = databaseClient.getClient();

const registerHospitalSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  hfrFacilityId: z.string().optional(),
  licenseNumber: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional()
  }).optional(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().optional(),
  adminLastName: z.string().optional(),
  adminPassword: z.string().min(8).optional()
}).strict();

const inviteDoctorSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(MembershipRole).default(MembershipRole.DOCTOR),
  departmentId: z.string().uuid().optional()
}).strict();

const acceptInvitationSchema = z.object({
  token: z.string().min(16),
  registrationNumber: z.string().optional(),
  specialty: z.string().optional(),
  licenseState: z.string().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional()
}).strict();

export class HospitalOnboardingController {
  
  static async registerHospital(req: Request, res: Response): Promise<void> {
    try {
      const data = registerHospitalSchema.parse(req.body);

      // Check unique code if provided
      const code = data.code || `HOSP-${Date.now()}`;
      const existingCode = await prisma.hospital.findUnique({ where: { code } });
      if (existingCode) {
        res.status(400).json({ error: "Hospital code already exists" });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Hospital in PENDING_REVIEW state
        const hospital = await tx.hospital.create({
          data: {
            name: data.name,
            code,
            address: data.address || {},
            hfrFacilityId: data.hfrFacilityId || null,
            licenseNumber: data.licenseNumber || null,
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone || null,
            verificationStatus: HospitalVerificationStatus.PENDING_REVIEW,
            status: HospitalStatus.ACTIVE
          }
        });

        // 2. Setup Hospital Admin User & Membership
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

        // Create HospitalMembership for Admin (Pending review until Platform Admin approves)
        const membership = await tx.hospitalMembership.create({
          data: {
            hospitalId: hospital.id,
            userId: adminUser.id,
            role: MembershipRole.HOSPITAL_ADMIN,
            status: MembershipStatus.ACTIVE
          }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: adminUser.id,
            action: AuditAction.HOSPITAL_REGISTERED,
            targetType: "Hospital",
            targetId: hospital.id,
            metadata: { hospitalName: hospital.name, hfrFacilityId: hospital.hfrFacilityId }
          }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: adminUser.id,
            action: AuditAction.HOSPITAL_SUBMITTED,
            targetType: "Hospital",
            targetId: hospital.id
          }
        });

        return { hospital, adminUser, membership };
      });

      res.status(201).json({
        message: "Hospital application submitted successfully. HealthVault Platform Admin will review your application.",
        hospital: result.hospital,
        adminUser: { id: result.adminUser.id, email: result.adminUser.email }
      });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error formatting
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
      } else {
        res.status(400).json({ error: err.message || "Failed to submit hospital application" });
      }
    }
  }

  static async inviteDoctorOrStaff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const data = inviteDoctorSchema.parse(req.body);

      // Verify hospital is VERIFIED and ACTIVE
      const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!hospital) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      if (hospital.status === HospitalStatus.SUSPENDED) {
        res.status(403).json({ error: "Cannot send invitations: Hospital is suspended" });
        return;
      }

      if (hospital.verificationStatus !== HospitalVerificationStatus.VERIFIED) {
        res.status(403).json({ error: "Cannot send invitations: Hospital verification is pending or incomplete" });
        return;
      }

      // Check existing active membership for email if user exists
      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        const existingMembership = await prisma.hospitalMembership.findFirst({
          where: { hospitalId, userId: existingUser.id, status: MembershipStatus.ACTIVE }
        });
        if (existingMembership) {
          res.status(400).json({ error: "User is already an active member of this hospital" });
          return;
        }
      }

      // Generate secure invitation token (SHA-256 hashed in database)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const invitationTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Invalidate existing pending invitations for same hospital & email
      await prisma.hospitalInvitation.updateMany({
        where: { hospitalId, email: data.email, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.CANCELLED }
      });

      const invitation = await prisma.hospitalInvitation.create({
        data: {
          hospitalId,
          departmentId: data.departmentId || null,
          email: data.email,
          role: data.role,
          invitationTokenHash,
          expiresAt,
          invitedByUserId: req.user!.id
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.DOCTOR_INVITED,
          targetType: "HospitalInvitation",
          targetId: invitation.id,
          metadata: { email: data.email, role: data.role, hospitalId }
        }
      });

      // Log outbox event for email notification
      const acceptUrl = `/accept-invitation?token=${rawToken}`;
      await prisma.outboxEvent.create({
        data: {
          topic: "NOTIFICATION",
          payload: {
            type: NotificationType.DOCTOR_INVITATION,
            email: data.email,
            hospitalName: hospital.name,
            role: data.role,
            acceptUrl
          }
        }
      });

      res.status(201).json({
        message: "Invitation generated and dispatched successfully",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        },
        invitationToken: rawToken, // For development and test logging
        acceptUrl
      });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error formatting
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
      } else {
        res.status(500).json({ error: "Failed to create invitation" });
      }
    }
  }

  static async getHospitalInvitations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const invitations = await prisma.hospitalInvitation.findMany({
        where: { hospitalId },
        include: { department: true },
        orderBy: { createdAt: "desc" }
      });
      res.status(200).json(invitations);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  }

  static async verifyInvitationToken(req: Request, res: Response): Promise<void> {
    try {
      const rawToken = (req.query.token || req.body.token) as string;
      if (!rawToken) {
        res.status(400).json({ error: "Invitation token is required" });
        return;
      }

      const invitationTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const invitation = await prisma.hospitalInvitation.findUnique({
        where: { invitationTokenHash },
        include: {
          hospital: {
            select: { id: true, name: true, verificationStatus: true, status: true }
          },
          department: true
        }
      });

      if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
        res.status(400).json({ error: "Invalid or expired invitation token" });
        return;
      }

      if (invitation.hospital.status === HospitalStatus.SUSPENDED || invitation.hospital.verificationStatus !== HospitalVerificationStatus.VERIFIED) {
        res.status(403).json({ error: "Hospital is not eligible to accept members" });
        return;
      }

      res.status(200).json({
        valid: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          hospitalName: invitation.hospital.name,
          departmentName: invitation.department?.name || null
        }
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error handler
    } catch (err) {
      res.status(500).json({ error: "Failed to verify invitation token" });
    }
  }

  static async acceptInvitation(req: Request, res: Response): Promise<void> {
    try {
      const data = acceptInvitationSchema.parse(req.body);
      const invitationTokenHash = crypto.createHash("sha256").update(data.token).digest("hex");

      const invitation = await prisma.hospitalInvitation.findUnique({
        where: { invitationTokenHash },
        include: { hospital: true }
      });

      if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
        res.status(400).json({ error: "Invalid or expired invitation token" });
        return;
      }

      if (invitation.hospital.status === HospitalStatus.SUSPENDED || invitation.hospital.verificationStatus !== HospitalVerificationStatus.VERIFIED) {
        res.status(403).json({ error: "Hospital is suspended or unverified" });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        // Find existing user by invitation email
        let user = await tx.user.findUnique({ where: { email: invitation.email } });

        if (!user) {
          if (!data.password) {
            throw new Error("Password is required for creating new account");
          }
          const passwordHash = await bcrypt.hash(data.password, 12);
          user = await tx.user.create({
            data: {
              email: invitation.email,
              passwordHash,
              status: AccountStatus.ACTIVE,
              isEmailVerified: true
            }
          });
        }

        // If role is DOCTOR, handle DoctorProfile
        let doctorProfile = null;
        if (invitation.role === MembershipRole.DOCTOR) {
          doctorProfile = await tx.doctorProfile.findUnique({ where: { userId: user.id } });

          if (!doctorProfile) {
            if (data.registrationNumber) {
              const existingReg = await tx.doctorProfile.findUnique({
                where: { registrationNumber: data.registrationNumber }
              });
              if (existingReg) {
                throw new Error("Doctor registration number already in use");
              }
            }
            const registrationNumber = data.registrationNumber || `REG-${Date.now()}`;
            const doctorIdDisplay = generateDoctorIdDisplay();
            doctorProfile = await tx.doctorProfile.create({
              data: {
                userId: user.id,
                registrationNumber,
                specialty: data.specialty || "General Medicine",
                licenseState: data.licenseState || null,
                doctorIdDisplay,
                verificationStatus: ProfileVerificationStatus.PENDING // Professional verification remains PENDING
              }
            });
          }
        }

        // Create or update HospitalMembership
        const existingMembership = await tx.hospitalMembership.findFirst({
          where: {
            hospitalId: invitation.hospitalId,
            userId: user.id,
            departmentId: invitation.departmentId || null
          }
        });

        let membership;
        if (existingMembership) {
          membership = await tx.hospitalMembership.update({
            where: { id: existingMembership.id },
            data: {
              status: MembershipStatus.ACTIVE,
              role: invitation.role,
              verifiedAt: new Date()
            }
          });
        } else {
          membership = await tx.hospitalMembership.create({
            data: {
              hospitalId: invitation.hospitalId,
              departmentId: invitation.departmentId || null,
              userId: user.id,
              role: invitation.role,
              status: MembershipStatus.ACTIVE,
              verifiedAt: new Date()
            }
          });
        }

        // Mark invitation as ACCEPTED
        await tx.hospitalInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedByUserId: user.id
          }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: AuditAction.DOCTOR_INVITATION_ACCEPTED,
            targetType: "HospitalMembership",
            targetId: membership.id,
            metadata: { hospitalId: invitation.hospitalId, role: invitation.role }
          }
        });

        return { user, doctorProfile, membership };
      });

      res.status(200).json({
        message: "Invitation accepted successfully. Hospital membership activated.",
        user: { id: result.user.id, email: result.user.email },
        doctorProfile: result.doctorProfile,
        membership: result.membership
      });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error formatting
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
      } else {
        res.status(400).json({ error: err.message || "Failed to accept invitation" });
      }
    }
  }
}
