import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Phase 4: Hospital Operations Integration Tests", () => {
  let adminAToken: string;
  let adminAUserId: string;

  let staffAToken: string;
  let staffAUserId: string;

  let doctorAToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let adminBToken: string;
  let adminBUserId: string;

  let patientAToken: string;
  let patientAUserId: string;
  let patientAProfileId: string;

  let hospitalAId: string;
  let hospitalBId: string;
  let departmentA1Id: string;

  beforeAll(async () => {
    // 1. Cleanup database
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);

    // 2. Register Admin A
    const regAdminA = await request(app).post("/api/auth/register").send({
      email: "adminA_p4@example.com",
      password: "Password123!",
      firstName: "Admin",
      lastName: "Alpha",
      role: "PROVIDER"
    });
    adminAUserId = regAdminA.body.user.id;
    const loginAdminA = await request(app).post("/api/auth/login").send({
      email: "adminA_p4@example.com",
      password: "Password123!"
    });
    adminAToken = loginAdminA.body.accessToken;

    // 3. Register Staff A
    const regStaffA = await request(app).post("/api/auth/register").send({
      email: "staffA_p4@example.com",
      password: "Password123!",
      firstName: "Staff",
      lastName: "Alpha",
      role: "PROVIDER"
    });
    staffAUserId = regStaffA.body.user.id;
    const loginStaffA = await request(app).post("/api/auth/login").send({
      email: "staffA_p4@example.com",
      password: "Password123!"
    });
    staffAToken = loginStaffA.body.accessToken;

    // 4. Register Doctor A
    const regDocA = await request(app).post("/api/auth/register").send({
      email: "docA_p4@example.com",
      password: "Password123!",
      firstName: "Doctor",
      lastName: "Alpha",
      role: "PROVIDER"
    });
    doctorAUserId = regDocA.body.user.id;
    const loginDocA = await request(app).post("/api/auth/login").send({
      email: "docA_p4@example.com",
      password: "Password123!"
    });
    doctorAToken = loginDocA.body.accessToken;

    const docProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: "DOC-P4-REG-001",
        specialty: "Cardiology",
        verificationStatus: "VERIFIED"
      }
    });
    doctorAProfileId = docProfile.id;

    // 5. Register Admin B (Hospital B)
    const regAdminB = await request(app).post("/api/auth/register").send({
      email: "adminB_p4@example.com",
      password: "Password123!",
      firstName: "Admin",
      lastName: "Beta",
      role: "PROVIDER"
    });
    adminBUserId = regAdminB.body.user.id;
    const loginAdminB = await request(app).post("/api/auth/login").send({
      email: "adminB_p4@example.com",
      password: "Password123!"
    });
    adminBToken = loginAdminB.body.accessToken;

    // 6. Register Patient A
    const regPatA = await request(app).post("/api/auth/register").send({
      email: "patientA_p4@example.com",
      password: "Password123!",
      firstName: "Patient",
      lastName: "Alpha",
      role: "PATIENT"
    });
    patientAUserId = regPatA.body.user.id;
    const loginPatA = await request(app).post("/api/auth/login").send({
      email: "patientA_p4@example.com",
      password: "Password123!"
    });
    patientAToken = loginPatA.body.accessToken;

    const patProfile = await prisma.patientProfile.findUnique({
      where: { userId: patientAUserId }
    });
    patientAProfileId = patProfile!.id;

    // 7. Create Hospitals
    const hospA = await prisma.hospital.create({
      data: {
        name: "General Hospital Alpha",
        code: "HOSP-ALPHA-P4",
        verificationStatus: "VERIFIED"
      }
    });
    hospitalAId = hospA.id;

    const hospB = await prisma.hospital.create({
      data: {
        name: "Community Hospital Beta",
        code: "HOSP-BETA-P4",
        verificationStatus: "VERIFIED"
      }
    });
    hospitalBId = hospB.id;

    // 8. Assign Memberships
    await prisma.hospitalMembership.createMany({
      data: [
        { hospitalId: hospitalAId, userId: adminAUserId, role: "HOSPITAL_ADMIN", status: "ACTIVE" },
        { hospitalId: hospitalAId, userId: staffAUserId, role: "STAFF", status: "ACTIVE" },
        { hospitalId: hospitalAId, userId: doctorAUserId, role: "DOCTOR", status: "ACTIVE" },
        { hospitalId: hospitalBId, userId: adminBUserId, role: "HOSPITAL_ADMIN", status: "ACTIVE" }
      ]
    });

    // 9. Initial Department for Hospital A
    const deptA1 = await prisma.department.create({
      data: { hospitalId: hospitalAId, name: "Cardiology", code: "CARD" }
    });
    departmentA1Id = deptA1.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Hospital Settings Management", () => {
    it("should allow Hospital Admin to update hospital settings", async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${hospitalAId}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "General Hospital Alpha Updated",
          contactEmail: "contact@alpha-hospital.org",
          contactPhone: "+15550199",
          address: "100 Medical Center Way",
          licenseNumber: "HOSP-LIC-998877"
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("General Hospital Alpha Updated");
      expect(res.body.contactEmail).toBe("contact@alpha-hospital.org");
      expect(res.body.contactPhone).toBe("+15550199");
      expect(res.body.address).toBe("100 Medical Center Way");
      expect(res.body.licenseNumber).toBe("HOSP-LIC-998877");
    });

    it("should deny Hospital Settings update from non-admin member (Staff)", async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${hospitalAId}`)
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({
          name: "Unauthorized Change Attempt"
        });

      expect(res.status).toBe(403);
    });

    it("should deny Hospital Settings update from Admin of another hospital (Tenant Isolation)", async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${hospitalAId}`)
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({
          name: "Cross Tenant Hack"
        });

      expect(res.status).toBe(403);
    });
  });

  describe("2. Department Lifecycle Management", () => {
    let createdDeptId: string;

    it("should allow Hospital Admin to create a new department", async () => {
      const res = await request(app)
        .post(`/api/hospitals/${hospitalAId}/departments`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Neurology",
          code: "NEURO"
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Neurology");
      expect(res.body.code).toBe("NEURO");
      expect(res.body.hospitalId).toBe(hospitalAId);
      createdDeptId = res.body.id;
    });

    it("should prevent creating a duplicate department name in the same hospital", async () => {
      const res = await request(app)
        .post(`/api/hospitals/${hospitalAId}/departments`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "neurology" // case insensitive duplicate
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("already exists");
    });

    it("should allow Hospital Admin to update department details", async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${hospitalAId}/departments/${createdDeptId}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Neurosciences"
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Neurosciences");
    });

    it("should deny department creation from non-admin staff", async () => {
      const res = await request(app)
        .post(`/api/hospitals/${hospitalAId}/departments`)
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({
          name: "Pediatrics"
        });

      expect(res.status).toBe(403);
    });
  });

  describe("3. Master Appointment Queue", () => {
    beforeAll(async () => {
      // Create appointments for testing queue filtering
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      await prisma.appointment.create({
        data: {
          patientId: patientAProfileId,
          doctorId: doctorAProfileId,
          hospitalId: hospitalAId,
          departmentId: departmentA1Id,
          appointmentDate: tomorrow,
          startTime: "10:00",
          endTime: "10:30",
          slotTimestamp: tomorrow,
          status: "SCHEDULED",
          reason: "Routine Cardiac Consultation"
        }
      });
    });

    it("should allow hospital staff/admin/doctor to view hospital appointments", async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalAId}/appointments`)
        .set("Authorization", `Bearer ${staffAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].patient.user.email).toBe("patientA_p4@example.com");
      expect(res.body[0].doctor.id).toBe(doctorAProfileId);
    });

    it("should support status and doctor filters on appointment queue", async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalAId}/appointments?status=SCHEDULED&doctorId=${doctorAProfileId}`)
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].status).toBe("SCHEDULED");
    });

    it("should deny master appointment queue access to non-members (Tenant Isolation)", async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalAId}/appointments`)
        .set("Authorization", `Bearer ${adminBToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("4. Hospital-Scoped Patient Directory", () => {
    beforeAll(async () => {
      // Create an encounter for Patient A at Hospital A to establish record association
      await prisma.encounter.create({
        data: {
          patientId: patientAProfileId,
          hospitalId: hospitalAId,
          providerId: doctorAUserId,
          type: "OUTPATIENT",
          status: "IN_PROGRESS",
          reason: "Emergency Walk-in"
        }
      });
    });

    it("should allow hospital staff/admin/doctor to list hospital patients", async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalAId}/patients`)
        .set("Authorization", `Bearer ${doctorAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(patientAProfileId);
      expect(res.body[0].user.email).toBe("patientA_p4@example.com");
    });

    it("should deny hospital patient directory access to non-members (Tenant Isolation)", async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalAId}/patients`)
        .set("Authorization", `Bearer ${adminBToken}`);

      expect(res.status).toBe(403);
    });
  });
});
