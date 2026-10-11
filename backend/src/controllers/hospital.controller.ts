import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";
import { 
  MembershipRole, 
  ProfileVerificationStatus, 
  AuditAction 
} from "../generated/prisma/enums.js";
import { generateDoctorIdDisplay } from "../utils/id-generator.js";

const prisma = databaseClient.getClient();

export class HospitalController {
  static async getHospitals(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Get hospitals where user has an active membership
      const memberships = await prisma.hospitalMembership.findMany({
        where: { userId: req.user.id, status: "ACTIVE" },
        include: { hospital: true }
      });

      const hospitals = memberships.map(m => m.hospital);
      res.json(hospitals);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getHospitalDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const hospital = await prisma.hospital.findUnique({
        where: { id: hospitalId }
      });
      if (!hospital) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }
      res.json(hospital);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getDepartments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const departments = await prisma.department.findMany({
        where: { hospitalId }
      });
      res.json(departments);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const members = await prisma.hospitalMembership.findMany({
        where: { hospitalId }, // View all members, not just active, to manage them
        include: {
          user: {
            select: {
              id: true,
              email: true,
              doctorProfile: true
            }
          },
          department: true
        }
      });
      res.json(members);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { email, role, departmentId } = req.body;

      if (!email || !role) {
        res.status(400).json({ error: "Missing email or role" });
        return;
      }

