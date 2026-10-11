import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { databaseClient } from "../config/database.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Needed for test fixtures/types
import { RecordCategory, RecordSource, ProvenanceStatus, EncounterStatus, LabReportStatus, NotificationType } from "../generated/prisma/client.js";
import { notificationService } from "../services/notification.service.js";

const prisma = databaseClient.getClient();

export const ClinicalRecordController = {

  // Create Consultation
  async createConsultation(req: AuthRequest, res: Response) {
    try {
      const providerUserId = req.user!.id;
      const encounterId = req.params.encounterId as string;
      const { chiefComplaint, clinicalNotes, assessment, plan, followUpDate, followUpReason, followUpInstructions } = req.body;

      if (!chiefComplaint || !clinicalNotes || !assessment || !plan) {
        res.status(400).json({ error: "Missing required consultation fields" });
        return;
      }

      // Authorize Provider against Encounter
      const encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          patient: true,
          hospital: { include: { memberships: { where: { userId: providerUserId, status: "ACTIVE" } } } }
        }
      });

      if (!encounter) {
        res.status(404).json({ error: "Encounter not found" });
        return;
      }

      if (encounter.providerId !== providerUserId) {
         res.status(403).json({ error: "Provider not authorized for this encounter" });
         return;
      }

      if (encounter.hospital.memberships.length === 0) {
        res.status(403).json({ error: "Provider is not an active member of the hospital" });
        return;
      }

      if (encounter.status !== "ACTIVE" && encounter.status !== "IN_PROGRESS" && encounter.status !== "CHECKED_IN") {
        res.status(400).json({ error: "Can only create records for CHECKED_IN, IN_PROGRESS or ACTIVE encounters" });
        return;
      }

      // Get Doctor Profile
      const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: providerUserId } });
      if (!doctorProfile) {
        res.status(403).json({ error: "User is not registered as a doctor" });
        return;
      }

      // Create transaction
      const record = await prisma.$transaction(async (tx) => {
        if (encounter.status === "CHECKED_IN") {
          await tx.encounter.update({
            where: { id: encounter.id },
            data: { status: EncounterStatus.IN_PROGRESS, startedAt: encounter.startedAt || new Date() }
          });
        }

        const mr = await tx.medicalRecord.create({
          data: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            hospitalId: encounter.hospitalId,
            category: RecordCategory.CONSULTATION,
            source: RecordSource.DOCTOR,
            provenanceStatus: ProvenanceStatus.PROVIDER_CREATED,
            createdByUserId: providerUserId,
            title: "Clinical Consultation",
            occurredAt: new Date(),
            consultation: {
              create: {
                doctorProfileId: doctorProfile.id,
                hospitalId: encounter.hospitalId,
                encounterAt: encounter.startedAt || new Date(),
                clinicalSummary: {
                  chiefComplaint,
                  clinicalNotes,
                  assessment,
                  plan,
                  followUpDate: followUpDate || null,
                  followUpReason: followUpReason || null,
                  followUpInstructions: followUpInstructions || null
                }
              }
            }
          },
          include: { consultation: true }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: providerUserId,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
            action: "RECORD_UPLOADED" as any, // Mapped AuditAction
            targetType: "MedicalRecord",
            targetId: mr.id,
            metadata: { encounterId, type: "CONSULTATION" }
          }
        });

        return mr;
      }, { timeout: 15000 });

      if (followUpDate && encounter.patient?.userId) {
        await notificationService.createNotification({
          userId: encounter.patient.userId,
          type: NotificationType.ENCOUNTER_UPDATED,
          title: "Follow-up Recommended",
          message: `Your doctor recommended a follow-up visit on ${new Date(followUpDate).toLocaleDateString()}.`,
          relatedResource: { type: "MedicalRecord", id: record.id }
        });
      }

      res.status(201).json(record);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Create Prescription
  async createPrescription(req: AuthRequest, res: Response) {
    try {
      const providerUserId = req.user!.id;
      const encounterId = req.params.encounterId as string;
      const { items, instructions } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "Prescription must have at least one medication item" });
        return;
      }

      // Validate items briefly
      for (const item of items) {
        if (!item.medicationName) {
           res.status(400).json({ error: "Each item must have a medicationName" });
           return;
        }
      }

      // Authorize Provider against Encounter
      const encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          patient: true,
          hospital: { include: { memberships: { where: { userId: providerUserId, status: "ACTIVE" } } } }
        }
      });

      if (!encounter) {
        res.status(404).json({ error: "Encounter not found" });
        return;
      }

      if (encounter.providerId !== providerUserId) {
         res.status(403).json({ error: "Provider not authorized for this encounter" });
         return;
      }

      if (encounter.hospital.memberships.length === 0) {
        res.status(403).json({ error: "Provider is not an active member of the hospital" });
        return;
      }

      if (encounter.status !== "ACTIVE" && encounter.status !== "IN_PROGRESS" && encounter.status !== "CHECKED_IN") {
        res.status(400).json({ error: "Can only create records for CHECKED_IN, IN_PROGRESS or ACTIVE encounters" });
        return;
      }

      const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: providerUserId } });
      if (!doctorProfile) {
        res.status(403).json({ error: "User is not registered as a doctor" });
        return;
      }

      const record = await prisma.$transaction(async (tx) => {
        if (encounter.status === "CHECKED_IN") {
          await tx.encounter.update({
            where: { id: encounter.id },
            data: { status: EncounterStatus.IN_PROGRESS, startedAt: encounter.startedAt || new Date() }
          });
        }
        const mr = await tx.medicalRecord.create({
          data: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            hospitalId: encounter.hospitalId,
            category: RecordCategory.PRESCRIPTION,
            source: RecordSource.DOCTOR,
            provenanceStatus: ProvenanceStatus.PROVIDER_CREATED,
            createdByUserId: providerUserId,
            title: "Medical Prescription",
            occurredAt: new Date(),
            issuedAt: new Date(),
            prescription: {
              create: {
                doctorProfileId: doctorProfile.id,
                issuedAt: new Date(),
                instructions,
                items: {
                  create: items.map(i => ({
                    medicationName: i.medicationName,
                    dosage: i.dosage,
                    frequency: i.frequency,
                    duration: i.duration,
                    quantity: i.quantity,
                    instructions: i.instructions
                  }))
                }
              }
            }
          },
          include: { prescription: { include: { items: true } } }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: providerUserId,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
            action: "RECORD_UPLOADED" as any,
            targetType: "MedicalRecord",
            targetId: mr.id,
            metadata: { encounterId, type: "PRESCRIPTION" }
          }
        });

        return mr;
      }, { timeout: 15000 });

      // Send Notification to Patient
      await notificationService.createNotification({
        userId: encounter.patient.userId,
        type: NotificationType.PRESCRIPTION_ADDED,
        title: "New Prescription Issued",
        message: "A new prescription has been issued for your visit.",
        relatedResource: { type: "MedicalRecord", id: record.id }
      });

      res.status(201).json(record);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Get Provider Encounter Records
  async getProviderEncounterRecords(req: AuthRequest, res: Response) {
    try {
      const providerUserId = req.user!.id;
      const encounterId = req.params.encounterId as string;

      const encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          hospital: { include: { memberships: { where: { userId: providerUserId, status: "ACTIVE" } } } }
        }
      });

      if (!encounter || encounter.providerId !== providerUserId || encounter.hospital.memberships.length === 0) {
        res.status(403).json({ error: "Unauthorized access to encounter records" });
        return;
      }

      const records = await prisma.medicalRecord.findMany({
        where: {
          OR: [
            { encounterId },
            { patientId: encounter.patientId, hospitalId: encounter.hospitalId }
          ]
        },
        include: {
          consultation: true,
          prescription: { include: { items: true } },
          labReport: { include: { results: true } },
          createdByUser: { select: { id: true, doctorProfile: true } }
        },
        orderBy: { occurredAt: "desc" }
      });

      // Log access
      await prisma.accessLog.create({
        data: {
          actorUserId: providerUserId,
          patientId: encounter.patientId,
          resourceType: "EncounterRecords",
          resourceId: encounter.id,
          action: "VIEW",
          outcome: "ALLOWED"
        }
      });

      res.json(records);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Create Lab Order for Encounter
  async createLabOrder(req: AuthRequest, res: Response) {
    try {
      const providerUserId = req.user!.id;
      const encounterId = req.params.encounterId as string;
      const { labId, testName, clinicalNotes } = req.body;

      if (!labId || !testName) {
        res.status(400).json({ error: "Missing required fields: labId and testName are required" });
        return;
      }

      // Authorize Provider against Encounter
      const encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          hospital: { include: { memberships: { where: { userId: providerUserId, status: "ACTIVE" } } } }
        }
      });

      if (!encounter) {
        res.status(404).json({ error: "Encounter not found" });
        return;
      }

      if (encounter.providerId !== providerUserId) {
        res.status(403).json({ error: "Provider not authorized for this encounter" });
        return;
      }

      if (encounter.hospital.memberships.length === 0) {
        res.status(403).json({ error: "Provider is not an active member of the hospital" });
        return;
      }

      if (encounter.status !== "ACTIVE" && encounter.status !== "IN_PROGRESS" && encounter.status !== "CHECKED_IN") {
        res.status(400).json({ error: "Can only order lab tests for CHECKED_IN, IN_PROGRESS or ACTIVE encounters" });
        return;
      }

      // Verify lab exists
      const lab = await prisma.lab.findUnique({ where: { id: labId } });
      if (!lab) {
        res.status(404).json({ error: "Lab not found" });
        return;
      }

      // Ensure PatientLabAssociation exists (or create ACTIVE association if provider orders test)
      let association = await prisma.patientLabAssociation.findFirst({
        where: {
          patientId: encounter.patientId,
          labId,
          status: "ACTIVE"
        }
      });

      if (!association) {
        association = await prisma.patientLabAssociation.create({
          data: {
            patientId: encounter.patientId,
            labId,
            status: "ACTIVE"
          }
        });
      }

      const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: providerUserId } });

      const record = await prisma.$transaction(async (tx) => {
        if (encounter.status === "CHECKED_IN") {
          await tx.encounter.update({
            where: { id: encounter.id },
            data: { status: EncounterStatus.IN_PROGRESS, startedAt: encounter.startedAt || new Date() }
          });
        }

        const mr = await tx.medicalRecord.create({
          data: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            hospitalId: encounter.hospitalId,
            labId,
            category: RecordCategory.LAB_REPORT,
            source: RecordSource.DOCTOR,
            provenanceStatus: ProvenanceStatus.PROVIDER_CREATED,
            createdByUserId: providerUserId,
            title: `Lab Order: ${testName}`,
            occurredAt: new Date(),
            issuedAt: new Date(),
            labReport: {
              create: {
                labId,
                createdByUserId: providerUserId,
                reportedAt: new Date(),
                status: LabReportStatus.DRAFT,
                reportMetadata: {
                  testName,
                  clinicalNotes: clinicalNotes || null,
                  orderedByDoctorId: doctorProfile?.id || null
                }
              }
            }
          },
          include: { labReport: true }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: providerUserId,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AuditAction mapping
            action: "RECORD_UPLOADED" as any,
            targetType: "MedicalRecord",
            targetId: mr.id,
            metadata: { encounterId, type: "LAB_ORDER", testName, labId }
          }
        });

        return mr;
      }, { timeout: 15000 });

      // Send Notification to Lab members
      const labMembers = await prisma.labMembership.findMany({
        where: { labId, status: "ACTIVE" }
      });
      for (const lm of labMembers) {
        await notificationService.createNotification({
          userId: lm.userId,
          type: NotificationType.ENCOUNTER_UPDATED,
          title: "New Lab Order Received",
          message: `A doctor ordered test "${testName}" for an encounter.`,
          relatedResource: { type: "MedicalRecord", id: record.id }
        });
      }

      res.status(201).json(record);
    } catch (err) {
      console.error("CREATE LAB ORDER ERROR:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  }
};
