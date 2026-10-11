import bcrypt from "bcrypt";
import { databaseClient } from "./config/database.js";
import { AccountStatus, ProfileVerificationStatus, MembershipRole } from "./generated/prisma/enums.js";

async function main() {
  const prisma = databaseClient.getClient();
  const passwordHash = await bcrypt.hash("Password123!", 12);

  // 1. Patient User
  let patientUser = await prisma.user.findUnique({ where: { email: "patient@healthvault.com" } });
  if (!patientUser) {
    patientUser = await prisma.user.create({
      data: {
        email: "patient@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        patientProfile: {
          create: {
            firstName: "John",
            lastName: "Doe",
            dateOfBirth: new Date("1990-05-15"),
            sexAtBirth: "Male",
            preferredLanguage: "English"
          }
        }
      }
    });
    console.log("Created Patient: patient@healthvault.com");
  } else {
    await prisma.user.update({
      where: { email: "patient@healthvault.com" },
      data: { passwordHash, status: AccountStatus.ACTIVE }
    });
    console.log("Updated Patient: patient@healthvault.com");
  }

  // 2. Doctor / Provider User
  let doctorUser = await prisma.user.findUnique({ where: { email: "doctor@healthvault.com" } });
  if (!doctorUser) {
    doctorUser = await prisma.user.create({
      data: {
        email: "doctor@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        doctorProfile: {
          create: {
            registrationNumber: "DOC-998877",
            specialty: "General Medicine",
            verificationStatus: ProfileVerificationStatus.VERIFIED
          }
        }
      }
    });
    console.log("Created Doctor: doctor@healthvault.com");
  } else {
    await prisma.user.update({
      where: { email: "doctor@healthvault.com" },
      data: { passwordHash, status: AccountStatus.ACTIVE }
    });
    console.log("Updated Doctor: doctor@healthvault.com");
  }

  // 3. Hospital Admin & Hospital
  let hospital = await prisma.hospital.findFirst({ where: { name: "City Central Hospital" } });
  if (!hospital) {
    hospital = await prisma.hospital.create({
      data: {
        name: "City Central Hospital",
        code: "HOSP-001",
        address: { street: "124 Healthcare Boulevard", city: "Metropolis" }
      }
    });
  }

  let hospitalUser = await prisma.user.findUnique({ where: { email: "hospital@healthvault.com" } });
  if (!hospitalUser) {
    hospitalUser = await prisma.user.create({
      data: {
        email: "hospital@healthvault.com",
        passwordHash,
        status: AccountStatus.ACTIVE,
        hospitalMemberships: {
          create: {
            hospitalId: hospital.id,
            role: MembershipRole.HOSPITAL_ADMIN
          }
        }
      }
    });
    console.log("Created Hospital Admin: hospital@healthvault.com");
  } else {
    await prisma.user.update({
      where: { email: "hospital@healthvault.com" },
      data: { passwordHash, status: AccountStatus.ACTIVE }
    });
    console.log("Updated Hospital User: hospital@healthvault.com");
  }

  // 4. Lab Tech & Lab
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
        labMemberships: {
          create: {
            labId: lab.id,
            role: MembershipRole.LAB_USER
          }
        }
      }
    });
    console.log("Created Lab Member: lab@healthvault.com");
  } else {
    await prisma.user.update({
      where: { email: "lab@healthvault.com" },
      data: { passwordHash, status: AccountStatus.ACTIVE }
    });
    console.log("Updated Lab User: lab@healthvault.com");
  }

  await databaseClient.disconnect();
}

main().catch(console.error);
