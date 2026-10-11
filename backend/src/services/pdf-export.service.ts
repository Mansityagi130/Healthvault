import PDFDocument from "pdfkit";
import crypto from "crypto";
import { databaseClient } from "../config/database.js";
import { DocumentSecurityStatus, ProvenanceStatus } from "../generated/prisma/enums.js";

const prisma = databaseClient.getClient();

export interface MedicalHistoryExportOptions {
  recordIds?: string[] | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  category?: string | undefined;
}

export class PdfExportService {
  /**
   * Generate consolidated medical history PDF for an authenticated patient
   */
  static async generateMedicalHistoryPdf(
    userId: string,
    options: MedicalHistoryExportOptions = {}
  ): Promise<{ buffer: Buffer; filename: string }> {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        emergencyProfile: true,
        encounters: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!patientProfile) {
      throw new Error("Patient profile not found");
    }

    // Build filter query for records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      patientId: patientProfile.id,
    };

    if (options.recordIds && options.recordIds.length > 0) {
      where.id = { in: options.recordIds };
    }

    if (options.category) {
      where.category = options.category;
    }

    if (options.dateFrom || options.dateTo) {
      where.occurredAt = {};
      if (options.dateFrom) where.occurredAt.gte = new Date(options.dateFrom);
      if (options.dateTo) where.occurredAt.lte = new Date(options.dateTo);
    }

    const records = await prisma.medicalRecord.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      include: {
        consultation: {
          include: {
            doctorProfile: true,
            hospital: true,
          },
        },
        prescription: {
          include: {
            items: true,
            doctorProfile: true,
          },
        },
        labReport: {
          include: {
            results: true,
            lab: true,
          },
        },
        imagingRecord: true,
        dischargeSummary: {
          include: {
            hospital: true,
          },
        },
        vaccinationRecord: true,
        documents: true,
      },
    });

    const exportTime = new Date();
    const verificationId = crypto.randomUUID();
    const patientFullName = `${patientProfile.firstName || ""} ${patientProfile.lastName || ""}`.trim() || "HealthVault Patient";
    const filename = `healthvault-medical-history-${patientProfile.id.slice(0, 8)}-${exportTime.toISOString().slice(0, 10)}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // --- COVER & HEADER BANNER ---
      doc.rect(40, 40, 515, 60).fill("#0D9488"); // Teal 600

      doc.fillColor("#FFFFFF");
      doc.fontSize(20).font("Helvetica-Bold").text("HEALTHVAULT", 55, 52);
      doc.fontSize(10).font("Helvetica").text("OFFICIAL PATIENT MEDICAL RECORD VAULT EXPORT", 55, 78);
      doc.fontSize(9).font("Helvetica-Oblique").text(`Generated: ${exportTime.toUTCString()}`, 330, 78, { align: "right", width: 210 });

      doc.moveDown(4);

      // --- PATIENT IDENTITY SUMMARY CARD ---
      doc.fillColor("#0F172A"); // Slate 900
      doc.fontSize(14).font("Helvetica-Bold").text("Patient Information", 40, 120);

      doc.rect(40, 138, 515, 80).fillAndStroke("#F8FAFC", "#E2E8F0");
      doc.fillColor("#334155");
      doc.fontSize(10).font("Helvetica-Bold");

      doc.text("Full Name:", 55, 148);
      doc.font("Helvetica").text(patientFullName, 130, 148);

      doc.font("Helvetica-Bold").text("Patient ID:", 320, 148);
      doc.font("Helvetica").text(patientProfile.patientIdDisplay || patientProfile.publicId.slice(0, 13), 390, 148);

      doc.font("Helvetica-Bold").text("Date of Birth:", 55, 168);
      doc.font("Helvetica").text(patientProfile.dateOfBirth ? new Date(patientProfile.dateOfBirth).toLocaleDateString() : "Not recorded", 130, 168);

      doc.font("Helvetica-Bold").text("Sex at Birth:", 320, 168);
      doc.font("Helvetica").text(patientProfile.sexAtBirth || "Not specified", 390, 168);

      doc.font("Helvetica-Bold").text("Phone / Email:", 55, 188);
      doc.font("Helvetica").text(`${patientProfile.phone || patientProfile.user.phone || "No phone"} • ${patientProfile.user.email}`, 130, 188);

      doc.font("Helvetica-Bold").text("Blood Group:", 320, 188);
      doc.font("Helvetica").text(patientProfile.emergencyProfile?.bloodGroup || "Not specified", 390, 188);

      // --- AUDIT & EXPORT METADATA CARD ---
      doc.rect(40, 226, 515, 45).fillAndStroke("#F1F5F9", "#CBD5E1");
      doc.fillColor("#475569").fontSize(8).font("Helvetica");
      doc.text(`Export Verification ID: ${verificationId}`, 55, 234);
      doc.text(`Record Scope: ${records.length} clinical record(s) included`, 55, 246);
      doc.text(`Security Notice: Documents are authenticated via SHA-256 integrity checksums. Quarantined or infected files are strictly excluded.`, 55, 256, { width: 485 });

      // --- EMERGENCY & CRITICAL HEALTH SUMMARY ---
      if (patientProfile.emergencyProfile) {
        const ep = patientProfile.emergencyProfile;
        doc.moveDown(4);
        doc.fillColor("#B91C1C").fontSize(12).font("Helvetica-Bold").text("Emergency Profile & Critical Alerts", 40, 285);

        doc.rect(40, 302, 515, 65).stroke("#FCA5A5");
        const allergies = Array.isArray(ep.allergies) ? (ep.allergies as string[]) : [];
        const conditions = Array.isArray(ep.criticalConditions) ? (ep.criticalConditions as string[]) : [];
        const meds = Array.isArray(ep.emergencyMedications) ? (ep.emergencyMedications as string[]) : [];

        doc.font("Helvetica-Bold").text("Known Allergies:", 55, 312);
        doc.font("Helvetica").text(allergies.join(", ") || "None recorded", 160, 312);

        doc.font("Helvetica-Bold").text("Critical Conditions:", 55, 328);
        doc.font("Helvetica").text(conditions.join(", ") || "None recorded", 160, 328);

        doc.font("Helvetica-Bold").text("Emergency Meds:", 55, 344);
        doc.font("Helvetica").text(meds.join(", ") || "None recorded", 160, 344);
      }

      // --- CHRONOLOGICAL CLINICAL RECORDS ---
      doc.moveDown(2);
      let currentY = patientProfile.emergencyProfile ? 385 : 300;

      doc.fillColor("#0F172A").fontSize(13).font("Helvetica-Bold").text("Clinical Records & Consultations", 40, currentY);
      currentY += 20;

      if (records.length === 0) {
        doc.fillColor("#64748B").fontSize(10).font("Helvetica-Oblique").text("No clinical records match the selected criteria.", 40, currentY);
        currentY += 30;
      }

      for (const rec of records) {
        // Page break check
        if (currentY > 680) {
          doc.addPage();
          currentY = 40;
        }

        // Record header box
        doc.rect(40, currentY, 515, 24).fill("#E2E8F0");
        doc.fillColor("#0F172A").fontSize(10).font("Helvetica-Bold");
        doc.text(`${rec.title || "Untitled Record"} (${rec.category})`, 48, currentY + 6);
        doc.font("Helvetica").fontSize(8).fillColor("#475569");
        const dateStr = new Date(rec.occurredAt).toLocaleDateString();
        const provStr = rec.provenanceStatus === ProvenanceStatus.PATIENT_UPLOADED ? "Patient Uploaded" : "Provider Verified";
        doc.text(`${dateStr} • ${provStr}`, 360, currentY + 7, { align: "right", width: 185 });

        currentY += 30;

        // Consultation Details
        if (rec.consultation?.clinicalSummary) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cs = rec.consultation.clinicalSummary as any;
          doc.fillColor("#1E293B").fontSize(9);
          if (cs.chiefComplaint) {
            doc.font("Helvetica-Bold").text("Chief Complaint: ", 50, currentY, { continued: true });
            doc.font("Helvetica").text(cs.chiefComplaint);
            currentY += 14;
          }
          if (cs.clinicalNotes) {
            doc.font("Helvetica-Bold").text("Clinical Notes: ", 50, currentY, { continued: true });
            doc.font("Helvetica").text(cs.clinicalNotes);
            currentY += 14;
          }
          if (cs.assessment) {
            doc.font("Helvetica-Bold").text("Assessment: ", 50, currentY, { continued: true });
            doc.font("Helvetica").text(cs.assessment);
            currentY += 14;
          }
          if (cs.plan) {
            doc.font("Helvetica-Bold").text("Treatment Plan: ", 50, currentY, { continued: true });
            doc.font("Helvetica").text(cs.plan);
            currentY += 14;
          }
          currentY += 4;
        }

        // Prescription Details
        if (rec.prescription && rec.prescription.items.length > 0) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#0D9488").text("Prescribed Medications:", 50, currentY);
          currentY += 14;
          for (const item of rec.prescription.items) {
            doc.font("Helvetica-Bold").fontSize(8).fillColor("#1E293B").text(`• ${item.medicationName}`, 60, currentY, { continued: true });
            doc.font("Helvetica").text(` — ${item.dosage || ""} | ${item.frequency || ""} | Duration: ${item.duration || "N/A"}`);
            currentY += 12;
          }
          currentY += 4;
        }

        // Lab Report Results
        if (rec.labReport && rec.labReport.results.length > 0) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#0284C7").text(`Lab Results (${rec.labReport.lab?.name || "Laboratory"}):`, 50, currentY);
          currentY += 14;
          for (const res of rec.labReport.results) {
            const isAbnormal = res.status !== "NORMAL" && res.status !== "UNSPECIFIED";
            doc.font(isAbnormal ? "Helvetica-Bold" : "Helvetica").fontSize(8);
            doc.fillColor(isAbnormal ? "#B91C1C" : "#334155");
            doc.text(`• ${res.testName}: ${res.value} ${res.unit || ""} (Ref: ${res.referenceRange || "Normal"}) [${res.status}]`, 60, currentY);
            currentY += 12;
          }
          currentY += 4;
        }

        // Attachments
        if (rec.documents && rec.documents.length > 0) {
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748B").text("Attached Files:", 50, currentY);
          currentY += 12;
          for (const d of rec.documents) {
            const isClean = d.securityStatus === DocumentSecurityStatus.CLEAN;
            const sizeStr = `${(Number(d.byteSize) / (1024 * 1024)).toFixed(2)} MB`;
            doc.font("Helvetica").fontSize(8);
            if (isClean) {
              doc.fillColor("#15803D").text(`[CLEAN FILE] ${d.originalFilename} (${sizeStr})`, 65, currentY);
            } else {
              doc.fillColor("#DC2626").text(`[SECURITY EXCLUDED - ${d.securityStatus}] ${d.originalFilename} (${sizeStr})`, 65, currentY);
            }
            currentY += 12;
          }
          currentY += 6;
        }

        currentY += 8;
      }

      // --- PAGE NUMBERING ON ALL PAGES ---
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor("#94A3B8").fontSize(8).font("Helvetica");
        doc.text(
          `HealthVault Confidential Patient Medical Record • Verification ID: ${verificationId.slice(0, 8)} • Page ${i + 1} of ${totalPages}`,
          40,
          800,
          { align: "center", width: 515 }
        );
      }

      doc.end();
    });

    return { buffer, filename };
  }

  /**
   * Generate emergency summary PDF for first responders / clinical emergency triage
   */
  static async generateEmergencySummaryPdf(userId: string): Promise<{ buffer: Buffer; filename: string }> {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        emergencyProfile: {
          include: {
            accessTokens: {
              where: { revokedAt: null, expiresAt: { gt: new Date() } },
              take: 1,
            },
          },
        },
      },
    });

    if (!patientProfile) {
      throw new Error("Patient profile not found");
    }

    const ep = patientProfile.emergencyProfile;
    const patientFullName = `${patientProfile.firstName || ""} ${patientProfile.lastName || ""}`.trim() || "Emergency Patient";
    const exportTime = new Date();
    const filename = `healthvault-emergency-card-${patientProfile.id.slice(0, 8)}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // RED EMERGENCY HEADER
      doc.rect(40, 40, 515, 65).fill("#DC2626"); // Red 600

      doc.fillColor("#FFFFFF");
      doc.fontSize(22).font("Helvetica-Bold").text("HEALTHVAULT EMERGENCY CARD", 55, 52);
      doc.fontSize(10).font("Helvetica").text("CRITICAL MEDICAL TRIAGE & FIRST RESPONDER DATA", 55, 78);
      doc.fontSize(9).font("Helvetica-Oblique").text(`Active as of ${exportTime.toUTCString()}`, 310, 78, { align: "right", width: 230 });

      // BLOOD GROUP CALLOUT BOX
      doc.rect(40, 115, 515, 55).fillAndStroke("#FEF2F2", "#EF4444");
      doc.fillColor("#991B1B").fontSize(11).font("Helvetica-Bold").text("CRITICAL BLOOD GROUP:", 55, 126);
      doc.fillColor("#DC2626").fontSize(24).font("Helvetica-Bold").text(ep?.bloodGroup || "UNKNOWN", 55, 140);

      // PATIENT DEMOGRAPHICS
      doc.fillColor("#1E293B").fontSize(10).font("Helvetica-Bold");
      doc.text(`Patient Name: ${patientFullName}`, 260, 128);
      doc.font("Helvetica").text(`DOB: ${patientProfile.dateOfBirth ? new Date(patientProfile.dateOfBirth).toLocaleDateString() : "Unknown"} • Sex: ${patientProfile.sexAtBirth || "Unspecified"}`, 260, 142);
      doc.text(`Emergency ID: ${patientProfile.id.slice(0, 12)}`, 260, 155);

      // TRIAGE DETAILS
      let currentY = 185;

      // 1. KNOWN ALLERGIES
      doc.rect(40, currentY, 515, 20).fill("#FEE2E2");
      doc.fillColor("#991B1B").fontSize(10).font("Helvetica-Bold").text("KNOWN ALLERGIES & SEVERE REACTIONS", 48, currentY + 5);
      currentY += 26;

      const allergies = Array.isArray(ep?.allergies) ? (ep.allergies as string[]) : [];
      if (allergies.length > 0) {
        for (const al of allergies) {
          doc.fillColor("#1E293B").fontSize(10).font("Helvetica-Bold").text(`• ${al}`, 55, currentY);
          currentY += 16;
        }
      } else {
        doc.fillColor("#64748B").fontSize(9).font("Helvetica").text("No known drug or environmental allergies recorded.", 55, currentY);
        currentY += 16;
      }
      currentY += 10;

      // 2. CRITICAL CONDITIONS
      doc.rect(40, currentY, 515, 20).fill("#FEF3C7"); // Amber
      doc.fillColor("#92400E").fontSize(10).font("Helvetica-Bold").text("CRITICAL MEDICAL CONDITIONS", 48, currentY + 5);
      currentY += 26;

      const conditions = Array.isArray(ep?.criticalConditions) ? (ep.criticalConditions as string[]) : [];
      if (conditions.length > 0) {
        for (const cond of conditions) {
          doc.fillColor("#1E293B").fontSize(10).font("Helvetica-Bold").text(`• ${cond}`, 55, currentY);
          currentY += 16;
        }
      } else {
        doc.fillColor("#64748B").fontSize(9).font("Helvetica").text("No critical chronic conditions recorded.", 55, currentY);
        currentY += 16;
      }
      currentY += 10;

      // 3. EMERGENCY MEDICATIONS
      doc.rect(40, currentY, 515, 20).fill("#EFF6FF"); // Blue
      doc.fillColor("#1E40AF").fontSize(10).font("Helvetica-Bold").text("CURRENT EMERGENCY MEDICATIONS", 48, currentY + 5);
      currentY += 26;

      const meds = Array.isArray(ep?.emergencyMedications) ? (ep.emergencyMedications as string[]) : [];
      if (meds.length > 0) {
        for (const m of meds) {
          doc.fillColor("#1E293B").fontSize(10).font("Helvetica-Bold").text(`• ${m}`, 55, currentY);
          currentY += 16;
        }
      } else {
        doc.fillColor("#64748B").fontSize(9).font("Helvetica").text("No emergency medications recorded.", 55, currentY);
        currentY += 16;
      }
      currentY += 10;

      // 4. EMERGENCY CONTACTS
      doc.rect(40, currentY, 515, 20).fill("#F1F5F9");
      doc.fillColor("#0F172A").fontSize(10).font("Helvetica-Bold").text("EMERGENCY CONTACT HIERARCHY", 48, currentY + 5);
      currentY += 26;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contact = ep?.emergencyContact as any;
      if (contact && contact.name) {
        doc.fillColor("#1E293B").fontSize(10).font("Helvetica-Bold").text(`Primary Contact: ${contact.name} (${contact.relationship || "Family"})`, 55, currentY);
        currentY += 15;
        doc.fillColor("#0D9488").fontSize(11).font("Helvetica-Bold").text(`Telephone: ${contact.phone || "Not recorded"}`, 55, currentY);
        currentY += 20;
      } else {
        doc.fillColor("#64748B").fontSize(9).font("Helvetica").text("No emergency contact configured.", 55, currentY);
        currentY += 16;
      }
      currentY += 10;

      // NOTICE FOR FIRST RESPONDERS
      doc.rect(40, currentY, 515, 60).fillAndStroke("#F8FAFC", "#CBD5E1");
      doc.fillColor("#475569").fontSize(8).font("Helvetica");
      doc.text("EMERGENCY MEDICAL NOTICE:", 55, currentY + 10, { underline: true });
      doc.text(
        "This emergency summary is generated directly by the patient through HealthVault digital health vault. It contains self-attested and clinician-synchronized critical medical alerts intended solely for rapid emergency triage.",
        55,
        currentY + 22,
        { width: 485 }
      );
      doc.text(
        "To break-glass and view full diagnostic history, scan the patient's dynamic emergency QR code or request authorization via emergency protocol.",
        55,
        currentY + 42,
        { width: 485 }
      );

      // FOOTER
      doc.fillColor("#94A3B8").fontSize(8).font("Helvetica");
      doc.text("HealthVault Emergency Medical Record • Confidential Emergency Document", 40, 800, {
        align: "center",
        width: 515,
      });

      doc.end();
    });

    return { buffer, filename };
  }
}
