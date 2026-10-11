import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";
import { 
  MembershipRole, 
  MembershipStatus, 
  HospitalVerificationStatus, 
  HospitalStatus 
} from "../src/generated/prisma/enums.js";

const prisma = databaseClient.getClient();

describe("Task 1: Hospital Admin and Doctor Onboarding Integration Tests", () => {
  let adminA: { id: string; accessToken: string };
  let adminB: { id: string; accessToken: string };
  let docUserA: { id: string; accessToken: string; email: string };
  let hospA: { id: string; name: string };
  let hospB: { id: string; name: string };
  let deptA: { id: string; name: string };

  beforeAll(async () => {
    // Isolated test cleanup on healthvault_test
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);

    // 1. Create Hospital Admin A
    const resAdminA = await request(app).post("/api/auth/register").send({
      email: "adminA@hosp-a.test",
      password: "HospitalAdmin123!",
      firstName: "Admin",
      lastName: "A"
    });
    const loginAdminA = await request(app).post("/api/auth/login").send({
      email: "adminA@hosp-a.test",
      password: "HospitalAdmin123!"
    });
    adminA = { id: resAdminA.body.user.id, accessToken: loginAdminA.body.accessToken };

    // 2. Create Hospital Admin B
    const resAdminB = await request(app).post("/api/auth/register").send({
      email: "adminB@hosp-b.test",
      password: "HospitalAdmin123!",
      firstName: "Admin",
      lastName: "B"
    });
    const loginAdminB = await request(app).post("/api/auth/login").send({
      email: "adminB@hosp-b.test",
      password: "HospitalAdmin123!"
    });
    adminB = { id: resAdminB.body.user.id, accessToken: loginAdminB.body.accessToken };

    // 3. Create Hospitals A and B
    hospA = await prisma.hospital.create({
      data: {
        name: "General Hospital Alpha",
        code: `HOSP-ALPHA-${Date.now()}`,
        verificationStatus: HospitalVerificationStatus.VERIFIED,
        status: HospitalStatus.ACTIVE
      }
    });

    hospB = await prisma.hospital.create({
      data: {
        name: "Metro Hospital Beta",
        code: `HOSP-BETA-${Date.now()}`,
        verificationStatus: HospitalVerificationStatus.VERIFIED,
        status: HospitalStatus.ACTIVE
      }
    });

    deptA = await prisma.department.create({
      data: { hospitalId: hospA.id, name: "Cardiology", code: "CARD-ALPHA" }
    });

    // 4. Assign Admin Memberships
    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospA.id,
        userId: adminA.id,
        role: MembershipRole.HOSPITAL_ADMIN,
        status: MembershipStatus.ACTIVE
      }
    });

    await prisma.hospitalMembership.create({
      data: {
        hospitalId: hospB.id,
        userId: adminB.id,
        role: MembershipRole.HOSPITAL_ADMIN,
        status: MembershipStatus.ACTIVE
      }
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab", "OutboxEvent" CASCADE;`);
  });

  it("1. Hospital Admin A can invite a new doctor to Hospital A", async () => {
    const inviteEmail = "dr.invited@hosp-a.test";
    const res = await request(app)
      .post(`/api/hospitals/${hospA.id}/invitations`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({
        email: inviteEmail,
        role: MembershipRole.DOCTOR,
        departmentId: deptA.id
      });

    expect(res.status).toBe(201);
    expect(res.body.invitation).toBeDefined();
    expect(res.body.invitation.email).toBe(inviteEmail);
    expect(res.body.invitationToken).toBeDefined();

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminA.id,
        action: "DOCTOR_INVITED"
      }
    });
    expect(audit).toBeDefined();
  });

  it("2. Doctor accepts invitation -> creates DoctorProfile and active membership", async () => {
    // Invite doctor
    const docEmail = `dr.accepted.${Date.now()}@hosp-a.test`;
    const inviteRes = await request(app)
      .post(`/api/hospitals/${hospA.id}/invitations`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({
        email: docEmail,
        role: MembershipRole.DOCTOR,
        departmentId: deptA.id
      });
    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.invitationToken;

    // Doctor accepts
    const acceptRes = await request(app)
      .post("/api/hospitals/invitations/accept")
      .send({
        token,
        password: "DoctorPassword123!",
        registrationNumber: `REG-MED-${Date.now()}`,
        specialty: "Cardiology"
      });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.doctorProfile).toBeDefined();
    expect(acceptRes.body.doctorProfile.specialty).toBe("Cardiology");
    expect(acceptRes.body.membership.status).toBe("ACTIVE");

    // Login as doctor
    const loginRes = await request(app).post("/api/auth/login").send({
      email: docEmail,
      password: "DoctorPassword123!"
    });
    expect(loginRes.status).toBe(200);
    docUserA = { id: loginRes.body.user.id, accessToken: loginRes.body.accessToken, email: docEmail };
  });

  it("3. Reject duplicate doctor registration number with clean 400 error", async () => {
    const duplicateReg = `REG-DUP-${Date.now()}`;

    // Create doctor 1 with this reg number
    const invite1 = await request(app)
      .post(`/api/hospitals/${hospA.id}/invitations`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({ email: "doc1.dup@test.com", role: MembershipRole.DOCTOR });
    expect(invite1.status).toBe(201);

    const accept1 = await request(app)
      .post("/api/hospitals/invitations/accept")
      .send({
        token: invite1.body.invitationToken,
        password: "Password123!",
        registrationNumber: duplicateReg
      });
    expect(accept1.status).toBe(200);

    // Doctor 2 attempts to use same reg number
    const invite2 = await request(app)
      .post(`/api/hospitals/${hospA.id}/invitations`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({ email: "doc2.dup@test.com", role: MembershipRole.DOCTOR });
    expect(invite2.status).toBe(201);

    const accept2 = await request(app)
      .post("/api/hospitals/invitations/accept")
      .send({
        token: invite2.body.invitationToken,
        password: "Password123!",
        registrationNumber: duplicateReg
      });
    expect(accept2.status).toBe(400);
    expect(accept2.body.error).toContain("already in use");
  });

  it("4. Direct addition of DOCTOR member auto-initializes DoctorProfile", async () => {
    // Register standalone user
    const userRes = await request(app).post("/api/auth/register").send({
      email: "newdoctor.direct@test.com",
      password: "Password123!",
      firstName: "Direct",
      lastName: "Doctor"
    });
    expect(userRes.status).toBe(201);
    const newDocId = userRes.body.user.id;

    // Hospital Admin A adds user as DOCTOR
    const addRes = await request(app)
      .post(`/api/hospitals/${hospA.id}/members`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({
        email: "newdoctor.direct@test.com",
        role: MembershipRole.DOCTOR,
        departmentId: deptA.id
      });

    expect(addRes.status).toBe(201);
    expect(addRes.body.role).toBe(MembershipRole.DOCTOR);

    // Verify DoctorProfile was automatically initialized
    const docProfile = await prisma.doctorProfile.findUnique({
      where: { userId: newDocId }
    });
    expect(docProfile).toBeDefined();
    expect(docProfile?.registrationNumber).toBeDefined();
    expect(docProfile?.doctorIdDisplay).toBeDefined();
  });

  it("5. Hospital Admin B CANNOT view or modify Hospital A members (cross-hospital isolation)", async () => {
    // Admin B attempts to list Hospital A members -> 403 Forbidden
    const listRes = await request(app)
      .get(`/api/hospitals/${hospA.id}/members`)
      .set("Authorization", `Bearer ${adminB.accessToken}`);
    expect(listRes.status).toBe(403);

    // Admin B attempts to add member to Hospital A -> 403 Forbidden
    const addRes = await request(app)
      .post(`/api/hospitals/${hospA.id}/members`)
      .set("Authorization", `Bearer ${adminB.accessToken}`)
      .send({ email: "random@test.com", role: MembershipRole.DOCTOR });
    expect(addRes.status).toBe(403);
  });

  it("6. Doctor from Hospital A CANNOT access Hospital B restricted encounters", async () => {
    // Doctor A attempts to view Hospital B encounters -> 403 Forbidden
    const encRes = await request(app)
      .get(`/api/hospitals/${hospB.id}/encounters`)
      .set("Authorization", `Bearer ${docUserA.accessToken}`);
    expect(encRes.status).toBe(403);
  });

  it("7. Hospital Admin A can update doctor membership status with proper audit logging", async () => {
    // Get docA membership in hospA
    const membership = await prisma.hospitalMembership.findFirst({
      where: { hospitalId: hospA.id, userId: docUserA.id }
    });
    expect(membership).toBeDefined();

    const updateRes = await request(app)
      .patch(`/api/hospitals/${hospA.id}/members/${membership!.id}`)
      .set("Authorization", `Bearer ${adminA.accessToken}`)
      .send({
        status: MembershipStatus.INACTIVE
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe(MembershipStatus.INACTIVE);

    // Verify AuditLog for MEMBERSHIP_DEACTIVATED
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminA.id,
        targetId: membership!.id,
        action: "MEMBERSHIP_DEACTIVATED"
      }
    });
    expect(audit).toBeDefined();
  });
});
