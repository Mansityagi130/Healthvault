# HealthVault — Phase 7 Scope Specification (Finalized & Audit-Corrected)

> **STATUS: PHASE 7 SCOPE CORRECTED — AWAITING IMPLEMENTATION AUTHORIZATION**  
> *Corrected and finalized on October 7, 2026, following the Scope Accuracy Audit. This is a binding planning and architecture specification document ONLY. No implementation code, Prisma schema edits, dependency additions, or configuration changes have been introduced.*

---

## 1. Objective & Rationale

HealthVault's verified baseline (Phases 1–6) includes multi-tenant patient identity, hospital verification, doctor onboarding, appointment queues, clinical encounters, lab workflows, emergency break-glass access, FHIR R4 exports, ClamAV fail-closed malware scanning, local-first storage architecture, and stateful ABDM consent management.

Phase 7 targets two approved local-first infrastructure capabilities:
1. **Real S3-Compatible Storage Provider (`S3StorageProvider`)**: Transition `S3StorageProvider` from its current in-memory test double to a functional S3 client using the official AWS SDK v3 (`@aws-sdk/client-s3`), communicating with a locally hosted MinIO container under an optional Docker Compose profile (`storage`). Local filesystem storage (`LocalStorageProvider`) remains the default development provider.
2. **Authenticated Real-Time Outbox Notification Stream (SSE)**: Expose a secure, real-time Server-Sent Events (SSE) stream endpoint (`/api/notifications/stream`) reading from transactional outbox events (`outboxEvent` / `Notification` models) to push live updates to authenticated clients without third-party dependencies.

---

## 2. Scope Boundaries

