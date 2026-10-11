import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { MembershipRole, MembershipStatus, AuditAction } from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Security Audit Trail Visualizer & Query API Integration", () => {
  let patientA: { id: string; accessToken: string };
  let patientB: { id: string; accessToken: string };
  let adminA: { id: string; accessToken: string };
  let hospA: any;

  beforeAll(async () => {
    // Clean test records safely in correct foreign-key dependency order
    await prisma.auditLog.deleteMany();
    await prisma.encounter.deleteMany();
    await prisma.hospitalMembership.deleteMany();
    await prisma.department.deleteMany();
    await prisma.hospital.deleteMany();
    await prisma.patientProfile.deleteMany({
      where: {
        user: {
          email: { in: ["audit_patient_a@test.com", "audit_patient_b@test.com", "audit_admin_a@test.com"] }
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: ["audit_patient_a@test.com", "audit_patient_b@test.com", "audit_admin_a@test.com"] }
      }
    });

    // Create Patient A
    const regA = await request(app).post("/api/auth/register").send({
      email: "audit_patient_a@test.com",
      password: "securePassword123!",
      firstName: "AuditPatient",
      lastName: "A",
    });
    const loginA = await request(app).post("/api/auth/login").send({
      email: "audit_patient_a@test.com",
      password: "securePassword123!",
    });
    patientA = { id: regA.body.user.id, accessToken: loginA.body.accessToken };

    // Create Patient B
    const regB = await request(app).post("/api/auth/register").send({
      email: "audit_patient_b@test.com",
      password: "securePassword123!",
      firstName: "AuditPatient",
      lastName: "B",
    });
    const loginB = await request(app).post("/api/auth/login").send({
      email: "audit_patient_b@test.com",
      password: "securePassword123!",
    });
    patientB = { id: regB.body.user.id, accessToken: loginB.body.accessToken };

    // Create Admin A & Hospital A
    const regAdmin = await request(app).post("/api/auth/register").send({
      email: "audit_admin_a@test.com",
      password: "securePassword123!",
      firstName: "AuditAdmin",
      lastName: "A",
    });
    const loginAdmin = await request(app).post("/api/auth/login").send({
      email: "audit_admin_a@test.com",
      password: "securePassword123!",
    });
    adminA = { id: regAdmin.body.user.id, accessToken: loginAdmin.body.accessToken };

    hospA = await prisma.hospital.create({
      data: { name: "Audit Hospital A", code: "AUDIT-HOSP-A" },
    });

    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospA.id,
        userId: adminA.id,
        role: MembershipRole.HOSPITAL_ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    // Create Audit Log fixtures using valid AuditAction enum values
    await prisma.auditLog.create({
      data: {
        actorUserId: patientA.id,
        action: AuditAction.LOGIN,
        targetType: "MedicalRecord",
        targetId: "rec_pat_a",
        metadata: { ip: "127.0.0.1", token: "secret_token_value" },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: patientB.id,
        action: AuditAction.LOGIN,
        targetType: "MedicalRecord",
        targetId: "rec_pat_b",
        metadata: { ip: "10.0.0.1" },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: adminA.id,
        action: AuditAction.CONSENT_APPROVED,
        targetType: "Hospital",
        targetId: hospA.id,
        metadata: { action: "profile_edit" },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.encounter.deleteMany();
    await prisma.hospitalMembership.deleteMany();
    await prisma.department.deleteMany();
    await prisma.hospital.deleteMany();
    await prisma.patientProfile.deleteMany({
      where: {
        user: {
          email: { in: ["audit_patient_a@test.com", "audit_patient_b@test.com", "audit_admin_a@test.com"] }
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: ["audit_patient_a@test.com", "audit_patient_b@test.com", "audit_admin_a@test.com"] }
      }
    });
  });

  it("returns 401 Unauthorized when no token is provided", async () => {
    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(401);
  });

  it("returns only Patient A's audit logs when Patient A queries endpoint", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${patientA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.logs)).toBe(true);

    const logIds = res.body.logs.map((l: any) => l.actorUserId);
    expect(logIds).toContain(patientA.id);
    expect(logIds).not.toContain(patientB.id);
  });

  it("sanitizes sensitive fields like 'token' from metadata JSON", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${patientA.accessToken}`);

    expect(res.status).toBe(200);
    const patLog = res.body.logs.find((l: any) => l.actorUserId === patientA.id);
    expect(patLog).toBeDefined();
    expect(patLog.metadata).toBeDefined();
    expect(patLog.metadata.token).toBeUndefined();
    expect(patLog.metadata.ip).toBe("127.0.0.1");
  });

  it("returns hospital tenant scoped audit logs for Hospital Admin", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${adminA.accessToken}`);

    expect(res.status).toBe(200);
    const logIds = res.body.logs.map((l: any) => l.actorUserId);
    expect(logIds).toContain(adminA.id);
    expect(logIds).not.toContain(patientB.id);
  });

  it("supports pagination parameters page and pageSize", async () => {
    const res = await request(app)
      .get("/api/audit-logs?page=1&pageSize=1")
      .set("Authorization", `Bearer ${patientA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.pageSize).toBe(1);
    expect(res.body.pagination.page).toBe(1);
  });
});
