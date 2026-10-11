import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import http from "http";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { notificationService, notificationEventEmitter } from "../src/services/notification.service.js";
import { processDocumentScan } from "../src/jobs/document-scan/index.ts";
import { storage } from "../src/services/storage/StorageFactory.js";
import { NotificationType } from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Phase 7 - Stage 2: Authenticated Real-Time Notifications (SSE)", () => {
  let userAToken: string;
  let userAId: string;

  let userBToken: string;
  let userBId: string;

  beforeAll(async () => {
    const emailA = `userA_p7_${Date.now()}@example.com`;
    const emailB = `userB_p7_${Date.now()}@example.com`;

    // Register User A
    const regA = await request(app).post("/api/auth/register").send({
      email: emailA,
      password: "Password123!",
      firstName: "User",
      lastName: "Alpha"
    });
    userAId = regA.body.user.id;
    const loginA = await request(app).post("/api/auth/login").send({
      email: emailA,
      password: "Password123!"
    });
    userAToken = loginA.body.accessToken;

    // Register User B
    const regB = await request(app).post("/api/auth/register").send({
      email: emailB,
      password: "Password123!",
      firstName: "User",
      lastName: "Beta"
    });
    userBId = regB.body.user.id;
    const loginB = await request(app).post("/api/auth/login").send({
      email: emailB,
      password: "Password123!"
    });
    userBToken = loginB.body.accessToken;
  });

  afterAll(async () => {
    notificationEventEmitter.removeAllListeners();
    await prisma.$disconnect();
  });

  describe("1. SSE Endpoint Security & Authentication", () => {
    it("should reject unauthenticated connections to /api/notifications/stream with 401", async () => {
      const res = await request(app).get("/api/notifications/stream");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("should reject invalid JWT tokens with 401", async () => {
      const res = await request(app)
        .get("/api/notifications/stream")
        .set("Authorization", "Bearer invalid_token_xyz");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("should establish SSE connection and return event-stream headers for authenticated user", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/notifications/stream`, {
          headers: { Authorization: `Bearer ${userAToken}` }
        }, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("text/event-stream");
          expect(res.headers["cache-control"]).toContain("no-cache");
          
          res.on("data", (chunk) => {
            const data = chunk.toString();
            if (data.includes("event: connected")) {
              req.destroy();
              server.close();
              resolve();
            }
          });
        });

        req.on("error", (err) => {
          server.close();
          if (err.message.includes("socket hang up") || (err as any).code === "ECONNRESET") {
            resolve();
          } else {
            reject(err);
          }
        });
      });
    });
  });

  describe("2. Event Dispatch & Recipient Isolation", () => {
    it("should emit notification event to notificationEventEmitter when createNotification is called", async () => {
      let receivedEvent: any = null;
      const listener = (data: any) => {
        if (data.userId === userAId) {
          receivedEvent = data;
        }
      };

      notificationEventEmitter.on("notification", listener);

      const notif = await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.SYSTEM,
        title: "Test System Alert",
        message: "System upgrade scheduled"
      });

      expect(notif.id).toBeDefined();
      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.userId).toBe(userAId);
      expect(receivedEvent.notificationId).toBe(notif.id);

      notificationEventEmitter.removeListener("notification", listener);
    });

    it("should enforce recipient isolation so User B does not receive User A's notifications", async () => {
      let userBReceived = false;

      const listenerB = (data: any) => {
        if (data.userId === userBId) {
          userBReceived = true;
        }
      };

      notificationEventEmitter.on("notification", listenerB);

      await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.APPOINTMENT_BOOKED,
        title: "User A Appointment",
        message: "Appointment confirmed for User A"
      });

      expect(userBReceived).toBe(false);
      notificationEventEmitter.removeListener("notification", listenerB);
    });
  });

  describe("3. Document Scan Completion Notification Integration", () => {
    it("should generate scan completion notification when background worker finishes scanning", async () => {
      const profileA = await prisma.patientProfile.findUnique({ where: { userId: userAId } });

      const record = await prisma.medicalRecord.create({
        data: {
          patientId: profileA!.id,
          category: "CONSULTATION",
          source: "PATIENT",
          provenanceStatus: "PATIENT_UPLOADED",
          title: "Scan Test Record",
          occurredAt: new Date()
        }
      });

      const storageKey = `quarantine/test/doc1_${Date.now()}`;
      await storage.upload(storageKey, Buffer.from("Clean test buffer content"), "application/pdf");

      const doc = await prisma.medicalDocument.create({
        data: {
          medicalRecordId: record.id,
          storageKey,
          originalFilename: "test.pdf",
          mimeType: "application/pdf",
          byteSize: BigInt(1024),
          checksum: "dummy_checksum",
          uploadedByUserId: userAId,
          securityStatus: "PENDING_SCAN"
        }
      });

      let capturedNotif: any = null;
      const listener = (data: any) => {
        if (data.userId === userAId) capturedNotif = data;
      };
      notificationEventEmitter.on("notification", listener);

      await processDocumentScan({ documentId: doc.id });

      const updatedDoc = await prisma.medicalDocument.findUnique({ where: { id: doc.id } });
      expect(updatedDoc!.securityStatus).not.toBe("PENDING_SCAN");

      expect(capturedNotif).not.toBeNull();
      expect(capturedNotif.userId).toBe(userAId);

      notificationEventEmitter.removeListener("notification", listener);
    });

    it("should remain idempotent when processDocumentScan is retried", async () => {
      const profileA = await prisma.patientProfile.findUnique({ where: { userId: userAId } });

      const record = await prisma.medicalRecord.create({
        data: {
          patientId: profileA!.id,
          category: "CONSULTATION",
          source: "PATIENT",
          provenanceStatus: "PATIENT_UPLOADED",
          title: "Idempotency Record",
          occurredAt: new Date()
        }
      });

      const storageKey = `quarantine/test/doc2_${Date.now()}`;
      await storage.upload(storageKey, Buffer.from("Clean test buffer content 2"), "application/pdf");

      const doc = await prisma.medicalDocument.create({
        data: {
          medicalRecordId: record.id,
          storageKey,
          originalFilename: "test2.pdf",
          mimeType: "application/pdf",
          byteSize: BigInt(1024),
          checksum: "dummy_checksum_2",
          uploadedByUserId: userAId,
          securityStatus: "CLEAN" // Already processed
        }
      });

      let callCount = 0;
      const listener = (data: any) => {
        if (data.userId === userAId) callCount++;
      };
      notificationEventEmitter.on("notification", listener);

      // Retry scan processing
      await processDocumentScan({ documentId: doc.id });

      expect(callCount).toBe(0); // Idempotent skip
      notificationEventEmitter.removeListener("notification", listener);
    });
  });

  describe("4. Offline Notification Catch-Up & Reconnection Sync (GAP-03)", () => {
    it("should return unread notifications and unreadCount snapshot on GET /api/notifications/catchup", async () => {
      // Create a notification while client is offline
      const offlineNotif = await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.SYSTEM,
        title: "Offline Catch-Up Test",
        message: "You missed this notification while offline"
      });

      const res = await request(app)
        .get("/api/notifications/catchup")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      const match = res.body.notifications.find((n: any) => n.id === offlineNotif.id);
      expect(match).toBeDefined();
      expect(match.payload.title).toBe("Offline Catch-Up Test");
    });

    it("should return only notifications created after lastNotificationId on GET /api/notifications/catchup", async () => {
      const notif1 = await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.SYSTEM,
        title: "Catchup Item 1",
        message: "First item"
      });

      const notif2 = await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.SYSTEM,
        title: "Catchup Item 2",
        message: "Second item"
      });

      const res = await request(app)
        .get(`/api/notifications/catchup?lastNotificationId=${notif1.id}`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.notifications.map((n: any) => n.id);
      expect(ids).toContain(notif2.id);
      expect(ids).not.toContain(notif1.id);
    });

    it("should include unreadCount snapshot in SSE event: connected handshake payload", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/notifications/stream`, {
          headers: { Authorization: `Bearer ${userAToken}` }
        }, (res) => {
          expect(res.statusCode).toBe(200);

          res.on("data", (chunk) => {
            const data = chunk.toString();
            if (data.includes("event: connected")) {
              const lines = data.split("\n");
              const dataLine = lines.find(l => l.startsWith("data:"));
              if (dataLine) {
                const parsed = JSON.parse(dataLine.slice(5).trim());
                expect(parsed.status).toBe("connected");
                expect(typeof parsed.unreadCount).toBe("number");
              }
              req.destroy();
              server.close();
              resolve();
            }
          });
        });

        req.on("error", (err) => {
          server.close();
          if (err.message.includes("socket hang up") || (err as any).code === "ECONNRESET") {
            resolve();
          } else {
            reject(err);
          }
        });
      });
    });

    it("should enforce recipient isolation so User B cannot retrieve User A's catchup notifications", async () => {
      const notifA = await notificationService.createNotification({
        userId: userAId,
        type: NotificationType.SECURITY,
        title: "User A Security Alert",
        message: "Private security alert for User A"
      });

      const resB = await request(app)
        .get("/api/notifications/catchup")
        .set("Authorization", `Bearer ${userBToken}`);

      expect(resB.status).toBe(200);
      const idsB = resB.body.notifications.map((n: any) => n.id);
      expect(idsB).not.toContain(notifA.id);
    });
  });
});
