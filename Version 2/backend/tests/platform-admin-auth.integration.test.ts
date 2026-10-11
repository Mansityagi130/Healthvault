import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { 
  MembershipRole, 
  HospitalVerificationStatus, 
  HospitalStatus 
} from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Task 2: Platform Admin Authorization and Endpoints Integration Tests", () => {
  let patientToken: string;
  let doctorToken: string;
  let hospitalAdminToken: string;
  let platformAdminToken: string;
  let testHospitalId: string;

  beforeAll(async () => {
    // Isolated test cleanup on healthvault_test
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);

    // 1. Patient User
    const regPatient = await request(app).post("/api/auth/register").send({
      email: "patient.test@admincheck.test",
      password: "Password123!",
      firstName: "Patient",
      lastName: "User"
    });
    const loginPatient = await request(app).post("/api/auth/login").send({
      email: "patient.test@admincheck.test",
      password: "Password123!"
    });
    patientToken = loginPatient.body.accessToken;

    // 2. Doctor User
    const regDoctor = await request(app).post("/api/auth/register").send({
      email: "doctor.test@admincheck.test",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "User"
    });
    await prisma.doctorProfile.create({
      data: {
        userId: regDoctor.body.user.id,
        registrationNumber: `REG-CHECK-${Date.now()}`,
        specialty: "General Practice",
        verificationStatus: "VERIFIED"
      }
    });
    const loginDoctor = await request(app).post("/api/auth/login").send({
      email: "doctor.test@admincheck.test",
      password: "Password123!"
    });
    doctorToken = loginDoctor.body.accessToken;

    // 3. Hospital Admin User
    const regHospAdmin = await request(app).post("/api/auth/register").send({
      email: "hospadmin.test@admincheck.test",
      password: "Password123!",
      firstName: "Hospital",
      lastName: "Admin"
    });
    const hospital = await prisma.hospital.create({
      data: {
        name: "Test Review Hospital",
        code: `HOSP-REV-${Date.now()}`,
        verificationStatus: HospitalVerificationStatus.PENDING_REVIEW,
        status: HospitalStatus.ACTIVE
      }
    });
    testHospitalId = hospital.id;
    await prisma.hospitalMembership.create({
      data: {
        hospitalId: testHospitalId,
        userId: regHospAdmin.body.user.id,
        role: MembershipRole.HOSPITAL_ADMIN,
        status: "ACTIVE"
      }
    });
    const loginHospAdmin = await request(app).post("/api/auth/login").send({
      email: "hospadmin.test@admincheck.test",
      password: "Password123!"
    });
    hospitalAdminToken = loginHospAdmin.body.accessToken;

    // 4. Platform Admin User (isPlatformAdmin: true)
    const regPlatformAdmin = await request(app).post("/api/auth/register").send({
      email: "rootadmin.test@admincheck.test",
      password: "PlatformRootPassword123!",
      firstName: "Platform",
      lastName: "Governance"
    });
    await prisma.user.update({
      where: { id: regPlatformAdmin.body.user.id },
      data: { isPlatformAdmin: true, isEmailVerified: true }
    });
    const loginPlatformAdmin = await request(app).post("/api/auth/login").send({
      email: "rootadmin.test@admincheck.test",
      password: "PlatformRootPassword123!"
    });
    platformAdminToken = loginPlatformAdmin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);
  });

  it("1. Unauthenticated request to /api/admin/hospitals returns 401 Unauthorized", async () => {
    const res = await request(app).get("/api/admin/hospitals");
    expect(res.status).toBe(401);
  });

  it("2. Patient role accessing /api/admin/hospitals is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Platform Admin access required");
  });

  it("3. Doctor role accessing /api/admin/hospitals is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Platform Admin access required");
  });

  it("4. Hospital Admin role accessing /api/admin/hospitals is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${hospitalAdminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Platform Admin access required");
  });

  it("5. Authorized Platform Admin successfully retrieves hospitals", async () => {
    const res = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((h: { id: string }) => h.id === testHospitalId)).toBe(true);
  });

  it("6. Authorized Platform Admin can review and verify a hospital", async () => {
    const res = await request(app)
      .post(`/api/admin/hospitals/${testHospitalId}/verify`)
      .set("Authorization", `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hospital.verificationStatus).toBe("VERIFIED");

    // Verify DB update
    const updated = await prisma.hospital.findUnique({ where: { id: testHospitalId } });
    expect(updated?.verificationStatus).toBe(HospitalVerificationStatus.VERIFIED);
  });

  it("7. Non-admin cannot perform administrative actions (verify, reject, suspend)", async () => {
    const res = await request(app)
      .post(`/api/admin/hospitals/${testHospitalId}/suspend`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ suspendedReason: "Unauthorized attempt" });
    expect(res.status).toBe(403);
  });
});
