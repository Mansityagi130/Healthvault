# HealthVault — System Architecture

## 1. System Overview

**HealthVault** is an enterprise-grade digital health-record wallet built for healthcare data self-sovereignty. The platform is designed around a multi-tier microservice architecture deployed via Docker containers, adhering to strict data isolation, zero-trust sharing, and privacy-by-design principles.

```mermaid
flowchart TD
    Client["Client Devices / Browsers<br>(Patients, Recipients, Doctors)"]
    Nginx["Reverse Proxy<br>(Nginx / Port 80)"]
    Frontend["Frontend Web App<br>(Next.js 14 App Router / Port 3000)"]
    Backend["Backend API Service<br>(Express TypeScript / Port 5000)"]
    Postgres[("Database<br>PostgreSQL 16")]
    Redis[("Cache & Job Queue<br>Redis 7")]
    ClamAV["Antivirus Daemon<br>ClamAV (Port 3310)"]
    Storage[("Medical Document Vault<br>/app/storage / S3")]

    Client -->|HTTPS / HTTP| Nginx
    Nginx -->|Proxy /| Frontend
    Nginx -->|Proxy /api| Backend
    Frontend -->|Client / Server Fetch| Backend
    Backend -->|Prisma ORM| Postgres
    Backend -->|Session / BullMQ| Redis
    Backend -->|Stream Scan TCP| ClamAV
    Backend -->|Quarantine & Approved| Storage
```

---

## 2. Core Architecture Modules

### A. Reverse Proxy (Nginx)
- **Role**: Entry point for all inbound traffic on port 80.
- **Responsibilities**:
  - Routing web traffic to `healthvault-frontend:3000`.
  - Routing API traffic (`/api/`) and report shares (`/shared/reports/`) to `healthvault-backend:5000`.
  - Enforcing security headers (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`).
  - Gzip and Brotli compression for static bundles.

### B. Frontend Application (Next.js 14 App Router)
- **Framework**: Next.js 14 with TypeScript and Tailwind CSS.
- **Key Modules**:
  - `(auth)`: Login, registration, password reset, and invitation acceptance.
  - `(dashboard)`: Patient self-service portal (records, documents, appointments, emergency profile, sharing).
  - `(provider)`: Clinical doctor encounter management and emergency record lookup.
  - `(hospital)`: Healthcare facility administrator coordination portal.
  - `(admin)`: Platform-level hospital onboarding verification.
  - `shared/reports/[token]`: Dedicated authenticated external recipient viewer for QR/link shares.

### C. Backend API Service (Express & TypeScript)
- **Architecture**: Controller-Service-Repository pattern with centralized error handling and Zod input validation schemas.
- **Core Services**:
  - `ReportShareService`: Cryptographic token generation, 24-hour TTL lifecycle, authorization validation, and instant revocation.
  - `DocumentService` & `ScannerFactory`: Multipart file uploads, stream piping to ClamAV, file metadata hashing, and directory isolation (`/app/storage/quarantine` vs `/app/storage/approved`).
  - `EmergencyService`: Patient demographic profiles and emergency lookup endpoints.
  - `AppointmentService`: Scheduling state machine (Pending -> Confirmed -> Completed / Cancelled).
  - `PdfExportService`: Server-side PDF rendering using `pdfkit`.
  - `AuditLogService`: Tamper-evident logging of authentication, record access, and sharing events.

### D. Data Persistence & Caching
- **Primary Database**: PostgreSQL 16 Alpine running on internal Docker network (host mapped to `5433` for administrative inspection). Managed via Prisma ORM with 26 migration steps.
- **Cache & Message Broker**: Redis 7 Alpine supporting session caching, rate-limiting counters, and BullMQ background task processing.

### E. Malware Defense Engine (ClamAV)
- **Container**: `healthvault-clamav` (`clamav/clamav:latest`).
- **Scanning Protocol**: INSTREAM socket protocol over TCP port 3310.
- **Policy**: **Fail-Closed**. If ClamAV is offline or busy, file status remains `PENDING_SCAN` and the file cannot be served or shared.

---

## 3. Data Flow & Security Sequences

### A. Patient-to-Patient QR Sharing Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient A
    participant FE as Frontend Dashboard
    participant BE as Backend API
    participant DB as PostgreSQL
    actor Recipient as Recipient B

    Patient->>FE: Click "Generate QR Code"
    FE->>BE: POST /api/patient/report-shares (TTL=24h)
    BE->>DB: Create PatientReportShare (Opaque Token, Expiration)
    BE-->>FE: Return shareUrl & token
    FE-->>Patient: Render 24-hr QR Code & Direct Link
    Patient->>Recipient: Share QR Code / URL
    Recipient->>BE: Scan QR / Navigate to /shared/reports/:token
    alt Recipient Not Logged In
        BE-->>Recipient: Redirect to /login?returnUrl=/shared/reports/:token
        Recipient->>BE: Authenticate / Register
    end
    BE->>DB: Validate Token, Expiration & Revocation Status
    DB-->>BE: Share Valid
    BE-->>Recipient: Display Authorized Medical Reports
```

### B. Medical Document Upload & Antivirus Quarantine

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient
    participant BE as Backend API
    participant Clam as ClamAV Daemon
    participant FS as Storage Vault
    participant DB as PostgreSQL

    Patient->>BE: POST /api/documents (Multipart File)
    BE->>FS: Write to /app/storage/quarantine/:id
    BE->>Clam: TCP INSTREAM (File Chunk Stream)
    alt Virus Detected
        Clam-->>BE: FOUND (Malware Signature)
        BE->>DB: Set DocumentStatus = REJECTED / INFECTED
        BE->>FS: Secure Delete from Quarantine
        BE-->>Patient: 400 Bad Request (Malware Detected)
    else Clean File
        Clam-->>BE: OK (No Threats)
        BE->>FS: Move file to /app/storage/approved/patients/...
        BE->>DB: Set DocumentStatus = APPROVED
        BE-->>Patient: 201 Created (Document Secured)
    end
```

---

## 4. Configuration and Environment Principles

1. **Defense in Depth**: Database and Redis ports are never exposed to public ingress; only Nginx port 80/443 is published.
2. **Fail-Fast Secrets Validation**: The application refuses to initialize in production if secrets are undefined, shorter than 32 characters, or match known development placeholders.
3. **Open Redirect Mitigation**: Post-login redirection targets are validated against an internal route whitelist to prevent phishing attacks.
4. **Least Privilege Data Access**: Multi-tenant patient isolation ensures SQL queries enforce ownership scoping (`patientId = req.user.id`).
