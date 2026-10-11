import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { RecordCategory } from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Patient Documents Vault Integration Tests", () => {
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };
  let recordA_id: string;
  let documentA_id: string;

  beforeAll(async () => {
    // Isolated test cleanup on healthvault_test
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);

    // 1. Create Patient A
    const resRegA = await request(app).post("/api/auth/register").send({
      email: "patient-vault-a@example.com",
      password: "Password123!",
      firstName: "Vault",
      lastName: "UserA",
      role: "PATIENT"
    });
    const resLoginA = await request(app).post("/api/auth/login").send({
      email: "patient-vault-a@example.com",
      password: "Password123!"
    });
    userA = { id: resRegA.body.user.id, accessToken: resLoginA.body.accessToken };

    // 2. Create Patient B
    const resRegB = await request(app).post("/api/auth/register").send({
      email: "patient-vault-b@example.com",
      password: "Password123!",
      firstName: "Vault",
      lastName: "UserB",
      role: "PATIENT"
    });
    const resLoginB = await request(app).post("/api/auth/login").send({
      email: "patient-vault-b@example.com",
      password: "Password123!"
    });
    userB = { id: resRegB.body.user.id, accessToken: resLoginB.body.accessToken };

    // 3. Create Record for Patient A
    const recRes = await request(app)
      .post("/api/patient/records")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        category: RecordCategory.LAB_REPORT,
        title: "Blood Panel Report",
        occurredAt: "2024-01-15T00:00:00Z"
      });
    recordA_id = recRes.body.id;

    // 4. Attach a PDF document to Record A
    const pdfBuffer = Buffer.from("%PDF-1.4\n%Patient A Blood Panel Content\nEOF");
    const docRes = await request(app)
      .post(`/api/patient/records/${recordA_id}/documents`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", pdfBuffer, {
        filename: "blood_panel.pdf",
        contentType: "application/pdf"
      });
    expect(docRes.status).toBe(201);
    documentA_id = docRes.body.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);
  });

  it("1. Unauthenticated request to /api/patient/documents returns 401 Unauthorized", async () => {
    const res = await request(app).get("/api/patient/documents");
    expect(res.status).toBe(401);
  });

  it("2. Patient A retrieves their documents with serialized byteSize and metadata", async () => {
    const res = await request(app)
      .get("/api/patient/documents")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const doc = res.body[0];
    expect(doc.id).toBe(documentA_id);
    expect(doc.originalFilename).toBe("blood_panel.pdf");
    expect(doc.mimeType).toBe("application/pdf");
    expect(typeof doc.byteSize).toBe("string");
    expect(Number(doc.byteSize)).toBeGreaterThan(0);
    expect(doc.securityStatus).toBe("PENDING_SCAN");
    expect(doc.medicalRecordId).toBe(recordA_id);
  });

  it("3. Cross-patient isolation: Patient B gets an empty array and cannot see Patient A's documents", async () => {
    const res = await request(app)
      .get("/api/patient/documents")
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});
