import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { 
  LabResultValueType,
  LabResultStatus
} from "../src/generated/prisma/client.js";

const prisma = databaseClient.getClient();

describe("Phase 3C Journey: Diagnosis → Lab Results → Prescription → Treatment", () => {
  let patientAToken: string;
  let patientAUserId: string;

  let patientBToken: string;
  let patientBUserId: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let doctorBToken: string;
  let doctorBUserId: string;
  let doctorBProfileId: string;

  let labUserAToken: string;
  let labUserAUserId: string;

  let hospitalAId: string;
  let hospitalBId: string;
  let departmentAId: string;
  let departmentBId: string;
  let labAId: string;

  let appointmentId: string;
  let encounterId: string;
  let labReportId: string;
  let prescription1RecordId: string;
  let prescription2RecordId: string;

  const testDate = "2026-12-10";

  beforeAll(async () => {
    // 1. Cleanup tables
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Setup Patient A & Patient B
    const regPatA = await request(app).post("/api/auth/register").send({
      email: "patA_p3c@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha",
      role: "PATIENT"
    });
    patientAUserId = regPatA.body.user.id;

    const loginPatA = await request(app).post("/api/auth/login").send({
      email: "patA_p3c@example.com",
      password: "Password123!"
    });
    patientAToken = loginPatA.body.accessToken;

    const regPatB = await request(app).post("/api/auth/register").send({
      email: "patB_p3c@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Beta",
      role: "PATIENT"
    });
    patientBUserId = regPatB.body.user.id;

    const loginPatB = await request(app).post("/api/auth/login").send({
      email: "patB_p3c@example.com",
      password: "Password123!"
    });
    patientBToken = loginPatB.body.accessToken;

    // 3. Setup Hospitals & Departments
    const hospA = await prisma.hospital.create({
      data: { name: "Metro Health Hospital A", code: "HOSP-A-P3C", verificationStatus: "VERIFIED" }
    });
    hospitalAId = hospA.id;

    const deptA = await prisma.department.create({
      data: { name: "Internal Medicine", hospitalId: hospitalAId }
    });
    departmentAId = deptA.id;

    const hospB = await prisma.hospital.create({
      data: { name: "City General Hospital B", code: "HOSP-B-P3C", verificationStatus: "VERIFIED" }
    });
    hospitalBId = hospB.id;

    const deptB = await prisma.department.create({
      data: { name: "Pediatrics", hospitalId: hospitalBId }
    });
    departmentBId = deptB.id;

    // 4. Setup Doctor A & Doctor B
    const regDocA = await request(app).post("/api/auth/register").send({
      email: "docA_p3c@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "Alice",
      role: "PROVIDER"
    });
    doctorAUserId = regDocA.body.user.id;

    const docAProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: "DOC-A-REG-P3C",
        specialty: "Internal Medicine",
        verificationStatus: "VERIFIED"
      }
    });
    doctorAProfileId = docAProfile.id;

    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospitalAId,
        departmentId: departmentAId,
        userId: doctorAUserId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });

    const loginDocA = await request(app).post("/api/auth/login").send({
      email: "docA_p3c@example.com",
      password: "Password123!"
    });
    doctorAToken = loginDocA.body.accessToken;

    const regDocB = await request(app).post("/api/auth/register").send({
      email: "docB_p3c@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "Bob",
      role: "PROVIDER"
    });
    doctorBUserId = regDocB.body.user.id;

    const docBProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorBUserId,
        registrationNumber: "DOC-B-REG-P3C",
        specialty: "Pediatrics",
        verificationStatus: "VERIFIED"
      }
    });
    doctorBProfileId = docBProfile.id;

    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospitalBId,
        departmentId: departmentBId,
        userId: doctorBUserId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });

    const loginDocB = await request(app).post("/api/auth/login").send({
      email: "docB_p3c@example.com",
      password: "Password123!"
    });
    doctorBToken = loginDocB.body.accessToken;

    // 5. Setup Lab & Lab User
    const labA = await prisma.lab.create({
      data: { name: "Central Clinical Diagnostics A", verificationStatus: "VERIFIED" }
    });
    labAId = labA.id;

    const regLabUserA = await request(app).post("/api/auth/register").send({
      email: "labA_p3c@example.com",
      password: "Password123!",
      firstName: "Tech",
      lastName: "Charlie",
      role: "PATIENT"
    });
    labUserAUserId = regLabUserA.body.user.id;

    await prisma.labMembership.create({
      data: { labId: labAId, userId: labUserAUserId, role: "LAB_USER", status: "ACTIVE" }
    });

    const loginLabUserA = await request(app).post("/api/auth/login").send({
      email: "labA_p3c@example.com",
      password: "Password123!"
    });
    labUserAToken = loginLabUserA.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
  });

  it("1. DISCOVER & BOOK: Patient A books appointment with Doctor A at Hospital A", async () => {
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        departmentId: departmentAId,
        appointmentDate: testDate,
        startTime: "10:00",
        endTime: "10:30",
        reason: "Persistent fever and sore throat"
      });

    expect(bookRes.status).toBe(201);
    appointmentId = bookRes.body.id;
  });

  it("2. VISIT & CHECK-IN: Hospital/Doctor checks in appointment, activating Encounter", async () => {
    const checkinRes = await request(app)
      .post(`/api/appointments/${appointmentId}/check-in`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(checkinRes.status).toBe(200);
    encounterId = checkinRes.body.encounterId;
    expect(encounterId).toBeDefined();
  });

  it("3. DIAGNOSE: Doctor A authors Consultation Note", async () => {
    const consultRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "High fever (102F) and tonsillar exudate",
        clinicalNotes: "Patient presents with 3-day history of acute throat pain and fatigue.",
        assessment: "Acute Bacterial Tonsillitis suspected",
        plan: "Order throat culture & CBC. Initiate empiric therapy post lab."
      });

    expect(consultRes.status).toBe(201);
    expect(consultRes.body.category).toBe("CONSULTATION");
  });

  it("4. LAB ORDER & PROCESSING: Doctor A orders test, Lab processes and finalizes report", async () => {
    // Doctor orders lab test
    const orderRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/lab-orders`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        labId: labAId,
        testName: "Complete Blood Count (CBC) & Throat Culture",
        clinicalNotes: "Rule out streptococcal pharyngitis"
      });

    expect(orderRes.status).toBe(201);
    const labRecord = orderRes.body;
    labReportId = labRecord.labReport.id;

    // Lab enters test result
    const resultRes = await request(app)
      .post(`/api/labs/${labAId}/reports/${labReportId}/results`)
      .set("Authorization", `Bearer ${labUserAToken}`)
      .send({
        testName: "WBC Count",
        value: "14.2",
        unit: "x10^3/uL",
        referenceRange: "4.5-11.0",
        valueType: LabResultValueType.NUMERIC,
        status: LabResultStatus.HIGH
      });
    expect(resultRes.status).toBe(201);

    // Lab finalizes report
    const finalizeRes = await request(app)
      .patch(`/api/labs/${labAId}/reports/${labReportId}/finalize`)
      .set("Authorization", `Bearer ${labUserAToken}`);

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.status).toBe("FINALIZED");
  });

  it("5. CLINICAL CONTINUITY: Doctor A reviews encounter records containing diagnosis & finalized lab result", async () => {
    const reviewRes = await request(app)
      .get(`/api/provider/encounters/${encounterId}/records`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.length).toBeGreaterThanOrEqual(2);

    const labRecord = reviewRes.body.find((r: any) => r.category === "LAB_REPORT");
    expect(labRecord).toBeDefined();
    expect(labRecord.labReport.status).toBe("FINALIZED");
    expect(labRecord.labReport.results.length).toBe(1);
    expect(labRecord.labReport.results[0].testName).toBe("WBC Count");
  });

  it("6. PRESCRIPTION CREATION & VALIDATION: Doctor A issues prescription based on diagnosis & lab results", async () => {
    const rxRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/prescriptions`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        instructions: "Complete full 10-day antibiotic course even if feeling better.",
        items: [
          {
            medicationName: "Amoxicillin-Clavulanate",
            dosage: "875mg/125mg",
            frequency: "Twice daily",
            duration: "10 days",
            quantity: "20 tablets",
            instructions: "Take with food"
          },
          {
            medicationName: "Paracetamol",
            dosage: "650mg",
            frequency: "Every 6 hours as needed for fever",
            duration: "5 days",
            quantity: "15 tablets",
            instructions: "Do not exceed 3g per day"
          }
        ]
      });

    expect(rxRes.status).toBe(201);
    expect(rxRes.body.category).toBe("PRESCRIPTION");
    expect(rxRes.body.provenanceStatus).toBe("PROVIDER_CREATED");
    expect(rxRes.body.prescription).toBeDefined();
    expect(rxRes.body.prescription.items.length).toBe(2);
    expect(rxRes.body.prescription.instructions).toBe("Complete full 10-day antibiotic course even if feeling better.");

    prescription1RecordId = rxRes.body.id;
  });

  it("7. PRESCRIPTION SECURITY & AUTHORIZATION: Unauthorized Doctor B cannot prescribe for Patient A encounter", async () => {
    const rxFailRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/prescriptions`)
      .set("Authorization", `Bearer ${doctorBToken}`)
      .send({
        instructions: "Unauthorized prescription attempt",
        items: [{ medicationName: "Unauthorized Drug" }]
      });

    expect(rxFailRes.status).toBe(403);
  });

  it("8. PATIENT NOTIFICATION & VIEW: Patient A receives notification and views detailed prescription", async () => {
    // Verify notification was sent to Patient A
    const notifications = await prisma.notification.findMany({
      where: { userId: patientAUserId, type: "PRESCRIPTION_ADDED" }
    });
    expect(notifications.length).toBeGreaterThan(0);
    expect((notifications[0].payload as any).title).toBe("New Prescription Issued");

    // Patient views prescription record detail
    const detailRes = await request(app)
      .get(`/api/patient/records/${prescription1RecordId}`)
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.category).toBe("PRESCRIPTION");
    expect(detailRes.body.prescription).toBeDefined();
    expect(detailRes.body.prescription.items.length).toBe(2);
    expect(detailRes.body.prescription.items[0].medicationName).toBe("Amoxicillin-Clavulanate");
  });

  it("9. PATIENT ACCESS CONTROL: Patient B cannot view Patient A's prescription", async () => {
    const rxAccessFail = await request(app)
      .get(`/api/patient/records/${prescription1RecordId}`)
      .set("Authorization", `Bearer ${patientBToken}`);

    expect(rxAccessFail.status).toBe(404);
  });

  it("10. PRESCRIPTION HISTORY & TREATMENT CONTINUITY: Adding secondary prescription preserves previous prescription record", async () => {
    // Doctor A adds a follow-up prescription (e.g., Vitamin D supplement post-recovery)
    const rx2Res = await request(app)
      .post(`/api/provider/encounters/${encounterId}/prescriptions`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        instructions: "Post-infection recovery supplement",
        items: [
          {
            medicationName: "Cholecalciferol (Vitamin D3)",
            dosage: "60,000 IU",
            frequency: "Once weekly",
            duration: "8 weeks",
            instructions: "Take with milk"
          }
        ]
      });

    expect(rx2Res.status).toBe(201);
    prescription2RecordId = rx2Res.body.id;
    expect(prescription2RecordId).not.toBe(prescription1RecordId);

    // Verify Patient A can retrieve both original and new prescription intact
    const originalRxRes = await request(app)
      .get(`/api/patient/records/${prescription1RecordId}`)
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(originalRxRes.status).toBe(200);
    expect(originalRxRes.body.prescription.items[0].medicationName).toBe("Amoxicillin-Clavulanate");

    const newRxRes = await request(app)
      .get(`/api/patient/records/${prescription2RecordId}`)
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(newRxRes.status).toBe(200);
    expect(newRxRes.body.prescription.items[0].medicationName).toBe("Cholecalciferol (Vitamin D3)");
  });
});