### In-Scope Features
1. **Real S3-Compatible Storage Driver**: Retain `S3StorageProvider` class name; implement S3 SDK operations (`PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `HeadObjectCommand`, `CopyObjectCommand`) targeting a local MinIO service when `STORAGE_PROVIDER=s3`.
2. **Optional Docker Compose Storage Profile**: Add an optional `storage` profile definition (`minio/minio:latest`) to `docker-compose.yml` so MinIO runs only when explicitly launched (`docker compose --profile storage up -d`). Default local development requires zero extra container overhead.
3. **Authenticated SSE Notification Endpoint**: Expose `/api/notifications/stream` for real-time notification delivery backed by transactional outbox events (`ABDM_EXCHANGE`, `NOTIFICATION`, and scan completion notifications).

### Explicitly Deferred or Excluded
- **Live ABDM Gateway Sandbox**: Retain `MockAbdmAdapter` and stateful local ABDM consent engine. No live NHA sandbox registration or public webhooks required.
- **Paid Cloud & SaaS Integrations**: No mandatory AWS S3 charges, paid SMS/email gateways, or third-party cloud services.
- **Telemedicine & Billing**: No WebRTC video stream servers, TURN/STUN infrastructure, or payment gateways (Razorpay/Stripe).
- **New Business Workflows**: No unapproved database models, schema alterations, or unrelated business logic.

---

## 3. Storage Architecture & MinIO Configuration

### A. Provider Selection & Fallback Rules
- **Default Provider**: `STORAGE_PROVIDER=local` instantiates `LocalStorageProvider` (persists files locally in `./storage`).
- **S3/MinIO Provider**: `STORAGE_PROVIDER=s3` instantiates `S3StorageProvider` initialized with S3 client parameters (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- **Path Traversal Protection**: Both `LocalStorageProvider` and `S3StorageProvider` enforce strict `validateKey` checks (rejecting `..`, leading `/`, or `\`).
- **Quarantine-to-Approved Transition**: Namespace transitions (`quarantine/` → `approved/`) execute via `CopyObjectCommand` and `DeleteObjectCommand` on S3/MinIO.

### B. MinIO Docker Profile Expectations
- Defined under `profiles: ["storage"]` in `docker-compose.yml`.
- Standard development (`docker compose up -d`) launches PostgreSQL, Redis, ClamAV, Backend, Frontend, and Nginx. MinIO starts only when `--profile storage` is specified.
- Developer environment parameters for optional MinIO testing:
  ```env
  STORAGE_PROVIDER=s3
  S3_ENDPOINT=http://127.0.0.1:9000
  S3_REGION=us-east-1
  S3_BUCKET=healthvault-records
  S3_ACCESS_KEY_ID=minioadmin
  S3_SECRET_ACCESS_KEY=minioadmin
  ```

---

## 4. Audit Findings & Implementation Prerequisites

### A. NPM Package Dependency
- **Prerequisite**: `@aws-sdk/client-s3` is not currently installed in `backend/package.json`. Installing this dependency is a mandatory prerequisite step when implementation is authorized.

### B. Outbox Event Producer Verification
- **Consent Events (`ABDM_EXCHANGE`)**: `backend/src/interoperability/abdm/abdm.service.ts` writes `outboxEvent` entries on consent request and status updates (`REQUESTED`, `AUTHORIZED`, `CANCELLED`, `EXPIRED`). Payload structure and tenant isolation must be verified during implementation.
- **Appointment Events (`NOTIFICATION`)**: `backend/src/services/appointment.service.ts` calls `notificationService.createNotification`, which writes `outboxEvent` entries with topic `'NOTIFICATION'`.
- **Document Scan Completion Prerequisite**: `backend/src/jobs/document-scan/index.ts` currently updates `medicalDocument.securityStatus` and logs audit events, but does NOT publish a completion notification. A scan-completion notification write via `notificationService.createNotification` must be implemented in `processDocumentScan` as a prerequisite for SSE scan completion alerts.

### C. Worker Retry & Transaction Safety
- Scan completion notification creation must be transactionally safe and idempotent. Job retries in BullMQ/Redis must not generate duplicate notification records or duplicate outbox events.
- Notification payloads must strictly adhere to zero-trust rules: contain minimal event IDs and status codes (`CLEAN`, `INFECTED`, `SCAN_FAILED`) only. Never expose medical record details, unencrypted PHI, or secrets.

---

## 5. Authenticated Server-Sent Events (SSE) Stream

### A. Route & Authentication
- **Endpoint**: `/api/notifications/stream`
- **Authentication**: Requires valid Bearer JWT header or authenticated session cookie. Anonymous or unauthenticated requests return HTTP 401.
- **Organization & User Isolation**: Event filters ensure patients receive only their own notifications, doctors receive relevant patient updates, and hospital admins receive tenant-scoped alerts. Cross-tenant event leakage is strictly prohibited.

### B. Minimal Event Payloads & Security
- Delivered event payloads contain **minimal metadata only**:
  ```json
  {
    "eventId": "evt_12345",
    "type": "DOCUMENT_SCAN_COMPLETED",
    "status": "CLEAN",
    "timestamp": "2026-10-07T02:00:00Z"
  }
  ```
- **Forbidden Content**: SSE streams must NEVER contain unencrypted medical record text, document file buffers, MFA secrets, password tokens, or unencrypted PHI.

### C. Stream Lifecycle & Resource Protection
- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- **Heartbeat**: Periodic `: ping\n\n` comments sent every 15 seconds to prevent proxy connection timeouts.
- **Connection Cleanup**: Listeners attach to outbox/notification events on client connection and unbind automatically on socket close (`req.on("close")`) to prevent event emitter memory leaks.

---

## 6. Security, Privacy & Data Isolation

1. **Zero-Trust Document Security**: Documents initially land in `quarantine/`. ClamAV scanning remains mandatory and fail-closed (`SCAN_FAILED` on socket error or timeout). Download endpoints reject non-`CLEAN` files (`securityStatus !== "CLEAN"`).
2. **Scanner Fallback Prohibition**: `ScannerFactory` strictly prevents `MockScanner` in production (`NODE_ENV=production`).
3. **Immutability & Tenant Boundaries**: Finalized lab reports and locked records cannot be overwritten via S3 storage or notification updates. Multi-tenant database queries enforce `patientId` / `hospitalId` scoping.
4. **Zero Paid Services**: All infrastructure (Postgres, Redis, ClamAV, MinIO, SSE) runs locally at ₹0 cost.

---

## 7. Acceptance Criteria

| Feature | Objective Acceptance Criteria |
|---|---|
| **S3 Provider (MinIO)** | `S3StorageProvider` uses `@aws-sdk/client-s3` to upload, retrieve, delete, check existence, and move objects (`quarantine/` → `approved/`) against local MinIO. Invalid keys throw path traversal errors. |
| **Optional Storage Profile** | `docker compose up -d` starts standard services without MinIO; `docker compose --profile storage up -d` starts MinIO on port 9000. |
| **SSE Stream Endpoint** | `/api/notifications/stream` accepts valid JWT auth, sets event-stream headers, pushes outbox notifications, filters by user ID, and cleans up sockets on disconnect. Unauthenticated requests yield HTTP 401. |
| **Regression & Build** | `npx vitest run --fileParallelism=false` passes all 35+ backend integration test files (263+ tests). `npm run build` compiles all 43 frontend routes with 0 errors. |

---

## 8. Definition of Done

1. `@aws-sdk/client-s3` dependency added to `backend/package.json`.
2. `S3StorageProvider` refactored using `@aws-sdk/client-s3` with 100% path traversal protection and namespace movement.
3. Optional `storage` profile added to `docker-compose.yml` for local MinIO container execution.
4. Scan completion notification producer added to `backend/src/jobs/document-scan/index.ts` with retry idempotency and zero PHI leakage.
5. SSE notification stream endpoint `/api/notifications/stream` implemented with JWT auth, role filtering, minimal payloads, and socket cleanup.
6. All targeted Phase 7 integration tests pass.
7. Full backend regression test suite (35+ files, 263+ tests) passes with zero failures and zero skips.
8. Frontend production build (`npm run build`) succeeds with zero errors across 43+ routes.
9. Working tree remains clean with zero paid API dependencies.

---

## 9. Implementation Authorization Notice

> **AUTHORIZATION HOLD**: Implementation of Phase 7 has **NOT** been authorized by this task. No source code modifications, package installs, or configuration changes have been made. Implementation will begin only upon explicit user directive.
