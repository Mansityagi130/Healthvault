import bcrypt from "bcrypt";
import { databaseClient } from "./config/database.js";
import { AccountStatus, ProfileVerificationStatus, HospitalVerificationStatus, MembershipRole, HospitalStatus } from "./generated/prisma/enums.js";

async function main() {
  const prisma = databaseClient.getClient();
  const passwordHash = await bcrypt.hash("Password123!", 12);

  console.log("=== SEEDING HEALTHVAULT DEMO & REAL INFRASTRUCTURE ===");

  // 1. HealthVault Platform Admin
  let adminUser = await prisma.user.findFirst({
    where: { OR: [{ email: "admin@healthvault.local" }, { email: "admin@healthvault.com" }] }
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: "admin@healthvault.local",
        passwordHash,
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        isPlatformAdmin: true
      }
    });
    console.log("Created Platform Admin: admin@healthvault.local");
  } else {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { isPlatformAdmin: true, isEmailVerified: true, status: AccountStatus.ACTIVE }
    });
    console.log("Updated Platform Admin: admin@healthvault.local");
  }

  // 2. Demo Hospital
  let demoHospital = await prisma.hospital.findFirst({
    where: { OR: [{ code: "HOSP-DEMO-001" }, { name: "HealthVault Demo Hospital" }, { name: "City Central Hospital" }] }
  });

  if (!demoHospital) {
    demoHospital = await prisma.hospital.create({
      data: {
        name: "HealthVault Demo Hospital",
        code: "HOSP-DEMO-001",
        hospitalIdDisplay: "HV-HOSP-DEMO01",
        hfrFacilityId: "HFR-IN-DEMO-9900",
        licenseNumber: "LIC-DEMO-7788",
        contactEmail: "contact@demohospital.healthvault.local",
        contactPhone: "+919876543210",
        address: { street: "100 Healthcare Boulevard", city: "Metropolis", state: "State", country: "India" },
        status: HospitalStatus.ACTIVE,
        verificationStatus: HospitalVerificationStatus.VERIFIED,
        verifiedAt: new Date()
      }
    });
    console.log("Created Hospital: HealthVault Demo Hospital (HV-HOSP-DEMO01)");
  } else {
    await prisma.hospital.update({
      where: { id: demoHospital.id },
      data: {
        verificationStatus: HospitalVerificationStatus.VERIFIED,
        hospitalIdDisplay: demoHospital.hospitalIdDisplay || "HV-HOSP-DEMO01"
      }
    });
    console.log("Updated Hospital: HealthVault Demo Hospital");
  }

  // Demo Departments
  const cardDept = await prisma.department.upsert({
    where: { hospitalId_name: { hospitalId: demoHospital.id, name: "Cardiology" } },
    create: { hospitalId: demoHospital.id, name: "Cardiology", code: "DEPT-CARD-001" },
    update: {}
  });

  const genDept = await prisma.department.upsert({
    where: { hospitalId_name: { hospitalId: demoHospital.id, name: "General Medicine" } },
    create: { hospitalId: demoHospital.id, name: "General Medicine", code: "DEPT-GEN-001" },
    update: {}
  });

  const orthoDept = await prisma.department.upsert({
    where: { hospitalId_name: { hospitalId: demoHospital.id, name: "Orthopedics" } },
    create: { hospitalId: demoHospital.id, name: "Orthopedics", code: "DEPT-ORTH-001" },
    update: {}
  });

  // 3. Demo Hospital Admin User
  let hospitalUser = await prisma.user.findFirst({
    where: { OR: [{ email: "hospital.admin@healthvault.local" }, { email: "hospital@healthvault.com" }] }
  });

  if (!hospitalUser) {
    hospitalUser = await prisma.user.create({
      data: {
        email: "hospital@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        hospitalMemberships: {
          create: {
            hospitalId: demoHospital.id,
            role: MembershipRole.HOSPITAL_ADMIN
          }
        }
      }
    });
    console.log("Created Hospital Admin: hospital@healthvault.com");
  } else {
    await prisma.user.update({
      where: { id: hospitalUser.id },
      data: { passwordHash, status: AccountStatus.ACTIVE, isEmailVerified: true }
    });
  }

  // 4. Fictional Demo Doctors
  const doctorsData = [
    {
      email: "doctor@healthvault.com",
      altEmail: "doctor1.demo@healthvault.local",
      name: "Dr. Aarav Mehta",
      firstName: "Aarav",
      lastName: "Mehta",
      regNo: "DOC-DEMO-001",
      doctorIdDisplay: "HV-DOC-DEMO01",
      specialty: "General Medicine",
      departmentId: genDept.id
    },
    {
      email: "doctor2.demo@healthvault.local",
      name: "Dr. Riya Kapoor",
      firstName: "Riya",
      lastName: "Kapoor",
      regNo: "DOC-DEMO-002",
      doctorIdDisplay: "HV-DOC-DEMO02",
      specialty: "Cardiology",
      departmentId: cardDept.id
    },
    {
      email: "doctor3.demo@healthvault.local",
      name: "Dr. Arjun Malhotra",
      firstName: "Arjun",
      lastName: "Malhotra",
      regNo: "DOC-DEMO-003",
      doctorIdDisplay: "HV-DOC-DEMO03",
      specialty: "Orthopedics",
      departmentId: orthoDept.id
    }
  ];

  for (const docData of doctorsData) {
    let docUser = await prisma.user.findFirst({
      where: { OR: [{ email: docData.email }, docData.altEmail ? { email: docData.altEmail } : {}] }
    });

    if (!docUser) {
      docUser = await prisma.user.create({
        data: {
          email: docData.email,
          passwordHash,
          status: AccountStatus.ACTIVE,
          isEmailVerified: true,
          doctorProfile: {
            create: {
              registrationNumber: docData.regNo,
              specialty: docData.specialty,
              doctorIdDisplay: docData.doctorIdDisplay,
              verificationStatus: ProfileVerificationStatus.VERIFIED
            }
          }
        }
      });
      console.log(`Created Demo Doctor: ${docData.name} (${docData.email})`);
    } else {
      const profile = await prisma.doctorProfile.findUnique({ where: { userId: docUser.id } });
      if (!profile) {
        await prisma.doctorProfile.create({
          data: {
            userId: docUser.id,
            registrationNumber: docData.regNo,
            specialty: docData.specialty,
            doctorIdDisplay: docData.doctorIdDisplay,
            verificationStatus: ProfileVerificationStatus.VERIFIED
          }
        });
      }
    }

    // Ensure Active HospitalMembership for Demo Hospital
    const existingMem = await prisma.hospitalMembership.findFirst({
      where: { hospitalId: demoHospital.id, userId: docUser.id }
    });
    if (!existingMem) {
      await prisma.hospitalMembership.create({
        data: {
          hospitalId: demoHospital.id,
          userId: docUser.id,
          role: MembershipRole.DOCTOR,
          departmentId: docData.departmentId,
          status: "ACTIVE"
        }
      });
    }
  }

  // 5. Demo Patient User
  let patientUser = await prisma.user.findFirst({
    where: { OR: [{ email: "patient@healthvault.com" }, { email: "patient.demo@healthvault.local" }] }
  });

  if (!patientUser) {
    patientUser = await prisma.user.create({
      data: {
        email: "patient@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        patientProfile: {
          create: {
            patientIdDisplay: "HV-PAT-DEMO01",
            firstName: "John",
            lastName: "Doe",
            dateOfBirth: new Date("1990-05-15"),
            sexAtBirth: "Male",
            preferredLanguage: "English"
          }
        }
      }
    });
    console.log("Created Demo Patient: patient@healthvault.com (HV-PAT-DEMO01)");
  } else {
    await prisma.user.update({
      where: { id: patientUser.id },
      data: { passwordHash, status: AccountStatus.ACTIVE, isEmailVerified: true }
    });
    const patientProfile = await prisma.patientProfile.findUnique({ where: { userId: patientUser.id } });
    if (patientProfile && !patientProfile.patientIdDisplay) {
      await prisma.patientProfile.update({
        where: { id: patientProfile.id },
        data: { patientIdDisplay: "HV-PAT-DEMO01" }
      });
    }
  }

  // 6. Lab Tech & Lab
  let lab = await prisma.lab.findFirst({ where: { name: "Metro Diagnostics Lab" } });
  if (!lab) {
    lab = await prisma.lab.create({
      data: {
        name: "Metro Diagnostics Lab",
        address: { street: "45 Science Park Drive", city: "Metropolis" }
      }
    });
  }

  let labUser = await prisma.user.findUnique({ where: { email: "lab@healthvault.com" } });
  if (!labUser) {
    labUser = await prisma.user.create({
      data: {
        email: "lab@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        labMemberships: {
          create: {
            labId: lab.id,
            role: MembershipRole.LAB_USER
          }
        }
      }
    });
    console.log("Created Lab Member: lab@healthvault.com");
  }

  console.log("=== SEEDING COMPLETED SUCCESSFULLY ===");
  await databaseClient.disconnect();
}

main().catch(console.error);
