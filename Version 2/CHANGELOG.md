# Changelog

All notable changes to the **HealthVault** project are documented in this file. The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-10-12

### Added
- **Instant Patient-to-Patient QR Sharing**: Self-service 24-hour instant QR code and direct link sharing without selecting pre-registered doctors (`report-share.service.ts`, `shared-reports.routes.ts`).
- **External Recipient Verification Workflow**: Enforced recipient account registration/login before displaying shared medical reports, preserving opaque share tokens across the login journey.
- **Malware Defense Pipeline**: Integration of ClamAV TCP daemon (`healthvault-clamav`) with fail-closed quarantine architecture (`ClamAVScanner.ts`, `ScannerFactory.ts`).
- **Patient Demographic & Emergency Profile**: Dedicated emergency profile containing blood group, critical allergies, chronic conditions, emergency contacts, and organ donor status (`emergency.controller.ts`, `emergency.service.ts`).
- **Provider Emergency Access**: Audited emergency medical card lookup route for healthcare providers (`/provider/emergency`).
- **Appointment Scheduling Engine**: Multi-party appointment booking, listing, status transitions, and cancellation (`appointment.controller.ts`, `appointment.service.ts`).
- **PDF Dossier Export Engine**: Server-side branded PDF health summary generation using `pdfkit` (`pdf-export.service.ts`).
- **Consolidated Audit Logging**: Systematic audit event recording for file access, record views, emergency lookups, and authentication events with UI viewers.
- **Database Migrations & Schema**:
  - `20261007000000_add_missing_enums`: AuditAction and role enums.
  - `20261008000000_reconcile_schema`: Added `Appointment`, `EmailVerificationToken`, and `HospitalInvitation` tables.
  - `20261012000000_add_patient_report_share`: Added `PatientReportShare` and join table for granular report sharing.
- **Automated Test Infrastructure**: 24 new test suites including `patient-report-qr-sharing`, `production-secrets-hardening`, `redirect-security`, `email-transport`, `patient-documents-vault`, and `emergency`.

### Changed
- **Sharing Interface**: Redesigned `/sharing/new` into a dual-mode interface offering instant 24-hour QR sharing alongside the clinical provider selection workflow.
- **Notification Dropdown**: Streamlined topbar notifications with Server-Sent Events (`use-notification-stream.ts`), empty state handling, individual dismiss buttons, and "Mark all as read" API.
- **Docker Compose Configuration**: Added `healthvault-clamav` antivirus container, host port mapping `5433:5432` for test verification, MinIO profile for S3 testing, and healthcheck dependencies.
- **Email Service**: Upgraded email handling to support production SMTP transport with TLS (`nodemailer`).

### Fixed
- **Open Redirect Vulnerabilities**: Sanitized post-authentication destination redirects via internal-route validation (`redirect-utils.ts`).
- **Frontend Repetitive Text**: Removed duplicate tags, confusing badges (`RECOMMENDED`, `Clinical`), and redundant copy from the sharing interface.
- **Notification Payload Parsing**: Corrected JSONB payload parsing to prevent blank notification entries in the topbar.
- **Database Schema Inconsistencies**: Reconciled historical Prisma migrations with runtime constraints.

### Removed
- **Unverified Phone OTP Bypass**: Replaced unverified SMS stubs with email verification tokens and standard TOTP MFA.
- **Unscanned File Uploads**: Deprecated direct disk storage of attachments in favor of the antivirus quarantine scanner.

### Security
- **Production Secrets Hardening**: Environment validation rejects default placeholder keys, weak secrets (< 32 characters), and missing credentials at startup.
- **Quarantine Isolation**: Uploaded medical files remain inaccessible until ClamAV reports a clean scan result; scans fail closed if the scanner is unreachable.
- **Tokenized Share URLs**: Medical records are never exposed via raw IDs; all external shares use cryptographically random opaque tokens.
- **Token Revocation**: Patients can instantly invalidate active QR codes and direct links from their dashboard.

### Known Limitations
- Hospital administration and clinical laboratory portals remain functional prototypes excluded from the pilot scope.
- ABDM / ABHA milestone integrations are structured against NHA specifications but await live production Sandbox credentials.
- Antivirus scanning daemon requires at least 2 GB RAM allocated to Docker.

---

## [1.0.0] - 2026-09-01

### Initial Release
- **Core Architecture**: Full-stack multi-tier application with Next.js App Router frontend, Express TypeScript backend, PostgreSQL database, Redis cache/queue, and Nginx reverse proxy.
- **Authentication**: Email and password registration, bcrypt hashing, JWT access/refresh token pairs, and role-based access control.
- **Patient Dashboard**: CRUD operations for medical records, diagnoses, vital signs, allergies, and symptoms.
- **Provider Encounters**: Prototype clinical encounter recording and notes for registered doctors.
- **Document Attachments**: Basic medical document upload to local storage.
- **Docker Compose**: Containerized multi-service setup for local staging.
- **Initial ABDM Models**: Early database definitions for ABHA and health information interoperability.
