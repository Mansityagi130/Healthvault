import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { RecordCategory, DocumentSecurityStatus } from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Patient-to-Patient QR Report Sharing Integration Tests (24-Hour Expiry & Mandatory Auth)", () => {
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };
  let record1_id: string;
  let record2_id: string; // record NOT shared
  let document1_clean_id: string;
  let document2_quarantine_id: string;
  let shareToken: string;
  let shareId: string;

  beforeAll(async () => {
    // Isolated test cleanup on healthvault_test
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);

    // 1. Create Sharing Patient (User A)
    const resRegA = await request(app).post("/api/auth/register").send({
      email: "patient-share-a@example.com",
      password: "Password123!",
      firstName: "Alice",
      lastName: "Smith",
      role: "PATIENT",
    });
    const resLoginA = await request(app).post("/api/auth/login").send({
      email: "patient-share-a@example.com",
      password: "Password123!",
    });
    userA = { id: resRegA.body.user.id, accessToken: resLoginA.body.accessToken };

    // 2. Create Recipient User (User B)
    const resRegB = await request(app).post("/api/auth/register").send({
      email: "patient-share-b@example.com",
      password: "Password123!",
      firstName: "Bob",
      lastName: "Jones",
      role: "PATIENT",
    });
    const resLoginB = await request(app).post("/api/auth/login").send({
      email: "patient-share-b@example.com",
      password: "Password123!",
    });
    userB = { id: resRegB.body.user.id, accessToken: resLoginB.body.accessToken };

    // 3. Create Record 1 for Patient A (will be shared)
    const rec1Res = await request(app)
      .post("/api/patient/records")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        category: RecordCategory.LAB_REPORT,
        title: "CBC Blood Test Report",
        occurredAt: "2026-09-01T10:00:00Z",
      });
    expect(rec1Res.status).toBe(201);
    record1_id = rec1Res.body.id;

    // 4. Create Record 2 for Patient A (will NOT be shared)
    const rec2Res = await request(app)
      .post("/api/patient/records")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        category: RecordCategory.CONSULTATION,
        title: "Confidential Psychiatry Note",
        occurredAt: "2026-09-02T10:00:00Z",
      });
    expect(rec2Res.status).toBe(201);
    record2_id = rec2Res.body.id;

    // 5. Attach Clean PDF document to Record 1
    const pdfCleanBuffer = Buffer.from("%PDF-1.4\n%Clean Document Test\n%%EOF");
    const docCleanRes = await request(app)
      .post(`/api/patient/records/${record1_id}/documents`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", pdfCleanBuffer, {
        filename: "cbc_report.pdf",
        contentType: "application/pdf",
      });
    expect(docCleanRes.status).toBe(201);
    document1_clean_id = docCleanRes.body.id;

    // Set document status to CLEAN in DB
    await prisma.medicalDocument.update({
      where: { id: document1_clean_id },
      data: { securityStatus: DocumentSecurityStatus.CLEAN },
    });

    // 6. Attach Quarantined document to Record 1
    const pdfQuarantineBuffer = Buffer.from("%PDF-1.4\n%Infected Or Pending Scan Document\n%%EOF");
    const docQuarantineRes = await request(app)
      .post(`/api/patient/records/${record1_id}/documents`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", pdfQuarantineBuffer, {
        filename: "suspect_attachment.pdf",
        contentType: "application/pdf",
      });
    expect(docQuarantineRes.status).toBe(201);
    document2_quarantine_id = docQuarantineRes.body.id;

    // Leave document2 as PENDING_SCAN / INFECTED
    await prisma.medicalDocument.update({
      where: { id: document2_quarantine_id },
      data: { securityStatus: DocumentSecurityStatus.INFECTED },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);
  });

  it("1. Patient A generates a QR share: backend calculates strict 24-hour expiration", async () => {
    const beforeCreation = Date.now();
    const res = await request(app)
      .post("/api/patient/report-shares")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        recordIds: [record1_id],
        title: "Blood Work Share",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("rawToken");
    expect(res.body).toHaveProperty("shareUrl");
    expect(res.body).toHaveProperty("expiresAt");
    expect(res.body.recordCount).toBe(1);

    shareToken = res.body.rawToken;
    shareId = res.body.id;

    const createdAt = new Date(res.body.createdAt).getTime();
    const expiresAt = new Date(res.body.expiresAt).getTime();
    const diffHours = (expiresAt - createdAt) / (1000 * 60 * 60);

    // Strictly 24 hours
    expect(Math.round(diffHours)).toBe(24);
    expect(expiresAt).toBeGreaterThan(beforeCreation + 23 * 60 * 60 * 1000);
  });

  it("2. Unauthenticated request to /api/shared-reports/:token returns 401 Unauthorized", async () => {
    const res = await request(app).get(`/api/shared-reports/${shareToken}`);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Unauthorized");
  });

  it("3. Authenticated recipient (User B) accesses shared reports: receives ONLY authorized Record 1", async () => {
    const res = await request(app)
      .get(`/api/shared-reports/${shareToken}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sharedBy");
    expect(res.body.sharedBy.firstName).toBe("Alice");
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].id).toBe(record1_id);
    expect(res.body.records[0].title).toBe("CBC Blood Test Report");

    // Verify Record 2 (unshared) is NOT in the response
    const ids = res.body.records.map((r: any) => r.id);
    expect(ids).not.toContain(record2_id);
  });

  it("4. Authenticated recipient can download CLEAN document", async () => {
    const res = await request(app)
      .get(`/api/shared-reports/${shareToken}/documents/${document1_clean_id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("cbc_report.pdf");
  });

  it("5. Authenticated recipient is blocked from downloading INFECTED/QUARANTINED document (403)", async () => {
    const res = await request(app)
      .get(`/api/shared-reports/${shareToken}/documents/${document2_quarantine_id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("quarantine");
  });

  it("6. IDOR Guard: recipient cannot download unauthorized document outside the share (404)", async () => {
    // Create an unshared document on Record 2
    const pdfBuf = Buffer.from("%PDF-1.4\n%Private Document\n%%EOF");
    const unsharedDocRes = await request(app)
      .post(`/api/patient/records/${record2_id}/documents`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", pdfBuf, {
        filename: "private.pdf",
        contentType: "application/pdf",
      });
    const unsharedDocId = unsharedDocRes.body.id;

    // Recipient attempts to download it using the valid shareToken
    const res = await request(app)
      .get(`/api/shared-reports/${shareToken}/documents/${unsharedDocId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("7. Expiration enforcement: expired share returns 410 Gone for metadata and downloads", async () => {
    // Manually set share expiresAt in the past
    await prisma.patientReportShare.update({
      where: { id: shareId },
      data: { expiresAt: new Date(Date.now() - 60000) }, // 1 minute in the past
    });

    const metaRes = await request(app)
      .get(`/api/shared-reports/${shareToken}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(metaRes.status).toBe(410);
    expect(metaRes.body.error).toContain("expired");

    const dlRes = await request(app)
      .get(`/api/shared-reports/${shareToken}/documents/${document1_clean_id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(dlRes.status).toBe(410);
  });

  it("8. Revocation enforcement: revoking an active share returns 403 Forbidden", async () => {
    // Create a new fresh share
    const freshShare = await request(app)
      .post("/api/patient/report-shares")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        recordIds: [record1_id],
        title: "Revocation Test Share",
      });
    const freshToken = freshShare.body.rawToken;
    const freshId = freshShare.body.id;

    // Access works initially
    const initRes = await request(app)
      .get(`/api/shared-reports/${freshToken}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(initRes.status).toBe(200);

    // Patient A revokes the share
    const revokeRes = await request(app)
      .delete(`/api/patient/report-shares/${freshId}/revoke`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(revokeRes.status).toBe(200);

    // Recipient now receives 403 Forbidden
    const afterRevokeRes = await request(app)
      .get(`/api/shared-reports/${freshToken}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(afterRevokeRes.status).toBe(403);
    expect(afterRevokeRes.body.error).toContain("revoked");

    const docRevokeRes = await request(app)
      .get(`/api/shared-reports/${freshToken}/documents/${document1_clean_id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(docRevokeRes.status).toBe(403);
  });

  it("9. Patient A lists all their report shares via /api/patient/report-shares", async () => {
    const res = await request(app)
      .get("/api/patient/report-shares")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.shares).toBeInstanceOf(Array);
    expect(res.body.shares.length).toBeGreaterThanOrEqual(2);
  });

  it("10. Patient A generates an instant QR share without selecting records (automatically shares all patient records)", async () => {
    const res = await request(app)
      .post("/api/patient/report-shares")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({}); // No recordIds passed

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("rawToken");
    expect(res.body).toHaveProperty("shareUrl");
    expect(res.body).toHaveProperty("expiresAt");
    expect(res.body.recordCount).toBe(2);

    // Authenticated recipient can view all records
    const viewRes = await request(app)
      .get(`/api/shared-reports/${res.body.rawToken}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(viewRes.status).toBe(200);
    expect(viewRes.body.records.length).toBe(2);
  });
});
