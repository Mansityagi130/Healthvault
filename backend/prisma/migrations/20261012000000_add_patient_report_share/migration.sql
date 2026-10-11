-- CreateTable
CREATE TABLE "PatientReportShare" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "selector" UUID NOT NULL,
    "title" TEXT,
    "recordIds" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "claimedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientReportShare_tokenHash_key" ON "PatientReportShare"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PatientReportShare_selector_key" ON "PatientReportShare"("selector");

-- CreateIndex
CREATE INDEX "PatientReportShare_patientId_expiresAt_idx" ON "PatientReportShare"("patientId", "expiresAt");

-- CreateIndex
CREATE INDEX "PatientReportShare_tokenHash_expiresAt_idx" ON "PatientReportShare"("tokenHash", "expiresAt");

-- CreateIndex
CREATE INDEX "PatientReportShare_selector_expiresAt_idx" ON "PatientReportShare"("selector", "expiresAt");

-- AddForeignKey
ALTER TABLE "PatientReportShare" ADD CONSTRAINT "PatientReportShare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientReportShare" ADD CONSTRAINT "PatientReportShare_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