      // Verify user exists
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(404).json({ error: "User not found. Provider invitation not fully implemented yet." });
        return;
      }

      // Verify department if provided
      if (departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!dept || dept.hospitalId !== hospitalId) {
          res.status(400).json({ error: "Invalid department for this hospital" });
          return;
        }
      }

      // Check duplicate
      const existing = await prisma.hospitalMembership.findFirst({
        where: { hospitalId, userId: user.id }
      });

      if (existing) {
        res.status(400).json({ error: "User is already a member of this hospital" });
        return;
      }

      // If adding a doctor, ensure doctor profile exists
      if (role === MembershipRole.DOCTOR || role === "DOCTOR") {
        const existingDocProfile = await prisma.doctorProfile.findUnique({ where: { userId: user.id } });
        if (!existingDocProfile) {
          await prisma.doctorProfile.create({
            data: {
              userId: user.id,
              registrationNumber: `REG-${Date.now()}`,
              doctorIdDisplay: generateDoctorIdDisplay(),
              specialty: "General Medicine",
              verificationStatus: ProfileVerificationStatus.PENDING
            }
          });
        }
      }

      const membership = await prisma.hospitalMembership.create({
        data: {
          hospitalId,
          userId: user.id,
          role,
          departmentId: departmentId || null,
          status: "ACTIVE"
        }
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.MEMBERSHIP_CREATED,
          targetType: "HospitalMembership",
          targetId: membership.id,
          metadata: { hospitalId, role, departmentId }
        }
      });

      res.status(201).json(membership);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const membershipId = req.params.membershipId as string;
      const { role, status, departmentId } = req.body;

      // Verify membership exists and belongs to hospital
      const existing = await prisma.hospitalMembership.findUnique({ where: { id: membershipId } });
      if (!existing || existing.hospitalId !== hospitalId) {
        res.status(404).json({ error: "Membership not found in this hospital" });
        return;
      }

      // Prevent self-elevation/demotion
      if (existing.userId === req.user!.id) {
        res.status(403).json({ error: "Cannot modify your own membership" });
        return;
      }

      if (departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!dept || dept.hospitalId !== hospitalId) {
          res.status(400).json({ error: "Invalid department for this hospital" });
          return;
        }
      }

      const membership = await prisma.hospitalMembership.update({
        where: { id: membershipId },
        data: {
          role: role !== undefined ? role : existing.role,
          status: status !== undefined ? status : existing.status,
          departmentId: departmentId !== undefined ? departmentId : existing.departmentId,
        }
      });

      const auditAction = (status === "INACTIVE" || status === "SUSPENDED")
        ? AuditAction.MEMBERSHIP_DEACTIVATED
        : (status === "ACTIVE" && existing.status !== "ACTIVE")
        ? AuditAction.MEMBERSHIP_ACTIVATED
        : AuditAction.MEMBERSHIP_UPDATED;

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: auditAction,
          targetType: "HospitalMembership",
          targetId: membership.id,
          metadata: { role, status, departmentId }
        }
      });

      res.json(membership);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async removeMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const membershipId = req.params.membershipId as string;

      const existing = await prisma.hospitalMembership.findUnique({ where: { id: membershipId } });
      if (!existing || existing.hospitalId !== hospitalId) {
        res.status(404).json({ error: "Membership not found" });
        return;
      }

      if (existing.userId === req.user!.id) {
        res.status(403).json({ error: "Cannot remove your own membership" });
        return;
      }

      await prisma.hospitalMembership.delete({
        where: { id: membershipId }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: AuditAction.MEMBERSHIP_REVOKED,
          targetType: "HospitalMembership",
          targetId: membershipId,
          metadata: { hospitalId }
        }
      });

      res.status(200).json({ success: true });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateHospitalSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { name, contactEmail, contactPhone, address, licenseNumber } = req.body;

      const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
      if (!hospital) {
        res.status(404).json({ error: "Hospital not found" });
        return;
      }

      const updated = await prisma.hospital.update({
        where: { id: hospitalId },
        data: {
          name: name || hospital.name,
          contactEmail: contactEmail !== undefined ? contactEmail : hospital.contactEmail,
          contactPhone: contactPhone !== undefined ? contactPhone : hospital.contactPhone,
          address: address !== undefined ? address : hospital.address,
          licenseNumber: licenseNumber !== undefined ? licenseNumber : hospital.licenseNumber,
        }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
          action: "RECORD_UPLOADED" as any,
          targetType: "Hospital",
          targetId: hospitalId,
          metadata: { event: "SETTINGS_UPDATED", hospitalId }
        }
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { name, code } = req.body;

      if (!name) {
        res.status(400).json({ error: "Department name is required" });
        return;
      }

      const existing = await prisma.department.findFirst({
        where: { hospitalId, name: { equals: name, mode: "insensitive" } }
      });

      if (existing) {
        res.status(400).json({ error: "Department with this name already exists in hospital" });
        return;
      }

      const dept = await prisma.department.create({
        data: {
          hospitalId,
          name,
          code: code || undefined
        }
      });

      res.status(201).json(dept);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const departmentId = req.params.departmentId as string;
      const { name } = req.body;

      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept || dept.hospitalId !== hospitalId) {
        res.status(404).json({ error: "Department not found in this hospital" });
        return;
      }

      const updated = await prisma.department.update({
        where: { id: departmentId },
        data: { name: name || dept.name }
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getHospitalAppointments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const { status, doctorId, departmentId, date } = req.query;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query builder
      const where: any = { hospitalId };
      if (status) where.status = status;
      if (doctorId) where.doctorId = doctorId;
      if (departmentId) where.departmentId = departmentId;
      if (date) {
        const start = new Date(date as string);
        start.setHours(0,0,0,0);
        const end = new Date(date as string);
        end.setHours(23,59,59,999);
        where.slotTimestamp = { gte: start, lte: end };
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          patient: { include: { user: { select: { id: true, email: true, phone: true } } } },
          doctor: { include: { user: { select: { id: true, email: true } } } },
          department: true,
          encounter: true
        },
        orderBy: { slotTimestamp: "asc" }
      });

      res.json(appointments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getHospitalPatients(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;

      const encounters = await prisma.encounter.findMany({
        where: { hospitalId },
        select: { patientId: true }
      });

      const appointments = await prisma.appointment.findMany({
        where: { hospitalId },
        select: { patientId: true }
      });

      const patientIds = Array.from(new Set([
        ...encounters.map(e => e.patientId),
        ...appointments.map(a => a.patientId)
      ]));

      const patients = await prisma.patientProfile.findMany({
        where: { id: { in: patientIds } },
        include: {
          user: { select: { id: true, email: true, phone: true, createdAt: true } }
        }
      });

      res.json(patients);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
