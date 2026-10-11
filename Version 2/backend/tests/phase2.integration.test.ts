import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Phase 2 — Identity & Hospital Verification Integration Tests", () => {
  const genPhone = () => "+919" + Math.floor(100000000 + Math.random() * 900000000);

  let platformAdminToken: string;
  let platformAdminUserId: string;

  let patientUserToken: string;
  let patientUserId: string;
  let patientVerificationToken: string;
  let patientIdDisplay: string;

  let pendingHospitalId: string;
  let hospitalAdminUserToken: string;
  let hospitalAdminUserId: string;
  let verifiedHospitalId: string;
  let verifiedHospitalIdDisplay: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAIdDisplay: string;
  let doctorInvitationToken: string;

  beforeAll(async () => {
    // 1. Setup Platform Admin User
    const adminEmail = `platform.admin.${Date.now()}@healthvault.local`;
    const adminReg = await request(app).post("/api/auth/register").send({
      email: adminEmail,
      password: "PlatformAdminPassword123!",
      firstName: "Platform",
      lastName: "Admin",
      phone: genPhone()
    });
    expect(adminReg.status).toBe(201);

    // Promote to platform admin in DB
    const adminUser = await prisma.user.update({
      where: { email: adminEmail },
      data: { isPlatformAdmin: true, isEmailVerified: true }
    });
    platformAdminUserId = adminUser.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: adminEmail,
      password: "PlatformAdminPassword123!"
    });
    expect(adminLogin.status).toBe(200);
    platformAdminToken = adminLogin.body.accessToken;
  });

  // --- SECTION 1: REAL PATIENT IDENTITY & EMAIL VERIFICATION ---
  describe("1. Real Patient Identity & Email Verification", () => {
    it("1.1 Patient registration issues verification token and generates stable HV-PAT ID", async () => {
      const email = `patient.real.${Date.now()}@example.com`;
      const res = await request(app).post("/api/auth/register").send({
        email,
        password: "PatientPassword123!",
        firstName: "Real",
        lastName: "Patient",
        phone: genPhone()
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty("patientIdDisplay");
      expect(res.body.user.patientIdDisplay).toMatch(/^HV-PAT-[A-Z0-9]{6}$/);
      expect(res.body).toHaveProperty("verificationToken");

      patientUserId = res.body.user.id;
      patientIdDisplay = res.body.user.patientIdDisplay;
      patientVerificationToken = res.body.verificationToken;
    });

    it("1.2 Patient verifies email using raw token", async () => {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .send({ token: patientVerificationToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("verified successfully");
      expect(res.body.patientIdDisplay).toBe(patientIdDisplay);

      const user = await prisma.user.findUnique({ where: { id: patientUserId } });
      expect(user!.isEmailVerified).toBe(true);
    });

    it("1.3 Reused email verification token is REJECTED", async () => {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .send({ token: patientVerificationToken });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid or expired");
    });

    it("1.4 Resend verification email generates a new single-use token", async () => {
      const email = `unverified.${Date.now()}@example.com`;
      await request(app).post("/api/auth/register").send({
        email, password: "Password123!", firstName: "Unverified", lastName: "User", phone: genPhone()
      });

      const res = await request(app)
        .post("/api/auth/resend-verification")
        .send({ email });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("verificationToken");
    });
  });

  // --- SECTION 2: HOSPITAL VERIFICATION & PLATFORM ADMIN ---
  describe("2. Hospital Verification & Platform Admin Control", () => {
    it("2.1 Hospital self-registration creates hospital in PENDING_REVIEW status", async () => {
      const adminEmail = `hosp.admin.${Date.now()}@example.com`;
      const code = `HOSP-REG-${Date.now()}`;

      const res = await request(app).post("/api/hospitals/register").send({
        name: "St. Thomas General Hospital",
        code,
        hfrFacilityId: "HFR-ST-THOMAS-8899",
        licenseNumber: "LIC-ST-THOMAS-101",
        contactEmail: "contact@stthomas.org",
        adminEmail,
        adminPassword: "AdminPassword123!"
      });

      expect(res.status).toBe(201);
      expect(res.body.hospital.verificationStatus).toBe("PENDING_REVIEW");

      pendingHospitalId = res.body.hospital.id;

      // Login as Hospital Admin
      const loginRes = await request(app).post("/api/auth/login").send({
        email: adminEmail, password: "AdminPassword123!"
      });
      expect(loginRes.status).toBe(200);
      hospitalAdminUserToken = loginRes.body.accessToken;
      hospitalAdminUserId = loginRes.body.user.id;
    });

    it("2.2 Hospital Admin CANNOT self-approve their own hospital", async () => {
      // Attempting to invoke verify endpoint as Hospital Admin fails (403 Forbidden)
      const res = await request(app)
        .post(`/api/admin/hospitals/${pendingHospitalId}/verify`)
        .set("Authorization", `Bearer ${hospitalAdminUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("HealthVault Platform Admin access required");
    });

    it("2.3 Platform Admin lists pending hospital applications", async () => {
      const res = await request(app)
        .get("/api/admin/hospitals?verificationStatus=PENDING_REVIEW")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((h: any) => h.id === pendingHospitalId)).toBe(true);
    });

    it("2.4 Platform Admin approves hospital: transitions status to VERIFIED and assigns HV-HOSP ID", async () => {
      const res = await request(app)
        .post(`/api/admin/hospitals/${pendingHospitalId}/verify`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hospital.verificationStatus).toBe("VERIFIED");
      expect(res.body.hospital.hospitalIdDisplay).toMatch(/^HV-HOSP-[A-Z0-9]{6}$/);

      verifiedHospitalId = pendingHospitalId;
      verifiedHospitalIdDisplay = res.body.hospital.hospitalIdDisplay;
    });

    it("2.5 Platform Admin can reject a hospital with rationale", async () => {
      const adminEmail = `reject.admin.${Date.now()}@example.com`;
      const regRes = await request(app).post("/api/hospitals/register").send({
        name: "Fictional Fake Clinic",
        contactEmail: "fake@clinic.org",
        adminEmail,
        adminPassword: "Password123!"
      });
      const fakeHospId = regRes.body.hospital.id;

      const rejectRes = await request(app)
        .post(`/api/admin/hospitals/${fakeHospId}/reject`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({ rejectionReason: "Invalid license number provided" });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.hospital.verificationStatus).toBe("REJECTED");
      expect(rejectRes.body.hospital.rejectionReason).toBe("Invalid license number provided");
    });

    it("2.6 Platform Admin can suspend a hospital and block hospital operations", async () => {
      // Suspend hospital
      const suspendRes = await request(app)
        .post(`/api/admin/hospitals/${verifiedHospitalId}/suspend`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({ suspendedReason: "Compliance investigation pending" });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.hospital.status).toBe("SUSPENDED");

      // Hospital operation attempt while suspended is BLOCKED (403)
      const opRes = await request(app)
        .get(`/api/hospitals/${verifiedHospitalId}/departments`)
        .set("Authorization", `Bearer ${hospitalAdminUserToken}`);

      expect(opRes.status).toBe(403);
      expect(opRes.body.error).toContain("Organization is suspended");

      // Restore hospital for subsequent tests
      const restoreRes = await request(app)
        .post(`/api/admin/hospitals/${verifiedHospitalId}/restore`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.hospital.status).toBe("ACTIVE");
    });
  });

  // --- SECTION 3: DOCTOR INVITATION & ONBOARDING ---
  describe("3. Doctor Invitation & Onboarding Workflow", () => {
    it("3.1 Hospital Admin creates a secure doctor invitation token", async () => {
      const doctorEmail = `invited.doc.${Date.now()}@example.com`;
      const res = await request(app)
        .post(`/api/hospitals/${verifiedHospitalId}/invitations`)
        .set("Authorization", `Bearer ${hospitalAdminUserToken}`)
        .send({
          email: doctorEmail,
          role: "DOCTOR"
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("invitationToken");
      doctorInvitationToken = res.body.invitationToken;
    });

    it("3.2 Public endpoint verifies invitation token validity", async () => {
      const res = await request(app)
        .get(`/api/hospitals/invitations/verify?token=${doctorInvitationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.invitation).toHaveProperty("hospitalName");
    });

    it("3.3 New Doctor accepts invitation: creates User, DoctorProfile, active Membership, and HV-DOC ID", async () => {
      const res = await request(app)
        .post("/api/hospitals/invitations/accept")
        .send({
          token: doctorInvitationToken,
          password: "DoctorPassword123!",
          registrationNumber: `MCI-${Date.now()}`,
          specialty: "Cardiology"
        });

      expect(res.status).toBe(200);
      expect(res.body.doctorProfile).toHaveProperty("doctorIdDisplay");
      expect(res.body.doctorProfile.doctorIdDisplay).toMatch(/^HV-DOC-[A-Z0-9]{6}$/);
      expect(res.body.doctorProfile.verificationStatus).toBe("PENDING"); // Professional verification separate from email
      expect(res.body.membership.status).toBe("ACTIVE");

      doctorAUserId = res.body.user.id;
      doctorAIdDisplay = res.body.doctorProfile.doctorIdDisplay;
    });

    it("3.4 Doctor Identity Persistence: Doctor joining Hospital B retains their original HV-DOC ID", async () => {
      // Create Hospital B & Approve it
      const hospBReg = await request(app).post("/api/hospitals/register").send({
        name: "Metro Specialty Hospital B",
        contactEmail: "admin@hospB.org",
        adminEmail: `admin.hospB.${Date.now()}@example.com`,
        adminPassword: "Password123!"
      });
      const hospBId = hospBReg.body.hospital.id;

      await request(app)
        .post(`/api/admin/hospitals/${hospBId}/verify`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      // Login as Doctor A
      const docEmail = (await prisma.user.findUnique({ where: { id: doctorAUserId } }))!.email!;
      const docLogin = await request(app).post("/api/auth/login").send({
        email: docEmail, password: "DoctorPassword123!"
      });
      expect(docLogin.status).toBe(200);
      doctorAToken = docLogin.body.accessToken;

      // Hospital B Admin invites Doctor A
      const adminBUser = await prisma.hospitalMembership.findFirst({
        where: { hospitalId: hospBId, role: "HOSPITAL_ADMIN" }
      });
      const adminBLogin = await request(app).post("/api/auth/login").send({
        email: (await prisma.user.findUnique({ where: { id: adminBUser!.userId } }))!.email!,
        password: "Password123!"
      });

      const inviteB = await request(app)
        .post(`/api/hospitals/${hospBId}/invitations`)
        .set("Authorization", `Bearer ${adminBLogin.body.accessToken}`)
        .send({ email: docEmail, role: "DOCTOR" });

      // Doctor A accepts invitation to Hospital B
      const acceptB = await request(app)
        .post("/api/hospitals/invitations/accept")
        .send({ token: inviteB.body.invitationToken });

      expect(acceptB.status).toBe(200);
      expect(acceptB.body.doctorProfile.doctorIdDisplay).toBe(doctorAIdDisplay); // HV-DOC ID persists!

      // Doctor A now has memberships in both Hospital A and Hospital B
      const memberships = await prisma.hospitalMembership.findMany({
        where: { userId: doctorAUserId, status: "ACTIVE" }
      });
      expect(memberships.length).toBe(2);
    });
  });
});
