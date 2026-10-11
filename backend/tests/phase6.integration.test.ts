import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { StorageFactory } from "../src/services/storage/StorageFactory.js";
import { LocalStorageProvider } from "../src/services/storage/LocalStorageProvider.js";
import { S3StorageProvider } from "../src/services/storage/S3StorageProvider.js";
import { ClamAVScanner } from "../src/services/scanner/ClamAVScanner.js";
import { AbdmService } from "../src/interoperability/abdm/abdm.service.js";

const prisma = databaseClient.getClient();

describe("Phase 6: Infrastructure & Security Architecture Tests", () => {
  let patientAToken: string;
  let patientAUserId: string;
  let patientAProfileId: string;

  let patientBToken: string;
  let patientBUserId: string;

  beforeAll(async () => {
    const emailA = `patientA_p6_${Date.now()}@example.com`;
    const emailB = `patientB_p6_${Date.now()}@example.com`;

    // Register Patient A
    const regA = await request(app).post("/api/auth/register").send({
      email: emailA,
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha"
    });
    patientAUserId = regA.body.user.id;
    const loginA = await request(app).post("/api/auth/login").send({
      email: emailA,
      password: "Password123!"
    });
    patientAToken = loginA.body.accessToken;

    const profileA = await prisma.patientProfile.findUnique({ where: { userId: patientAUserId } });
    patientAProfileId = profileA!.id;

    // Register Patient B
    const regB = await request(app).post("/api/auth/register").send({
      email: emailB,
      password: "Password123!",
      firstName: "Patient",
      lastName: "Beta"
    });
    patientBUserId = regB.body.user.id;
    const loginB = await request(app).post("/api/auth/login").send({
      email: emailB,
      password: "Password123!"
    });
    patientBToken = loginB.body.accessToken;
  });

  afterAll(async () => {
    StorageFactory.resetInstance();
    await prisma.$disconnect();
  });

  describe("1. Pluggable Storage Factory & Key Security", () => {
    it("should instantiate LocalStorageProvider by default when STORAGE_PROVIDER=local", () => {
      delete process.env.STORAGE_PROVIDER;
      StorageFactory.resetInstance();
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it("should instantiate S3StorageProvider when STORAGE_PROVIDER=s3", () => {
      process.env.STORAGE_PROVIDER = "s3";
      StorageFactory.resetInstance();
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(S3StorageProvider);
      delete process.env.STORAGE_PROVIDER;
      StorageFactory.resetInstance();
    });

    it("should reject invalid STORAGE_PROVIDER configuration at startup", () => {
      process.env.STORAGE_PROVIDER = "unsupported_provider_xyz";
      StorageFactory.resetInstance();
      expect(() => StorageFactory.getProvider()).toThrow(/Unsupported STORAGE_PROVIDER/);
      delete process.env.STORAGE_PROVIDER;
      StorageFactory.resetInstance();
    });

    it("should prevent path traversal attempts in LocalStorageProvider keys", async () => {
      const localProvider = new LocalStorageProvider();
      await expect(localProvider.get("../../etc/passwd")).rejects.toThrow("path traversal detected");
    });

    it("should prevent path traversal attempts in S3StorageProvider keys", async () => {
      const s3Provider = new S3StorageProvider();
      await expect(s3Provider.get("../secret_key")).rejects.toThrow("path traversal detected");
    });
  });

  describe("2. ClamAV Malware Scanner & Fail-Closed Security", () => {
    it("should return SCAN_FAILED fail-closed status when ClamAV daemon is unreachable", async () => {
      const scanner = new ClamAVScanner({ host: "127.0.0.1", port: 59999, timeoutMs: 300 });
      const result = await scanner.scan(Buffer.from("Clean file content"));
      expect(result.status).toBe("SCAN_FAILED");
    });
  });

  describe("3. Local ABDM Transaction State Machine & Outbox", () => {
    let transactionId: string;

    it("should create consent request in REQUESTED state and emit outbox event", async () => {
      const res = await request(app)
        .post("/api/interoperability/abdm/consent/request")
        .set("Authorization", `Bearer ${patientAToken}`)
        .send({
          abhaAddress: "patientA@sbx",
          purpose: "PATIENT_CARE"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transaction.status).toBe("REQUESTED");
      transactionId = res.body.transaction.id;

      const outbox = await prisma.outboxEvent.findFirst({
        where: { topic: "ABDM_EXCHANGE" },
        orderBy: { createdAt: "desc" }
      });
      expect(outbox).not.toBeNull();
      expect((outbox!.payload as any).transactionId).toBe(transactionId);
    });

    it("should allow patient to transition REQUESTED transaction to GRANTED", async () => {
      const res = await request(app)
        .post(`/api/interoperability/abdm/consent/transactions/${transactionId}/status`)
        .set("Authorization", `Bearer ${patientAToken}`)
        .send({ status: "GRANTED" });

      expect(res.status).toBe(200);
      expect(["GRANTED", "AUTHORIZED"]).toContain(res.body.transaction.status);
    });

    it("should REJECT invalid state transitions from terminal state (GRANTED -> DENIED)", async () => {
      const res = await request(app)
        .post(`/api/interoperability/abdm/consent/transactions/${transactionId}/status`)
        .set("Authorization", `Bearer ${patientAToken}`)
        .send({ status: "DENIED" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid state transition");
    });

    it("should DENY Patient B from modifying Patient A's ABDM transaction status", async () => {
      const res = await request(app)
        .post(`/api/interoperability/abdm/consent/transactions/${transactionId}/status`)
        .set("Authorization", `Bearer ${patientBToken}`)
        .send({ status: "DENIED" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unauthorized");
    });
  });
});
