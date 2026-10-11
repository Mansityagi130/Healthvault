import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Phase 3A Journey: Discover → Book → Visit → Consultation → Diagnose", () => {
  let patientAToken: string;
  let patientAUserId: string;

  let patientBToken: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let doctorBToken: string;

  let hospitalAId: string;
  let hospitalBId: string;
  let departmentAId: string;

  let appointmentId: string;
  let encounterId: string;

  const testDate = "2026-11-15";

  beforeAll(async () => {
    // 1. Clean Database
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Setup Hospital A & Department A
    await request(app).post("/api/auth/register").send({
      email: "hosp-admin-a@example.com",
      password: "Password123!",
      firstName: "Admin",
      lastName: "HospA",
      role: "HOSPITAL_ADMIN"
    });
    const hospA = await prisma.hospital.create({
      data: { name: "City General Hospital", code: "HOSP-A" }
    });
    hospitalAId = hospA.id;

    const deptA = await prisma.department.create({
      data: { name: "Cardiology", hospitalId: hospitalAId }
    });
    departmentAId = deptA.id;

    // Setup Hospital B
    const hospB = await prisma.hospital.create({
      data: { name: "Metro Care Hospital", code: "HOSP-B" }
    });
    hospitalBId = hospB.id;

    // 3. Setup Doctor A (Cardiology at Hospital A)
    const docARes = await request(app).post("/api/auth/register").send({
      email: "doctor-a@example.com",
      password: "Password123!",
      firstName: "Alice",
      lastName: "Heart",
      role: "PROVIDER"
    });
    doctorAUserId = docARes.body.user.id;

    const docAProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: "REG-CARDIO-101",
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
      email: "doctor-a@example.com",
      password: "Password123!"
    });
    doctorAToken = docALogin.body.accessToken;

    // 4. Setup Doctor B (Orthopedics at Hospital B)
    const docBRes = await request(app).post("/api/auth/register").send({
      email: "doctor-b@example.com",
      password: "Password123!",
      firstName: "Bob",
      lastName: "Bone",
      role: "PROVIDER"
    });
    const docBUserId = docBRes.body.user.id;

    await prisma.doctorProfile.create({
      data: {
        userId: docBUserId,
        registrationNumber: "REG-ORTHO-202",
        specialty: "Orthopedics",
        verificationStatus: "VERIFIED"
      }
    });

    await prisma.hospitalMembership.create({
      data: {
        userId: docBUserId,
        hospitalId: hospitalBId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });

    const docBLogin = await request(app).post("/api/auth/login").send({
      email: "doctor-b@example.com",
      password: "Password123!"
    });
    doctorBToken = docBLogin.body.accessToken;

    // 5. Setup Patient A & Patient B
    const patARes = await request(app).post("/api/auth/register").send({
      email: "patient-a@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha",
      role: "PATIENT"
    });
    patientAUserId = patARes.body.user.id;

    const patALogin = await request(app).post("/api/auth/login").send({
      email: "patient-a@example.com",
      password: "Password123!"
    });
    patientAToken = patALogin.body.accessToken;

    await request(app).post("/api/auth/register").send({
      email: "patient-b@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Beta",
      role: "PATIENT"
    });

    const patBLogin = await request(app).post("/api/auth/login").send({
      email: "patient-b@example.com",
      password: "Password123!"
    });
    patientBToken = patBLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
  });

  it("1. DISCOVER: Patient searches for Cardiology providers", async () => {
    const res = await request(app)
      .get("/api/appointments/providers?specialty=Cardiology")
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].specialty).toBe("Cardiology");
    expect(res.body[0].doctorId).toBe(doctorAProfileId);
    expect(res.body[0].hospitals[0].hospitalId).toBe(hospitalAId);
  });

  it("2. BOOK: Patient views slot availability and books appointment", async () => {
    // Check availability
    const availRes = await request(app)
      .get(`/api/appointments/availability?doctorId=${doctorAProfileId}&hospitalId=${hospitalAId}&date=${testDate}`)
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(availRes.status).toBe(200);
    expect(availRes.body.slots.length).toBeGreaterThan(0);
    const firstSlot = availRes.body.slots[0];
    expect(firstSlot.available).toBe(true);

    // Book appointment
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        departmentId: departmentAId,
        appointmentDate: testDate,
        startTime: firstSlot.startTime,
        endTime: firstSlot.endTime,
        reason: "Routine cardiac checkup"
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body).toHaveProperty("id");
    expect(bookRes.body.status).toBe("SCHEDULED");
    appointmentId = bookRes.body.id;
  });

  it("3. DOUBLE-BOOKING PROTECTION: Second patient cannot book same slot", async () => {
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientBToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        appointmentDate: testDate,
        startTime: "09:00",
        endTime: "09:30",
        reason: "Duplicate attempt"
      });

    expect(bookRes.status).toBe(400);
    expect(bookRes.body.error).toContain("Slot is no longer available");
  });

  it("4. VISIT / CHECK-IN: Appointment check-in links and activates Encounter", async () => {
    const checkInRes = await request(app)
      .post(`/api/appointments/${appointmentId}/check-in`)
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.status).toBe("CHECKED_IN");
    expect(checkInRes.body).toHaveProperty("encounterId");
    encounterId = checkInRes.body.encounterId;

    expect(encounterId).toBeDefined();
  });

  it("5. DOCTOR VIEW & SECURITY: Assigned doctor accesses encounter, unauthorized doctor fails", async () => {
    // Assigned doctor retrieves encounter list
    const docEncRes = await request(app)
      .get("/api/provider/encounters")
      .set("Authorization", `Bearer ${doctorAToken}`);

    expect(docEncRes.status).toBe(200);
    const enc = docEncRes.body.find((e: { id: string }) => e.id === encounterId);
    expect(enc).toBeDefined();
    expect(enc.status).toBe("CHECKED_IN");

    // Unauthorized Doctor B tries to access records for Doctor A's encounter
    const unauthRes = await request(app)
      .get(`/api/provider/encounters/${encounterId}/records`)
      .set("Authorization", `Bearer ${doctorBToken}`);

    expect(unauthRes.status).toBe(403);
  });

  it("6. CONSULTATION & DIAGNOSIS: Doctor authors consultation and advances encounter to IN_PROGRESS", async () => {
    const consultRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "Shortness of breath and mild chest pain",
        clinicalNotes: "Auscultation reveals normal heart sounds, S1/S2 present. ECG shows ST elevation.",
        assessment: "Acute Coronary Syndrome / Angina Pectoris",
        plan: "Sublingual Nitroglycerin 0.4mg PRN, troponin lab test, follow-up in 3 days"
      });

    expect(consultRes.status).toBe(201);
    expect(consultRes.body.category).toBe("CONSULTATION");
    expect(consultRes.body.provenanceStatus).toBe("PROVIDER_CREATED");
    expect(consultRes.body.consultation).toBeDefined();

    // Verify encounter automatically transitioned to IN_PROGRESS
    const encRes = await request(app)
      .get("/api/provider/encounters")
      .set("Authorization", `Bearer ${doctorAToken}`);

    const enc = encRes.body.find((e: { id: string }) => e.id === encounterId);
    expect(enc.status).toBe("IN_PROGRESS");
  });

  it("7. ENCOUNTER COMPLETION & IMMUTABILITY: Doctor completes encounter, preventing further edits", async () => {
    // Complete encounter
    const completeRes = await request(app)
      .patch(`/api/provider/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({ status: "COMPLETED" });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("COMPLETED");

    // Immutability check: cannot author consultation on COMPLETED encounter
    const failConsultRes = await request(app)
      .post(`/api/provider/encounters/${encounterId}/consultations`)
      .set("Authorization", `Bearer ${doctorAToken}`)
      .send({
        chiefComplaint: "Late complaint",
        clinicalNotes: "Late notes",
        assessment: "Late assessment",
        plan: "Late plan"
      });

    expect(failConsultRes.status).toBe(400);
    expect(failConsultRes.body.error).toContain("Can only create records for CHECKED_IN, IN_PROGRESS or ACTIVE encounters");
  });

  it("8. PATIENT HISTORY: Patient views resulting clinical record; unauthorized patient denied", async () => {
    // Patient A retrieves medical records
    const patRecordsRes = await request(app)
      .get("/api/patient/records")
      .set("Authorization", `Bearer ${patientAToken}`);

    expect(patRecordsRes.status).toBe(200);
    expect(patRecordsRes.body.items.length).toBeGreaterThan(0);
    const consultRecord = patRecordsRes.body.items.find((r: { category: string }) => r.category === "CONSULTATION");
    expect(consultRecord).toBeDefined();

    // Patient B attempting to access Patient A's record detail directly
    const unauthPatRes = await request(app)
      .get(`/api/patient/records/${consultRecord.id}`)
      .set("Authorization", `Bearer ${patientBToken}`);

    expect([403, 404]).toContain(unauthPatRes.status);
  });
});
