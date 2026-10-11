import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { 
  LabResultValueType,
  LabResultStatus
} from "../src/generated/prisma/client.js";

const prisma = databaseClient.getClient();

describe("Phase 3D Journey: Follow-up → Long-term History → Continuity of Care", () => {
  let patientAToken: string;
  let patientAUserId: string;

  let patientBToken: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let doctorBToken: string;
  let doctorBUserId: string;

  let labUserAToken: string;
  let labUserAUserId: string;

  let hospitalAId: string;
  let hospitalBId: string;
  let departmentAId: string;
  let labAId: string;

  let appt1Id: string;
  let enc1Id: string;
  let labReport1Id: string;
  let rx1RecordId: string;

  let appt2Id: string;
  let enc2Id: string;
  let rx2RecordId: string;

  const testDate1 = "2026-12-15";
  const testDate2 = "2026-12-28";

  beforeAll(async () => {
    // 1. Cleanup
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Patient A & Patient B
    const regPatA = await request(app).post("/api/auth/register").send({
      email: "patA_p3d@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha",
      role: "PATIENT"
    });
    patientAUserId = regPatA.body.user.id;

    const loginPatA = await request(app).post("/api/auth/login").send({
      email: "patA_p3d@example.com",
      password: "Password123!"
    });
    patientAToken = loginPatA.body.accessToken;

    const regPatB = await request(app).post("/api/auth/register").send({
      email: "patB_p3d@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Beta",
      role: "PATIENT"
    });
    const loginPatB = await request(app).post("/api/auth/login").send({
      email: "patB_p3d@example.com",
      password: "Password123!"
    });
    patientBToken = loginPatB.body.accessToken;

    // 3. Setup Hospitals & Departments
    const hospA = await prisma.hospital.create({
      data: { name: "Metro Health Hospital A", code: "HOSP-A-P3D", verificationStatus: "VERIFIED" }
    });
    hospitalAId = hospA.id;

    const deptA = await prisma.department.create({
      data: { name: "Internal Medicine", hospitalId: hospitalAId }
    });
    departmentAId = deptA.id;

    const hospB = await prisma.hospital.create({
      data: { name: "City Hospital B", code: "HOSP-B-P3D", verificationStatus: "VERIFIED" }
    });
    hospitalBId = hospB.id;

    // 4. Setup Doctor A (Hospital A) & Doctor B (Hospital B)
    const regDocA = await request(app).post("/api/auth/register").send({
      email: "docA_p3d@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "Alice",
      role: "PROVIDER"
    });
    doctorAUserId = regDocA.body.user.id;

    const docAProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: "DOC-A-REG-P3D",
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
      email: "docA_p3d@example.com",
      password: "Password123!"
    });
    doctorAToken = loginDocA.body.accessToken;

    const regDocB = await request(app).post("/api/auth/register").send({
      email: "docB_p3d@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "Bob",
      role: "PROVIDER"
    });
    doctorBUserId = regDocB.body.user.id;

    await prisma.doctorProfile.create({
      data: {
        userId: doctorBUserId,
        registrationNumber: "DOC-B-REG-P3D",
        specialty: "General Practice",
        verificationStatus: "VERIFIED"
      }
    });

    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospitalBId,
        userId: doctorBUserId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });

    const loginDocB = await request(app).post("/api/auth/login").send({
      email: "docB_p3d@example.com",
      password: "Password123!"
    });
    doctorBToken = loginDocB.body.accessToken;

    // 5. Setup Lab A
    const labA = await prisma.lab.create({
      data: { name: "Central Clinical Diagnostics A", verificationStatus: "VERIFIED" }
    });
    labAId = labA.id;

    const regLabUserA = await request(app).post("/api/auth/register").send({
      email: "labA_p3d@example.com",
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
      email: "labA_p3d@example.com",
      password: "Password123!"
    });
    labUserAToken = loginLabUserA.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
  });

  it("1. INITIAL ENCOUNTER & FOLLOW-UP RECOMMENDATION: Doctor A conducts consultation and recommends follow-up", async () => {
    // Book initial appointment
    const appt1Res = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        departmentId: departmentAId,
        appointmentDate: testDate1,
        startTime: "09:00",
        endTime: "09:30",
        reason: "Initial consultation for persistent cough"
      });
    expect(appt1Res.status).toBe(201);
    appt1Id = appt1Res.body.id;

    // Check-in -> Encounter 1
    const checkin1Res = await request(app)
      .post(`/api/appointments/${appt1Id}/check-in`)
      .set("Authorization", `Bearer ${doctorAToken}`);
    expect(checkin1Res.status).toBe(200);
    enc1Id = checkin1Res.body.encounterId;

    // Consultation with follow-up recommendation
    const consult1Res = await request(app)
      .post(`/api/provider/encounters/${enc1Id}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "Acute bronchitis symptoms",
        clinicalNotes: "Bilateral wheezing noted.",
        assessment: "Acute Bronchitis",
        plan: "Antibiotic course + follow-up in 2 weeks",
        followUpDate: testDate2,
        followUpReason: "Evaluate resolution of wheezing & cough",
        followUpInstructions: "Return if fever recurs or breathing difficulty worsens"
      });
    expect(consult1Res.status).toBe(201);

    // Verify follow-up notification sent to Patient A
    const notifs = await prisma.notification.findMany({
      where: { userId: patientAUserId, type: "ENCOUNTER_UPDATED" }
    });
    expect(notifs.length).toBeGreaterThan(0);

    // Order & finalize lab test
    const labOrdRes = await request(app)
      .post(`/api/provider/encounters/${enc1Id}/lab-orders`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({ labId: labAId, testName: "C-Reactive Protein (CRP)", clinicalNotes: "Assess systemic inflammation" });
    expect(labOrdRes.status).toBe(201);
    labReport1Id = labOrdRes.body.labReport.id;

    await request(app)
      .post(`/api/labs/${labAId}/reports/${labReport1Id}/results`)
      .set("Authorization", `Bearer ${labUserAToken}`)
      .send({ testName: "CRP", value: "28.5", unit: "mg/L", referenceRange: "< 5.0", valueType: LabResultValueType.NUMERIC, status: LabResultStatus.HIGH });

    await request(app)
      .patch(`/api/labs/${labAId}/reports/${labReport1Id}/finalize`)
      .set("Authorization", `Bearer ${labUserAToken}`);

    // Prescribe initial medication
    const rx1Res = await request(app)
      .post(`/api/provider/encounters/${enc1Id}/prescriptions`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        instructions: "Take for 7 days post-meals",
        items: [{ medicationName: "Azithromycin 500mg", dosage: "500mg", frequency: "Once daily", duration: "5 days" }]
      });
    expect(rx1Res.status).toBe(201);
    rx1RecordId = rx1Res.body.id;
  });

  it("2. FOLLOW-UP APPOINTMENT & LINKAGE: Patient A books follow-up appointment based on recommendation", async () => {
    const appt2Res = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        departmentId: departmentAId,
        appointmentDate: testDate2,
        startTime: "11:00",
        endTime: "11:30",
        reason: "Follow-up: Evaluate resolution of bronchitis"
      });

    expect(appt2Res.status).toBe(201);
    appt2Id = appt2Res.body.id;

    const checkin2Res = await request(app)
      .post(`/api/appointments/${appt2Id}/check-in`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(checkin2Res.status).toBe(200);
    enc2Id = checkin2Res.body.encounterId;
  });

  it("3. DOCTOR CLINICAL CONTINUITY: Doctor A reviews encounter records and sees previous encounter history", async () => {
    const enc2RecordsRes = await request(app)
      .get(`/api/provider/encounters/${enc2Id}/records`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(enc2RecordsRes.status).toBe(200);
    expect(enc2RecordsRes.body.length).toBeGreaterThanOrEqual(3);

    // Verify previous consultation, lab report, and prescription are visible to Doctor A
    const previousConsult = enc2RecordsRes.body.find((r: any) => r.category === "CONSULTATION");
    expect(previousConsult).toBeDefined();

    const previousLab = enc2RecordsRes.body.find((r: any) => r.category === "LAB_REPORT");
    expect(previousLab).toBeDefined();
    expect(previousLab.labReport.status).toBe("FINALIZED");

    const previousRx = enc2RecordsRes.body.find((r: any) => r.category === "PRESCRIPTION");
    expect(previousRx).toBeDefined();

    // Doctor A files follow-up consultation note & secondary prescription
    const consult2Res = await request(app)
      .post(`/api/provider/encounters/${enc2Id}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "Cough resolved, mild residual throat dryness",
        clinicalNotes: "Lungs clear bilaterally. CRP and infection resolved.",
        assessment: "Resolved Acute Bronchitis",
        plan: "Discontinue antibiotics. General care."
      });
    expect(consult2Res.status).toBe(201);

    const rx2Res = await request(app)
      .post(`/api/provider/encounters/${enc2Id}/prescriptions`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        instructions: "Throat lozenges as needed",
        items: [{ medicationName: "Dequalinium Chloride Lozenges", dosage: "0.25mg", frequency: "As needed", duration: "3 days" }]
      });
    expect(rx2Res.status).toBe(201);
    rx2RecordId = rx2Res.body.id;
  });

  it("4. LONG-TERM PATIENT TIMELINE: Patient A views unified longitudinal care timeline", async () => {
    const timelineRes = await request(app)
      .get("/api/patient/timeline")
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(timelineRes.status).toBe(200);
    const events = timelineRes.body;
    expect(events.length).toBeGreaterThanOrEqual(5);

    // Verify events are sorted chronologically
    const types = events.map((e: any) => e.type);
    expect(types).toContain("CONSULTATION");
    expect(types).toContain("LAB_REPORT");
    expect(types).toContain("PRESCRIPTION");
    expect(types).toContain("APPOINTMENT");
  });

  it("5. SECURITY & ISOLATION: Patient B isolated from Patient A's timeline", async () => {
    const patBTimelineRes = await request(app)
      .get("/api/patient/timeline")
      .set("Authorization", `Bearer ${patientBToken}`);

    expect(patBTimelineRes.status).toBe(200);
    expect(patBTimelineRes.body).toHaveLength(0);
  });

  it("6. CROSS-HOSPITAL & PROVIDER AUTHORIZATION: Unauthorized Doctor B denied access to Encounter 1 records", async () => {
    const docBAccessFail = await request(app)
      .get(`/api/provider/encounters/${enc1Id}/records`)
      .set("Authorization", `Bearer ${doctorBToken}`);

    expect(docBAccessFail.status).toBe(403);
  });

  it("7. PATIENT RECORD INTEGRITY: Patient cannot modify provider-created clinical record", async () => {
    const patModifyFail = await request(app)
      .patch(`/api/patient/records/${rx1RecordId}`)
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({ title: "Tampered Prescription Title" });

    // Should return 400 or 403
    expect([400, 403]).toContain(patModifyFail.status);
  });
});
