import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Emergency Workflow Integration Tests", () => {
  let patientToken: string;
  let patientUserId: string;
  let providerToken: string;
  let providerUserId: string;
  let hospitalId: string;
  let qrSelector: string;
  let rawQrToken: string;

  beforeAll(async () => {
    const genPhone = () => "+919" + Math.floor(100000000 + Math.random() * 900000000);
    // 1. Create Patient User & Profile
    const patientEmail = `emergency.patient.${Date.now()}@example.com`;
    const patientRegRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: patientEmail,
        password: "EmergencyPassword123!",
        firstName: "Jane",
        lastName: "Doe",
        phone: genPhone()
      });
    expect(patientRegRes.status).toBe(201);

    const patientLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: patientEmail, password: "EmergencyPassword123!" });
    expect(patientLoginRes.status).toBe(200);
    patientToken = patientLoginRes.body.accessToken;
    patientUserId = patientLoginRes.body.user.id;

    // 2. Create Provider User & Doctor Profile & Hospital Membership
    const providerEmail = `emergency.doc.${Date.now()}@example.com`;
    const docRegRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: providerEmail,
        password: "DoctorPassword123!",
        firstName: "Dr. Emergency",
        lastName: "Smith",
        phone: genPhone()
      });
    expect(docRegRes.status).toBe(201);

    const docLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: providerEmail, password: "DoctorPassword123!" });
    expect(docLoginRes.status).toBe(200);
    providerToken = docLoginRes.body.accessToken;
    providerUserId = docLoginRes.body.user.id;

    // Create Doctor Profile
    await prisma.doctorProfile.create({
      data: {
        userId: providerUserId,
        registrationNumber: `REG-EMERGENCY-${Date.now()}`,
        specialty: "Emergency Medicine",
        verificationStatus: "VERIFIED"
      }
    });

    // Create Hospital and active Doctor Membership
    const hospital = await prisma.hospital.create({
      data: {
        name: "City Emergency General Hospital",
        code: `HOSP-EMERGENCY-${Date.now()}`,
        verificationStatus: "VERIFIED"
      }
    });
    hospitalId = hospital.id;

    await prisma.hospitalMembership.create({
      data: {
        hospitalId,
        userId: providerUserId,
        role: "DOCTOR",
        status: "ACTIVE"
      }
    });
  });

  it("1. Patient can retrieve and update emergency profile", async () => {
    const getRes = await request(app)
      .get("/api/emergency/profile")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.isActive).toBe(true);

    const updateRes = await request(app)
      .put("/api/emergency/profile")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        bloodGroup: "O+",
        allergies: ["Penicillin", "Peanuts"],
        emergencyMedications: ["EpiPen", "Albuterol"],
        criticalConditions: ["Severe Asthma", "Type 1 Diabetes"],
        emergencyContact: {
          name: "John Doe",
          relationship: "Spouse",
          phone: "+15550199444"
        },
        isActive: true
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.bloodGroup).toBe("O+");
    expect(updateRes.body.allergies).toContain("Penicillin");
  });

  it("2. Patient can generate an emergency QR token", async () => {
    const qrRes = await request(app)
      .post("/api/emergency/qr")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ durationHours: 48, maxUses: 5 });

    expect(qrRes.status).toBe(201);
    expect(qrRes.body.selector).toBeDefined();
    expect(qrRes.body.token).toBeDefined();
    qrSelector = qrRes.body.selector;
    rawQrToken = qrRes.body.token;

    // Verify token does NOT expose raw medical data in QR response
    expect(qrRes.body.bloodGroup).toBeUndefined();
    expect(qrRes.body.allergies).toBeUndefined();

    // Verify DB stores SHA-256 hash, NOT raw secret
    const dbToken = await prisma.emergencyProfileAccessToken.findUnique({
      where: { selector: qrSelector }
    });
    expect(dbToken).toBeDefined();
    expect(dbToken?.tokenHash).not.toBe(rawQrToken);
  });

  it("3. Unauthenticated or empty-reason break-glass request is rejected", async () => {
    // Unauthenticated
    const unauthRes = await request(app)
      .post("/api/emergency/access/resolve")
      .send({ selector: qrSelector, token: rawQrToken, reason: "Emergency treatment" });
    expect(unauthRes.status).toBe(401);

    // Empty reason
    const emptyReasonRes = await request(app)
      .post("/api/emergency/access/resolve")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ selector: qrSelector, token: rawQrToken, reason: "  " });
    expect(emptyReasonRes.status).toBe(400);
  });

  it("4. Invalid or wrong secret token is rejected", async () => {
    const wrongTokenRes = await request(app)
      .post("/api/emergency/access/resolve")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ selector: qrSelector, token: "wrong_secret_token_12345678901234567890", reason: "Patient unresponsive in ER" });
    expect(wrongTokenRes.status).toBe(400);
  });

  it("5. Authorized provider can resolve emergency access with break-glass reason", async () => {
    const resolveRes = await request(app)
      .post("/api/emergency/access/resolve")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        selector: qrSelector,
        token: rawQrToken,
        reason: "Patient unconscious following acute asthma episode in ER"
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.bloodGroup).toBe("O+");
    expect(resolveRes.body.allergies).toContain("Penicillin");
    expect(resolveRes.body.emergencyMedications).toContain("EpiPen");
    expect(resolveRes.body.emergencyContact.name).toBe("John Doe");
    expect(resolveRes.body.emergencyEncounterId).toBeDefined();

    // Verify AccessLog entry
    const accessLog = await prisma.accessLog.findFirst({
      where: {
        actorUserId: providerUserId,
        action: "EMERGENCY_VIEW"
      }
    });
    expect(accessLog).toBeDefined();
    expect(accessLog?.purpose).toBe("Patient unconscious following acute asthma episode in ER");

    // Verify Patient Notification
    const notifications = await prisma.notification.findMany({
      where: { userId: patientUserId, type: "EMERGENCY_ACCESS" }
    });
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("6. Patient can view emergency access audit history", async () => {
    const historyRes = await request(app)
      .get("/api/emergency/history")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThan(0);
    expect(historyRes.body[0].reason).toBe("Patient unconscious following acute asthma episode in ER");
  });

  it("7. Revoked emergency QR token is immediately blocked", async () => {
    // Revoke QR
    const revokeRes = await request(app)
      .delete(`/api/emergency/qr/${qrSelector}`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(revokeRes.status).toBe(200);

    // Attempt break-glass access with revoked QR
    const revokedResolveRes = await request(app)
      .post("/api/emergency/access/resolve")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        selector: qrSelector,
        token: rawQrToken,
        reason: "Attempting access with revoked token"
      });

    expect(revokedResolveRes.status).toBe(400);
  });
});
