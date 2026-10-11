import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { AbdmService } from "../src/interoperability/abdm/abdm.service.js";
import { sweepConsentsJob } from "../src/jobs/outbox-poller.js";
import { AuditAction, AccountStatus } from "../src/generated/prisma/enums.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const prisma = databaseClient.getClient();

describe("Automated ABDM Consent Expiration Outbox Worker Integration", () => {
  let userA: { id: string; accessToken: string };
  let patientProfileA: any;
  let expiredTxId: string;
  let activeTxId: string;

  beforeAll(async () => {
    // Clean test data in correct foreign key hierarchy order
    await prisma.notification.deleteMany({
      where: { user: { email: "abdm_exp_user@test.com" } }
    });
    await prisma.outboxEvent.deleteMany({ where: { topic: "ABDM_EXCHANGE" } });
    await prisma.auditLog.deleteMany({ where: { action: AuditAction.CONSENT_REVOKED } });
    await prisma.externalExchangeTransaction.deleteMany();
    await prisma.patientProfile.deleteMany({
      where: { user: { email: "abdm_exp_user@test.com" } }
    });
    await prisma.user.deleteMany({ where: { email: "abdm_exp_user@test.com" } });

    // Create test user directly via Prisma for deterministic fast execution
    const dbUser = await prisma.user.create({
      data: {
        email: "abdm_exp_user@test.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuu",
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
      }
    });

    patientProfileA = await prisma.patientProfile.create({
      data: {
        userId: dbUser.id,
        firstName: "AbdmExp",
        lastName: "Patient",
        dateOfBirth: new Date("1990-01-01"),
        sexAtBirth: "MALE",
      }
    });

    const token = jwt.sign(
      { sub: dbUser.id, sessionId: "sess_abdm_test_123", type: "access" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "1h", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    userA = { id: dbUser.id, accessToken: token };

    // Create a past-due consent transaction (created 48 hours ago)
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const expiredTx = await prisma.externalExchangeTransaction.create({
      data: {
        type: "CONSENT_REQUEST",
        patientId: patientProfileA.id,
        status: "REQUESTED",
        createdAt: oldDate,
      }
    });
    expiredTxId = expiredTx.id;

    // Create a recent active consent transaction (created 5 minutes ago)
    const activeTx = await prisma.externalExchangeTransaction.create({
      data: {
        type: "CONSENT_REQUEST",
        patientId: patientProfileA.id,
        status: "REQUESTED",
        createdAt: new Date(),
      }
    });
    activeTxId = activeTx.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { user: { email: "abdm_exp_user@test.com" } }
    });
    await prisma.outboxEvent.deleteMany({ where: { topic: "ABDM_EXCHANGE" } });
    await prisma.auditLog.deleteMany({ where: { action: AuditAction.CONSENT_REVOKED } });
    await prisma.externalExchangeTransaction.deleteMany();
    await prisma.patientProfile.deleteMany({
      where: { user: { email: "abdm_exp_user@test.com" } }
    });
    await prisma.user.deleteMany({ where: { email: "abdm_exp_user@test.com" } });
  });

  it("returns 401 Unauthorized when no authentication token is provided to manual sweep route", async () => {
    const res = await request(app).post("/api/interoperability/abdm/consent/sweep");
    expect(res.status).toBe(401);
  });

  it("automatically sweeps past-due consent requests via recurring background worker job (sweepConsentsJob)", async () => {
    // Directly invoke the background job function registered in outbox-poller startup loop
    await sweepConsentsJob();

    // Verify expired transaction status in DB
    const dbExpiredTx = await prisma.externalExchangeTransaction.findUnique({
      where: { id: expiredTxId }
    });
    expect(dbExpiredTx?.status).toBe("EXPIRED");

    // Verify active transaction remains REQUESTED
    const dbActiveTx = await prisma.externalExchangeTransaction.findUnique({
      where: { id: activeTxId }
    });
    expect(dbActiveTx?.status).toBe("REQUESTED");
  });

  it("creates outbox event and audit log for swept expired consent", async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        targetId: expiredTxId,
        action: AuditAction.CONSENT_REVOKED
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        topic: "ABDM_EXCHANGE"
      }
    });
    const matchEvent = outboxEvents.find(e => (e.payload as any)?.transactionId === expiredTxId);
    expect(matchEvent).toBeDefined();
    expect((matchEvent?.payload as any)?.status).toBe("EXPIRED");
  });

  it("is idempotent on subsequent background worker job executions", async () => {
    await expect(sweepConsentsJob()).resolves.not.toThrow();
  });

  it("allows manual authenticated REST endpoint invocation for on-demand sweep with default threshold when omitted", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sweptCount).toBe(0); // 0 because background job already swept it
  });

  it("accepts valid custom maxAgeMinutes parameter for manual sweep", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: 720 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sweptCount).toBe(0);
  });

  it("rejects negative maxAgeMinutes values with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("maxAgeMinutes must be at least 1");
  });

  it("rejects zero maxAgeMinutes with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("maxAgeMinutes must be at least 1");
  });

  it("rejects non-integer maxAgeMinutes with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: 12.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("maxAgeMinutes must be an integer");
  });

  it("rejects malformed string maxAgeMinutes with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: "not_a_number" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number|integer|invalid/i);
  });

  it("rejects excessive maxAgeMinutes (> 525600) with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/interoperability/abdm/consent/sweep")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ maxAgeMinutes: 1000000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("maxAgeMinutes cannot exceed 525600");
  });

  it("prevents duplicate audit logs, outbox events, and notifications during parallel concurrent sweeps", async () => {
    // Create a new past-due consent request specifically for concurrency testing
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const concurrentTx = await prisma.externalExchangeTransaction.create({
      data: {
        type: "CONSENT_REQUEST",
        patientId: patientProfileA.id,
        status: "REQUESTED",
        createdAt: oldDate,
      }
    });

    // Execute two concurrent sweeps in parallel
    const [res1, res2] = await Promise.all([
      AbdmService.sweepExpiredConsents(1440),
      AbdmService.sweepExpiredConsents(1440)
    ]);

    // Combined swept count across both runs must equal exactly 1
    const totalSwept = res1.sweptCount + res2.sweptCount;
    expect(totalSwept).toBe(1);

    // Verify exactly ONE audit log record was created for this transaction
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        targetId: concurrentTx.id,
        action: AuditAction.CONSENT_REVOKED
      }
    });
    expect(auditLogs.length).toBe(1);

    // Verify exactly ONE outbox event record was created for this transaction
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        topic: "ABDM_EXCHANGE"
      }
    });
    const matchEvents = outboxEvents.filter(e => (e.payload as any)?.transactionId === concurrentTx.id);
    expect(matchEvents.length).toBe(1);

    // Verify exactly ONE notification record was created for this user and transaction
    const notifications = await prisma.notification.findMany({
      where: {
        userId: patientProfileA.userId,
        type: "CONSENT_DECISION"
      }
    });
    const matchNotifications = notifications.filter(n => (n.payload as any)?.relatedResource?.id === concurrentTx.id);
    expect(matchNotifications.length).toBe(1);

    // Verify transaction status is EXPIRED in database
    const dbTx = await prisma.externalExchangeTransaction.findUnique({
      where: { id: concurrentTx.id }
    });
    expect(dbTx?.status).toBe("EXPIRED");
  });
});
