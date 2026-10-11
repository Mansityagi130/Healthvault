import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { databaseClient } from "../src/config/database.js";

const prisma = databaseClient.getClient();

describe("Appointment System Integration Tests", () => {
  let patientAUserToken: string;
  let patientAUserId: string;
  let patientAProfileId: string;

  let patientBUserToken: string;
  let patientBUserId: string;

  let doctorAUserToken: string;
  let doctorAUserId: string;
  let doctorAProfileId: string;

  let hospitalAId: string;
  let hospitalBId: string;

  let hospitalAStaffToken: string;
  let hospitalAStaffUserId: string;

  let bookedAppointmentId: string;

  const testDate = "2026-11-20";
  const testStartTime = "10:00";
  const testEndTime = "10:30";

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
    const genPhone = () => "+919" + Math.floor(100000000 + Math.random() * 900000000);

    // 1. Register Patient A
    const emailA = `patient.appt.A.${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({
      email: emailA, password: "Password123!", firstName: "Alice", lastName: "Appt", phone: genPhone()
    });
    const loginA = await request(app).post("/api/auth/login").send({ email: emailA, password: "Password123!" });
    patientAUserToken = loginA.body.accessToken;
    patientAUserId = loginA.body.user.id;
    const profileA = await prisma.patientProfile.findUnique({ where: { userId: patientAUserId } });
    patientAProfileId = profileA!.id;

    // 2. Register Patient B
    const emailB = `patient.appt.B.${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({
      email: emailB, password: "Password123!", firstName: "Bob", lastName: "Appt", phone: genPhone()
    });
    const loginB = await request(app).post("/api/auth/login").send({ email: emailB, password: "Password123!" });
    patientBUserToken = loginB.body.accessToken;
    patientBUserId = loginB.body.user.id;

    // 3. Register Doctor A
    const emailDocA = `doc.appt.A.${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({
      email: emailDocA, password: "Password123!", firstName: "Dr. Clara", lastName: "Oswald", phone: genPhone()
    });
    const loginDocA = await request(app).post("/api/auth/login").send({ email: emailDocA, password: "Password123!" });
    doctorAUserToken = loginDocA.body.accessToken;
    doctorAUserId = loginDocA.body.user.id;

    const docProfile = await prisma.doctorProfile.create({
      data: {
        userId: doctorAUserId,
        registrationNumber: `REG-APPT-${Date.now()}`,
        specialty: "Cardiology",
        verificationStatus: "VERIFIED"
      }
    });
    doctorAProfileId = docProfile.id;

    // 4. Register Hospital A & Membership for Doctor A
    const hospA = await prisma.hospital.create({
      data: { name: "St. Jude Hospital A", code: `HOSP-A-${Date.now()}`, verificationStatus: "VERIFIED" }
    });
    hospitalAId = hospA.id;

    await prisma.hospitalMembership.create({
      data: { hospitalId: hospitalAId, userId: doctorAUserId, role: "DOCTOR", status: "ACTIVE" }
    });

    // 5. Register Hospital B (Cross-Tenant Test)
    const hospB = await prisma.hospital.create({
      data: { name: "Metro Hospital B", code: `HOSP-B-${Date.now()}`, verificationStatus: "VERIFIED" }
    });
    hospitalBId = hospB.id;

    // 6. Register Hospital A Staff
    const emailStaffA = `staff.appt.A.${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({
      email: emailStaffA, password: "Password123!", firstName: "Sam", lastName: "Staff", phone: genPhone()
    });
    const loginStaffA = await request(app).post("/api/auth/login").send({ email: emailStaffA, password: "Password123!" });
    hospitalAStaffToken = loginStaffA.body.accessToken;
    hospitalAStaffUserId = loginStaffA.body.user.id;

    await prisma.hospitalMembership.create({
      data: { hospitalId: hospitalAId, userId: hospitalAStaffUserId, role: "STAFF", status: "ACTIVE" }
    });
  });

  it("1. Patient can discover providers by search or specialty", async () => {
    const res = await request(app)
      .get("/api/appointments/providers?specialty=Cardiology")
      .set("Authorization", `Bearer ${patientAUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const foundDoc = res.body.find((d: any) => d.doctorId === doctorAProfileId);
    expect(foundDoc).toBeDefined();
    expect(foundDoc.specialty).toBe("Cardiology");
    expect(foundDoc.hospitals[0].hospitalId).toBe(hospitalAId);
  });

  it("2. Patient can view availability slots for provider on date", async () => {
    const res = await request(app)
      .get(`/api/appointments/availability?doctorId=${doctorAProfileId}&hospitalId=${hospitalAId}&date=${testDate}`)
      .set("Authorization", `Bearer ${patientAUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toBeDefined();
    expect(res.body.slots.length).toBeGreaterThan(0);
    const slot1000 = res.body.slots.find((s: any) => s.startTime === testStartTime);
    expect(slot1000.available).toBe(true);
  });

  it("3. Patient A can book an appointment successfully", async () => {
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAUserToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        appointmentDate: testDate,
        startTime: testStartTime,
        endTime: testEndTime,
        reason: "Annual cardiac checkup"
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.id).toBeDefined();
    expect(bookRes.body.status).toBe("SCHEDULED");
    bookedAppointmentId = bookRes.body.id;

    // Verify Notification
    const notifs = await prisma.notification.findMany({
      where: { userId: patientAUserId, type: "APPOINTMENT_BOOKED" }
    });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it("4. DOUBLE BOOKING PREVENTION: Patient B attempting to book exact same slot is REJECTED", async () => {
    const duplicateRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientBUserToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        appointmentDate: testDate,
        startTime: testStartTime,
        endTime: testEndTime,
        reason: "Conflicting appointment request"
      });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error).toContain("Slot is no longer available");
  });

  it("5. Availability API now reflects booked slot as unavailable", async () => {
    const res = await request(app)
      .get(`/api/appointments/availability?doctorId=${doctorAProfileId}&hospitalId=${hospitalAId}&date=${testDate}`)
      .set("Authorization", `Bearer ${patientAUserToken}`);

    expect(res.status).toBe(200);
    const slot1000 = res.body.slots.find((s: any) => s.startTime === testStartTime);
    expect(slot1000.available).toBe(false);
  });

  it("6. Patient A can view their appointments", async () => {
    const res = await request(app)
      .get("/api/appointments/patient")
      .set("Authorization", `Bearer ${patientAUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBe(bookedAppointmentId);
  });

  it("7. Assigned Doctor can view their appointments", async () => {
    const res = await request(app)
      .get("/api/appointments/provider")
      .set("Authorization", `Bearer ${doctorAUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBe(bookedAppointmentId);
  });

  it("8. Tenant Isolation: Hospital A staff sees Hospital A appts, Hospital B query blocked/isolated", async () => {
    // Hospital A staff queries Hospital A
    const resA = await request(app)
      .get(`/api/appointments/hospital/${hospitalAId}`)
      .set("Authorization", `Bearer ${hospitalAStaffToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.length).toBeGreaterThan(0);

    // Hospital A staff queries Hospital B -> Blocked by membership guard
    const resB = await request(app)
      .get(`/api/appointments/hospital/${hospitalBId}`)
      .set("Authorization", `Bearer ${hospitalAStaffToken}`);
    expect(resB.status).toBe(403);
  });

  it("9. Check-In creates/links Encounter and sets status to CHECKED_IN", async () => {
    const checkInRes = await request(app)
      .post(`/api/appointments/${bookedAppointmentId}/check-in`)
      .set("Authorization", `Bearer ${doctorAUserToken}`);

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.status).toBe("CHECKED_IN");
    expect(checkInRes.body.encounterId).toBeDefined();

    // Verify linked Encounter exists
    const encounter = await prisma.encounter.findUnique({
      where: { id: checkInRes.body.encounterId }
    });
    expect(encounter).toBeDefined();
    expect(encounter?.status).toBe("CHECKED_IN");
    expect(encounter?.hospitalId).toBe(hospitalAId);
  });

  it("10. Patient A can reschedule or cancel an appointment", async () => {
    // Book a second appointment for testing cancellation
    const bookRes = await request(app)
      .post("/api/appointments/book")
      .set("Authorization", `Bearer ${patientAUserToken}`)
      .send({
        hospitalId: hospitalAId,
        doctorId: doctorAProfileId,
        appointmentDate: testDate,
        startTime: "14:00",
        endTime: "14:30",
        reason: "Follow-up consultation"
      });

    expect(bookRes.status).toBe(201);
    const apptId2 = bookRes.body.id;

    // Reschedule apptId2 to 15:00
    const reschedRes = await request(app)
      .post(`/api/appointments/${apptId2}/reschedule`)
      .set("Authorization", `Bearer ${patientAUserToken}`)
      .send({
        appointmentDate: testDate,
        startTime: "15:00",
        endTime: "15:30"
      });
    expect(reschedRes.status).toBe(200);
    expect(reschedRes.body.startTime).toBe("15:00");

    // Cancel apptId2
    const cancelRes = await request(app)
      .post(`/api/appointments/${apptId2}/cancel`)
      .set("Authorization", `Bearer ${patientAUserToken}`)
      .send({ reason: "Schedule conflict" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe("CANCELLED");

    // Verify Patient B cannot cancel Patient A's appointment
    const unauthCancel = await request(app)
      .post(`/api/appointments/${bookedAppointmentId}/cancel`)
      .set("Authorization", `Bearer ${patientBUserToken}`)
      .send({ reason: "Malicious cancellation" });
    expect(unauthCancel.status).toBe(400);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Hospital", "Lab" CASCADE;`);
  });
});
