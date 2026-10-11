import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("RBAC Navigation & Tenant Boundary Integration Tests", () => {
  let patientToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    // Register test patient
    const patRes = await request(app).post("/api/auth/register").send({
      email: `testpatient-${Date.now()}@healthvault.local`,
      password: "Password123!",
      firstName: "Test",
      lastName: "Patient"
    });
    if (patRes.status === 201 || patRes.status === 200) {
      patientToken = patRes.body.accessToken;
    } else {
      const loginRes = await request(app).post("/api/auth/login").send({
        email: "patient@healthvault.com",
        password: "Password123!"
      });
      patientToken = loginRes.body.accessToken;
    }

    // Register test doctor
    const docRes = await request(app).post("/api/auth/register").send({
      email: `testdoctor-${Date.now()}@healthvault.local`,
      password: "Password123!",
      firstName: "Test",
      lastName: "Doctor"
    });
    if (docRes.status === 201 || docRes.status === 200) {
      doctorToken = docRes.body.accessToken;
    }
  });

  it("Patient cannot access restricted Hospital Admin members API", async () => {
    const res = await request(app)
      .get("/api/hospitals/some-hosp-id/members")
      .set("Authorization", `Bearer ${patientToken}`);
    expect([401, 403]).toContain(res.status);
  });

  it("Patient cannot access restricted Lab stats API", async () => {
    const res = await request(app)
      .get("/api/labs/some-lab-id/stats")
      .set("Authorization", `Bearer ${patientToken}`);
    expect([401, 403]).toContain(res.status);
  });

  it("Doctor cannot access restricted Platform Admin endpoints", async () => {
    const res = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect([401, 403]).toContain(res.status);
  });
});
