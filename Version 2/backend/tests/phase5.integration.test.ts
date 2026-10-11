import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Phase 5: Laboratory Workflow Integration Tests", () => {
  let platformAdminToken: string;
  let platformAdminUserId: string;

  let labAdminToken: string;
  let labAdminUserId: string;

  let techToken: string;
  let techUserId: string;

  let lab2AdminToken: string;

  let registeredLabId: string;
  let patientAUserId: string;
  let patientAProfileId: string;

  beforeAll(async () => {
    // 1. Cleanup
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Setup Platform Admin
    const regAdmin = await request(app).post("/api/auth/register").send({
      email: "platformadmin_p5@example.com",
      password: "Password123!",
      firstName: "Platform",
      lastName: "Admin"
    });
    platformAdminUserId = regAdmin.body.user.id;
    await prisma.user.update({
      where: { id: platformAdminUserId },
      data: { isPlatformAdmin: true }
    });
    const loginAdmin = await request(app).post("/api/auth/login").send({
      email: "platformadmin_p5@example.com",
      password: "Password123!"
    });
    platformAdminToken = loginAdmin.body.accessToken;

    // 3. Register Patient A
    const regPatA = await request(app).post("/api/auth/register").send({
      email: "patientA_p5@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha"
    });
    patientAUserId = regPatA.body.user.id;

    const patProfile = await prisma.patientProfile.findUnique({ where: { userId: patientAUserId } });
    patientAProfileId = patProfile!.id;

    // 4. Register Lab 2 Admin (for tenant isolation tests)
    const regLab2Admin = await request(app).post("/api/auth/register").send({
      email: "lab2admin_p5@example.com",
      password: "Password123!",
      firstName: "Lab2",
      lastName: "Admin"
    });
    const loginLab2Admin = await request(app).post("/api/auth/login").send({
      email: "lab2admin_p5@example.com",
      password: "Password123!"
    });
    lab2AdminToken = loginLab2Admin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Public Laboratory Registration Workflow", () => {
    it("should allow public registration of a new laboratory in PENDING verification status", async () => {
      const res = await request(app)
        .post("/api/labs/register")
        .send({
          name: "Apex Diagnostic Laboratories",
          address: { street: "500 BioTech Way", city: "Metro City" },
          adminEmail: "labadmin_p5@example.com",
          adminPassword: "Password123!",
          adminFirstName: "Dr. Apex",
          adminLastName: "Director"
        });

      expect(res.status).toBe(201);
      expect(res.body.lab.name).toBe("Apex Diagnostic Laboratories");
      expect(res.body.lab.verificationStatus).toBe("PENDING");
      registeredLabId = res.body.lab.id;

      // Login as Lab Admin
      const loginRes = await request(app).post("/api/auth/login").send({
        email: "labadmin_p5@example.com",
        password: "Password123!"
      });
      labAdminToken = loginRes.body.accessToken;
      labAdminUserId = loginRes.body.user.id;
    });
  });

  describe("2. Platform Admin Laboratory Verification", () => {
    it("should allow Platform Admin to view pending laboratory applications", async () => {
      const res = await request(app)
        .get("/api/admin/labs?verificationStatus=PENDING")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(registeredLabId);
    });

    it("should deny non-platform admin users from approving a laboratory", async () => {
      const res = await request(app)
        .post(`/api/admin/labs/${registeredLabId}/verify`)
        .set("Authorization", `Bearer ${labAdminToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow Platform Admin to verify a laboratory", async () => {
      const res = await request(app)
        .post(`/api/admin/labs/${registeredLabId}/verify`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.lab.verificationStatus).toBe("VERIFIED");
    });
  });

  describe("3. Lab Staff Onboarding & Invitations", () => {
    beforeAll(async () => {
      // Register tech user
      const regTech = await request(app).post("/api/auth/register").send({
        email: "labtech_p5@example.com",
        password: "Password123!",
        firstName: "Tech",
        lastName: "Bob"
      });
      techUserId = regTech.body.user.id;
      const loginTech = await request(app).post("/api/auth/login").send({
        email: "labtech_p5@example.com",
        password: "Password123!"
      });
      techToken = loginTech.body.accessToken;
    });

    it("should allow Lab Admin to invite staff user to laboratory", async () => {
      const res = await request(app)
        .post(`/api/labs/${registeredLabId}/invitations`)
        .set("Authorization", `Bearer ${labAdminToken}`)
        .send({
          email: "labtech_p5@example.com",
          role: "LAB_USER"
        });

      expect(res.status).toBe(201);
      expect(res.body.labId).toBe(registeredLabId);
      expect(res.body.userId).toBe(techUserId);
      expect(res.body.role).toBe("LAB_USER");
    });

    it("should reject duplicate lab staff invitation", async () => {
      const res = await request(app)
        .post(`/api/labs/${registeredLabId}/invitations`)
        .set("Authorization", `Bearer ${labAdminToken}`)
        .send({
          email: "labtech_p5@example.com",
          role: "LAB_USER"
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("already a member");
    });
  });

  describe("4. Laboratory Operations & Stats API", () => {
    it("should allow verified lab staff to fetch live dashboard statistics", async () => {
      const res = await request(app)
        .get(`/api/labs/${registeredLabId}/stats`)
        .set("Authorization", `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("draftCount");
      expect(res.body).toHaveProperty("finalizedTodayCount");
      expect(res.body).toHaveProperty("totalReportsCount");
    });

    it("should deny dashboard stats access to user without lab membership (Tenant Isolation)", async () => {
      const res = await request(app)
        .get(`/api/labs/${registeredLabId}/stats`)
        .set("Authorization", `Bearer ${lab2AdminToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("5. End-to-End Report Generation & Pairing Verification", () => {
    let reportId: string;

    beforeAll(async () => {
      // Create ACTIVE PatientLabAssociation
      await prisma.patientLabAssociation.create({
        data: {
          patientId: patientAProfileId,
          labId: registeredLabId,
          status: "ACTIVE"
        }
      });
    });

    it("should allow lab user to create DRAFT report for paired patient", async () => {
      const res = await request(app)
        .post(`/api/labs/${registeredLabId}/reports`)
        .set("Authorization", `Bearer ${techToken}`)
        .send({
          patientId: patientAProfileId,
          title: "Complete Lipid Panel",
          collectedAt: new Date().toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      reportId = res.body.id;
    });

    it("should allow lab user to populate structured result entries", async () => {
      const res = await request(app)
        .post(`/api/labs/${registeredLabId}/reports/${reportId}/results`)
        .set("Authorization", `Bearer ${techToken}`)
        .send({
          testName: "Serum Cholesterol",
          testCode: "CHO-001",
          value: "195",
          valueType: "NUMERIC",
          unit: "mg/dL",
          referenceRange: "< 200 mg/dL",
          status: "NORMAL"
        });

      expect(res.status).toBe(201);
      expect(res.body.testName).toBe("Serum Cholesterol");
    });

    it("should allow lab admin to finalize and sign the report", async () => {
      const res = await request(app)
        .patch(`/api/labs/${registeredLabId}/reports/${reportId}/finalize`)
        .set("Authorization", `Bearer ${labAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("FINALIZED");
    });
  });
});
