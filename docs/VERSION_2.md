# HealthVault — Version 2.0 (`v2.0.0`) Documentation

## 1. Overview and Purpose

**HealthVault Version 2.0 (`v2.0.0`)** is the production-hardened, patient-empowered release of HealthVault. Built to function as a secure, decentralized "DigiLocker for Healthcare", Version 2 enables patients to store, understand, export, and securely share their health records without requiring third-party healthcare facilities to have platform accounts.

Git Tag: [`v2.0.0`](https://github.com/Mansityagi130/Healthvault/releases/tag/v2.0.0)  
Release Title: **HealthVault Version 2.0**

---

## 2. Key Changes & Enhancements from Version 1

1. **Instant Patient-to-Patient QR Code & Direct Link Sharing**:
   - Patients can instantly generate a 24-hour secure QR code and direct URL without needing to select a doctor or provider.
   - External recipients who scan the QR or click the link are required to register or sign in, authenticating access to authorized records.
   - Granular record selection or zero-selection default (sharing all active records).
   - Immediate revocation capability with automatic 24-hour expiration.

2. **Malware Defense Pipeline (ClamAV Integration)**:
   - Dedicated `healthvault-clamav` daemon container running official ClamAV signatures.
   - All uploaded documents undergo automated antivirus scanning prior to entering the approved storage vault.
   - Fail-closed security architecture: if the virus scanner is offline or pending, files are quarantined and cannot be downloaded.

3. **Demographic & Emergency Medical Profile**:
   - Complete emergency dataset: blood group, critical allergies, chronic conditions, emergency contact details, and vital organ donor preferences.
   - Fast-access emergency summary view for verified healthcare providers and first responders with mandatory security audit logging.

4. **Appointment Scheduling System**:
   - Complete multi-party appointment lifecycle (Pending, Confirmed, Completed, Cancelled).
   - Dedicated dashboards for patients, clinical providers, and hospital coordinators.

5. **Patient Record Export (PDF Generation)**:
   - Automated server-side generation of branded PDF medical summary dossiers using `pdfkit`.
   - Comprehensive summaries including vital statistics, active medications, allergy lists, and clinical history.

6. **Production Security Hardening**:
   - Fail-fast configuration validator: rejects weak, short, or placeholder secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY`).
   - Open redirect whitelist protection in auth flows (`redirect-utils.ts`).
   - Rate limiting on authentication and sharing endpoints.

7. **Schema Reconciliation & Migrations**:
   - Reconciled Prisma schema with 3 additive migrations (`20261007000000`, `20261008000000`, `20261012000000`).
   - New database models: `PatientReportShare`, `Appointment`, `EmailVerificationToken`, `HospitalInvitation`.

---

## 3. Technology Stack (Version 2)

- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS, Lucide React, `qrcode.react`, `@zxing/browser`.
- **Backend**: Node.js, Express, TypeScript, Zod, Helmet, CORS, Rate Limiting, `pdfkit`, `nodemailer`, `@aws-sdk/client-s3`.
- **Antivirus Service**: ClamAV daemon (`clamav/clamav:latest`, TCP port 3310).
- **Database & ORM**: PostgreSQL 16 Alpine, Prisma ORM 5.
- **Cache & Asynchronous Jobs**: Redis 7 Alpine, BullMQ.
- **Reverse Proxy**: Nginx Alpine with customized security headers and proxy buffering.
- **Testing**: Vitest, Supertest (50 test suites, 78+ passing tests).
- **Object Storage Support**: S3-compatible architecture with local disk fallback and MinIO profile.

---

## 4. Setup and Verification Instructions

### 1. Prerequisites
- Docker Engine 24+ and Docker Compose v2+
- Node.js 20 LTS (for local non-docker development)
- 4 GB available system RAM (minimum 2 GB allocated for ClamAV daemon)

### 2. Running via Docker Compose
```bash
# Clone the repository
git clone https://github.com/Mansityagi130/Healthvault.git
cd Healthvault

# Configure environment
cp .env.example .env
# Edit .env with your secrets

# Start the full stack
docker compose up -d --build
```

### 3. Verifying Container Status
```bash
docker compose ps
```
Expected healthy containers:
- `healthvault-nginx` (Port 80)
- `healthvault-frontend` (Internal Port 3000)
- `healthvault-backend` (Internal Port 5000)
- `healthvault-db` (Port 5433 host mapped)
- `healthvault-redis` (Internal Port 6379)
- `healthvault-clamav` (Internal Port 3310)

### 4. Running the Automated Test Suite
```bash
# Execute integration and security tests
docker compose exec backend npm test

# Or run locally against test database:
cd backend
npm test
```

---

## 5. Scope Boundaries and Known Limitations

1. **Controlled Patient Dashboard Pilot**: The pilot release focuses on the **Patient Dashboard**, document vault, instant QR sharing, emergency profile, and appointments.
2. **Hospital and Laboratory Portals**: The hospital management and clinical laboratory portals remain functional demonstration prototypes and are not included in the patient-facing pilot scope.
3. **ABDM / ABHA Sandbox**: The ABDM and FHIR interoperability endpoints are structured against official ABDM M1/M2/M3 specifications, pending production Sandbox client credentials from the National Health Authority (NHA).
