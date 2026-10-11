import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Phase 3B Journey: Discover → Book → Visit → Diagnose → Lab Order → Lab Processing → Report Finalization → Doctor Review → Patient View", () => {
  let patientAToken: string;
  let patientAUserId: string;
  let patientAProfileId: string;

  let patientBToken: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let doctorBToken: string;

  let labUserAToken: string;
  let labUserAUserId: string;
  let labAId: string;

  let labUserBToken: string;
  let labBId: string;

  let hospitalAId: string;
  let departmentAId: string;

  let appointmentId: string;
  let encounterId: string;
  let labRecordId: string;
  let labReportId: string;

  const testDate = "2026-11-25";

  beforeAll(async () => {
    // 1. Clean Database
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Setup Hospital A & Department A
    await request(app).post("/api/auth/register").send({
      email: "admin-hosp-3b@example.com",
      password: "Password123!",
      firstName: "Admin",
      lastName: "3B",
      role: "HOSPITAL_ADMIN"
    });
    const hospA = await prisma.hospital.create({
      data: { name: "Central Hospital 3B", code: "HOSP-3B" }
    });
    hospitalAId = hospA.id;

    const deptA = await prisma.department.create({
      data: { name: "Cardiology", hospitalId: hospitalAId }
    });
    departmentAId = deptA.id;

    // 3. Setup Doctor A (Cardiology) & Doctor B
    const docARes = await request(app).post("/api/auth/register").send({
      email: "doc-3b-a@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "3BA",
      role: "PROVIDER"
    });
    doctorAUserId = docARes.body.user.id;

    const docAProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: "REG-3B-101",
        specialty: "Cardiology",
        verificationStatus: "VERIFIED"
      }
    });
    doctorAProfileId = docAProfile.id;

    await prisma.hospitalMembership.create({
      data: {
        userId: doctorAUserId,
        hospitalId: hospitalAId,
        departmentId: departmentAId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });

    const docALogin = await request(app).post("/api/auth/login").send({
      email: "doc-3b-a@example.com",
      password: "Password123!"
    });
    doctorAToken = docALogin.body.accessToken;

    const docBRes = await request(app).post("/api/auth/register").send({
      email: "doc-3b-b@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "3BB",
      role: "PROVIDER"
    });

    const docBLogin = await request(app).post("/api/auth/login").send({
      email: "doc-3b-b@example.com",
      password: "Password123!"
    });
    doctorBToken = docBLogin.body.accessToken;

    // 4. Setup Lab A & Lab B
    const labA = await prisma.lab.create({
      data: { name: "Alpha Diagnostic Lab", verificationStatus: "VERIFIED" }
    });
    labAId = labA.id;

    const labUserARes = await request(app).post("/api/auth/register").send({
      email: "lab-user-a@example.com",
      password: "Password123!",
      firstName: "LabTech",
      lastName: "Alpha",
      role: "PATIENT"
    });
    labUserAUserId = labUserARes.body.user.id;

    await prisma.labMembership.create({
      data: { labId: labAId, userId: labUserAUserId, role: "LAB_USER", status: "ACTIVE" }
    });

    const labALogin = await request(app).post("/api/auth/login").send({
      email: "lab-user-a@example.com",
      password: "Password123!"
    });
    labUserAToken = labALogin.body.accessToken;

    const labB = await prisma.lab.create({
      data: { name: "Beta Diagnostic Lab", verificationStatus: "VERIFIED" }
    });
    labBId = labB.id;

    const labUserBRes = await request(app).post("/api/auth/register").send({
      email: "lab-user-b@example.com",
      password: "Password123!",
      firstName: "LabTech",
      lastName: "Beta",
      role: "PATIENT"
    });

    await prisma.labMembership.create({
      data: { labId: labBId, userId: labUserBRes.body.user.id, role: "LAB_USER", status: "ACTIVE" }
    });

    const labBLogin = await request(app).post("/api/auth/login").send({
      email: "lab-user-b@example.com",
      password: "Password123!"
    });
    labUserBToken = labBLogin.body.accessToken;

    // 5. Setup Patient A & Patient B
    const patARes = await request(app).post("/api/auth/register").send({
      email: "patient-3b-a@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "3BA",
      role: "PATIENT"
    });
    patientAUserId = patARes.body.user.id;

    const patAProfile = await prisma.patientProfile.findUnique({ where: { userId: patientAUserId } });
    patientAProfileId = patAProfile!.id;

    const patALogin = await request(app).post("/api/auth/login").send({
      email: "patient-3b-a@example.com",
      password: "Password123!"
    });
    patientAToken = patALogin.body.accessToken;

    await request(app).post("/api/auth/register").send({
      email: "patient-3b-b@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "3BB",
      role: "PATIENT"
    });

    const patBLogin = await request(app).post("/api/auth/login").send({
      email: "patient-3b-b@example.com",
      password: "Password123!"
    });
    patientBToken = patBLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
  });

  it("1. DISCOVER & BOOK: Patient A books appointment with Doctor A", async () => {
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        departmentId: departmentAId,
        appointmentDate: testDate,
        startTime: "11:00",
        endTime: "11:30",
        reason: "Cardiac evaluation"
      });

    if (bookRes.status !== 201) console.log("BOOK TEST 1 ERROR:", bookRes.body);
    expect(bookRes.status).toBe(201);
    appointmentId = bookRes.body.id;
  });

  it("2. VISIT: Check-in activates Encounter", async () => {
    const checkInRes = await request(app)
      .post(`/api/appointments/${appointmentId}/check-in`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(checkInRes.status).toBe(200);
    encounterId = checkInRes.body.encounterId;
    expect(encounterId).toBeDefined();
  });

  it("3. DIAGNOSE: Doctor authors consultation note", async () => {
    const consultRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "Palpitations and fatigue",
        clinicalNotes: "Patient reports intermittent tachycardia.",
        assessment: "Arrhythmia Suspected",
        plan: "Order Lipid Panel & ECG"
      });

    expect(consultRes.status).toBe(201);
  });

  it("4. LAB ORDER: Doctor orders lab test for active encounter", async () => {
    const orderRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/lab-orders`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        labId: labAId,
        testName: "Lipid Profile & Cardiac Enzymes",
        clinicalNotes: "Evaluate for cardiac risk factors"
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.category).toBe("LAB_REPORT");
    expect(orderRes.body.provenanceStatus).toBe("PROVIDER_CREATED");
    expect(orderRes.body.labReport).toBeDefined();
    expect(orderRes.body.labReport.status).toBe("DRAFT");

    labRecordId = orderRes.body.id;
    labReportId = orderRes.body.labReport.id;
  });

  it("5. LAB SECURITY & QUEUE: Lab A sees order in queue, Lab B blocked", async () => {
    // Lab A lists reports
    const listRes = await request(app)
      .get(`/api/labs/${labAId}/reports`)
      .set("Authorization", `Bearer ${labUserAToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items.length).toBeGreaterThan(0);
    const order = listRes.body.items.find((r: { id: string }) => r.id === labReportId);
    expect(order).toBeDefined();
    expect(order.status).toBe("DRAFT");

    // Lab B attempt to list Lab A reports fails
    const labBRes = await request(app)
      .get(`/api/labs/${labAId}/reports`)
      .set("Authorization", `Bearer ${labUserBToken}`);

    expect(labBRes.status).toBe(403);
  });

  it("6. LAB PROCESSING: Lab User A enters test results", async () => {
    // Add cholesterol result
    const res1 = await request(app)
      .post(`/api/labs/${labAId}/reports/${labReportId}/results`)
      .set("Authorization", `Bearer ${labUserAToken}`)
      .send({
        testName: "Serum Cholesterol",
        value: "230",
        valueType: "NUMERIC",
        unit: "mg/dL",
        referenceRange: "< 200",
        status: "HIGH"
      });

    expect(res1.status).toBe(201);
    expect(res1.body.status).toBe("HIGH");

    // Add Troponin result
    const res2 = await request(app)
      .post(`/api/labs/${labAId}/reports/${labReportId}/results`)
      .set("Authorization", `Bearer ${labUserAToken}`)
      .send({
        testName: "Troponin I",
        value: "0.01",
        valueType: "NUMERIC",
        unit: "ng/mL",
        referenceRange: "< 0.04",
        status: "NORMAL"
      });

    expect(res2.status).toBe(201);
    expect(res2.body.status).toBe("NORMAL");
  });

  it("7. REPORT FINALIZATION & NOTIFICATION: Lab A finalizes report", async () => {
    const finalizeRes = await request(app)
      .patch(`/api/labs/${labAId}/reports/${labReportId}/finalize`)
      .set("Authorization", `Bearer ${labUserAToken}`);

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.status).toBe("FINALIZED");

    // Verify Notification sent to Ordering Doctor & Patient
    const docNotifs = await prisma.notification.findMany({
      where: { userId: doctorAUserId, type: "LAB_REPORT_FINALIZED" }
    });
    expect(docNotifs.length).toBeGreaterThan(0);

    const patNotifs = await prisma.notification.findMany({
      where: { userId: patientAUserId, type: "LAB_REPORT_FINALIZED" }
    });
    expect(patNotifs.length).toBeGreaterThan(0);
  });

  it("8. REPORT IMMUTABILITY: Finalized report cannot be modified or updated with results", async () => {
    const failAddResult = await request(app)
      .post(`/api/labs/${labAId}/reports/${labReportId}/results`)
      .set("Authorization", `Bearer ${labUserAToken}`)
      .send({
        testName: "Late Glucose Test",
        value: "100",
        valueType: "NUMERIC",
        status: "NORMAL"
      });

    expect(failAddResult.status).toBe(400);
    expect(failAddResult.body.error).toContain("Results can only be added to DRAFT reports");
  });

  it("9. DOCTOR REVIEW: Ordering Doctor reviews finalized lab results in encounter context", async () => {
    const recordsRes = await request(app)
      .get(`/api/provider/encounters/${encounterId}/records`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(recordsRes.status).toBe(200);
    const labReportRecord = recordsRes.body.find((r: { category: string }) => r.category === "LAB_REPORT");
    expect(labReportRecord).toBeDefined();
    expect(labReportRecord.labReport).toBeDefined();
    expect(labReportRecord.labReport.status).toBe("FINALIZED");
    expect(labReportRecord.labReport.results.length).toBe(2);
  });

  it("10. PATIENT VIEW & SECURITY: Patient A views finalized report; unauthorized Patient B denied", async () => {
    // Patient A retrieves medical record
    const patRecordRes = await request(app)
      .get(`/api/patient/records/${labRecordId}`)
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(patRecordRes.status).toBe(200);
    expect(patRecordRes.body.category).toBe("LAB_REPORT");
    expect(patRecordRes.body.labReport.status).toBe("FINALIZED");

    // Unauthorized Patient B attempt to view Patient A's lab report is blocked
    const unauthPatRes = await request(app)
      .get(`/api/patient/records/${labRecordId}`)
      .set("Authorization", `Bearer ${patientBToken}`);

    expect([403, 404]).toContain(unauthPatRes.status);
  });
});
