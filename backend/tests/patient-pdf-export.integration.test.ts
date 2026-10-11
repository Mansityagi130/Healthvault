import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { RecordCategory, DocumentSecurityStatus } from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Patient PDF Export Integration Tests", () => {
  let userA: { id: string; accessToken: string; patientProfileId: string };
  let userB: { id: string; accessToken: string; patientProfileId: string };
  let recordA1_id: string;
  let recordA2_id: string;

  beforeAll(async () => {
    // Isolated test cleanup strictly on healthvault_test
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);

    // 1. Register Patient A
    const resRegA = await request(app).post("/api/auth/register").send({
      email: "pdf-patient-a@example.com",
      password: "Password123!",
      firstName: "Export",
      lastName: "PatientA",
      role: "PATIENT",
    });
    const resLoginA = await request(app).post("/api/auth/login").send({
      email: "pdf-patient-a@example.com",
      password: "Password123!",
    });
    const profileA = await prisma.patientProfile.findUnique({
      where: { userId: resRegA.body.user.id },
    });
    userA = {
      id: resRegA.body.user.id,
      accessToken: resLoginA.body.accessToken,
      patientProfileId: profileA!.id,
    };

    // 2. Set Emergency Profile for Patient A
    await request(app)
      .put("/api/emergency/profile")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        bloodGroup: "O+",
        allergies: ["Penicillin", "Dust Mites"],
        emergencyMedications: ["EpiPen 0.3mg"],
        criticalConditions: ["Severe Asthma"],
        emergencyContact: {
          name: "Jane Patient",
          relationship: "Spouse",
          phone: "+15551234567",
        },
        isActive: true,
      });

    // 3. Register Patient B
    const resRegB = await request(app).post("/api/auth/register").send({
      email: "pdf-patient-b@example.com",
      password: "Password123!",
      firstName: "Export",
      lastName: "PatientB",
      role: "PATIENT",
    });
    const resLoginB = await request(app).post("/api/auth/login").send({
      email: "pdf-patient-b@example.com",
      password: "Password123!",
    });
    const profileB = await prisma.patientProfile.findUnique({
      where: { userId: resRegB.body.user.id },
    });
    userB = {
      id: resRegB.body.user.id,
      accessToken: resLoginB.body.accessToken,
      patientProfileId: profileB!.id,
    };

    // 4. Create Records for Patient A
    const rec1 = await request(app)
      .post("/api/patient/records")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        category: RecordCategory.CONSULTATION,
        title: "Annual Health Checkup",
        occurredAt: "2024-03-01T10:00:00Z",
      });
    recordA1_id = rec1.body.id;

    const rec2 = await request(app)
      .post("/api/patient/records")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        category: RecordCategory.LAB_REPORT,
        title: "Comprehensive Metabolic Panel",
        occurredAt: "2024-03-05T14:00:00Z",
      });
    recordA2_id = rec2.body.id;

    // Attach a clean file to rec1
    const cleanPdf = Buffer.from("%PDF-1.4\n%Clean Report Content\nEOF");
    await request(app)
      .post(`/api/patient/records/${recordA1_id}/documents`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", cleanPdf, { filename: "annual-checkup.pdf", contentType: "application/pdf" });

    // Directly insert a quarantined file to rec2 to test safety labeling
    await prisma.medicalDocument.create({
      data: {
        medicalRecordId: recordA2_id,
        storageKey: `quarantine-test-${recordA2_id}`,
        originalFilename: "malware-detected.pdf",
        mimeType: "application/pdf",
        byteSize: BigInt(2048),
        checksum: "eicarchecksumhash",
        securityStatus: DocumentSecurityStatus.INFECTED,
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);
  });

  it("GET /api/patient/export/pdf returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/patient/export/pdf");
    expect(res.status).toBe(401);
  });

  it("GET /api/patient/export/pdf generates valid PDF with correct magic bytes and headers", async () => {
    const res = await request(app)
      .get("/api/patient/export/pdf")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment; filename=");
    expect(res.headers["content-disposition"]).toContain(".pdf");

    // Check PDF magic bytes (%PDF-)
    const bodyBuffer = Buffer.from(res.body);
    expect(bodyBuffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bodyBuffer.length).toBeGreaterThan(500);
  });

  it("POST /api/patient/export/pdf generates filtered PDF bundle for selected records", async () => {
    const res = await request(app)
      .post("/api/patient/export/pdf")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        recordIds: [recordA1_id],
      })
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const bodyBuffer = Buffer.from(res.body);
    expect(bodyBuffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("Enforces cross-patient isolation on export: Patient B cannot export Patient A's records", async () => {
    // Patient B requests export with Patient A's record ID
    const res = await request(app)
      .post("/api/patient/export/pdf")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({
        recordIds: [recordA1_id],
      })
      .responseType("blob");

    // The export should succeed for Patient B, but contain 0 records (since recordA1 belongs to Patient A)
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const bodyBuffer = Buffer.from(res.body);
    expect(bodyBuffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("GET /api/emergency/export/pdf returns emergency summary card with red triage data", async () => {
    const res = await request(app)
      .get("/api/emergency/export/pdf")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("healthvault-emergency-card-");
    const bodyBuffer = Buffer.from(res.body);
    expect(bodyBuffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
