-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "doctorIdDisplay" TEXT,
ADD COLUMN     "licenseState" TEXT;

-- Add new Hospital columns and safely convert verificationStatus.
ALTER TABLE "Hospital"
    ADD COLUMN "contactEmail" TEXT,
    ADD COLUMN "contactPhone" TEXT,
    ADD COLUMN "hfrFacilityId" TEXT,
    ADD COLUMN "hospitalIdDisplay" TEXT,
    ADD COLUMN "licenseNumber" TEXT,
    ADD COLUMN "rejectionReason" TEXT,
    ADD COLUMN "reviewedByUserId" UUID,
    ADD COLUMN "suspendedReason" TEXT,
    ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "Hospital"
    ALTER COLUMN "verificationStatus" DROP DEFAULT;

ALTER TABLE "Hospital"
    ALTER COLUMN "verificationStatus" TYPE "HospitalVerificationStatus"
    USING (
        CASE "verificationStatus"::text
            WHEN 'PENDING' THEN 'PENDING_REVIEW'
            WHEN 'VERIFIED' THEN 'VERIFIED'
            WHEN 'REJECTED' THEN 'REJECTED'
        END
    )::"HospitalVerificationStatus";

ALTER TABLE "Hospital"
    ALTER COLUMN "verificationStatus" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "patientIdDisplay" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInvitation" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "departmentId" UUID,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'DOCTOR',
    "invitationTokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "acceptedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "publicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "departmentId" UUID,
    "doctorId" UUID,
    "encounterId" UUID,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotTimestamp" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "notes" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_tokenHash_idx" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalInvitation_invitationTokenHash_key" ON "HospitalInvitation"("invitationTokenHash");

-- CreateIndex
CREATE INDEX "HospitalInvitation_hospitalId_status_idx" ON "HospitalInvitation"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "HospitalInvitation_email_status_idx" ON "HospitalInvitation"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_publicId_key" ON "Appointment"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_encounterId_key" ON "Appointment"("encounterId");

-- CreateIndex
CREATE INDEX "Appointment_patientId_status_idx" ON "Appointment"("patientId", "status");

-- CreateIndex
CREATE INDEX "Appointment_hospitalId_status_idx" ON "Appointment"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_status_idx" ON "Appointment"("doctorId", "status");

-- CreateIndex
CREATE INDEX "Appointment_slotTimestamp_idx" ON "Appointment"("slotTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_doctorIdDisplay_key" ON "DoctorProfile"("doctorIdDisplay");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_hospitalIdDisplay_key" ON "Hospital"("hospitalIdDisplay");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_patientIdDisplay_key" ON "PatientProfile"("patientIdDisplay");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvitation" ADD CONSTRAINT "HospitalInvitation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvitation" ADD CONSTRAINT "HospitalInvitation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

