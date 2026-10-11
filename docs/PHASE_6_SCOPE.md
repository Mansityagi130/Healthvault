# HealthVault — Phase 6 Scope Specification

> **STATUS: APPROVED — IMPLEMENTATION IN PROGRESS**  
> *Approved by user on October 7, 2026. Authorizes ClamAV Integration, Storage Provider Factory, and Stateful Local ABDM Transaction Lifecycle.*

---

## 1. Problem Statement & Approved Baseline Gaps

HealthVault's core healthcare platform (Phases 1–5) provides comprehensive patient identity, hospital management, doctor consultations, lab workflows, emergency access, and FHIR R4 interoperability.

Phase 6 addresses three approved infrastructure and security gaps:
1. **Malware Scanning**: Upgrade `MockScanner` string matching to a production-grade `ClamAVScanner` streaming file bytes over TCP socket to a self-hosted ClamAV daemon (`clamav/clamav:latest`), enforcing zero-trust fail-closed security (`SCAN_FAILED` quarantine on connection error/timeout).
2. **Storage Architecture**: Introduce `StorageFactory` to select `LocalStorageProvider` (default ₹0 local) or `S3StorageProvider` based on configuration, with strict path traversal validation across all storage operations.
3. **ABDM Transaction Lifecycle**: Enhance `AbdmService` with stateful transaction management for ABDM consent requests (`CONSENT_REQUEST`, `DATA_TRANSFER`) with status lifecycle (`REQUESTED`, `GRANTED`, `DENIED`, `EXPIRED`) and outbox event delivery.

---

## 2. Approved In-Scope Functionality

### A. Real ClamAV Antivirus Scanner Client (`ClamAVScanner`)
- Implement `ClamAVScanner` implementing `MalwareScanner` interface via TCP socket (`INSTREAM` protocol on port 3310).
- Add `clamav` container service definition in `docker-compose.yml` (`clamav/clamav:latest` on port 3310).
- Enforce fail-closed security: connection errors, timeouts, or scanner crashes yield `SCAN_FAILED` status, keeping files strictly quarantined and inaccessible for download.
- Retain `MockScanner` for local offline unit test fixtures (e.g. EICAR test string detection).

### B. Pluggable Storage Provider Factory (`StorageFactory`)
- Implement `StorageFactory` to select `LocalStorageProvider` or `S3StorageProvider` based on `STORAGE_PROVIDER` environment variable (`local` vs `s3`).
- Validate storage configuration at startup to prevent unsafe fallbacks.
- Enforce strict path traversal validation (`path.resolve`) across all storage keys and namespace transitions (`quarantine/` -> `approved/`).

### C. Stateful ABDM Transaction Engine (`AbdmService`)
- Define and enforce valid consent states: `REQUESTED`, `GRANTED`, `DENIED`, `EXPIRED`.
- Extend `AbdmService` to manage state transitions for `ExternalExchangeTransaction` entities.
- Publish `ABDM_EXCHANGE` outbox events with idempotency tracking.

---

## 3. Explicit Out-of-Scope Items

- **Paid Cloud Services**: No mandatory AWS S3 buckets, paid antivirus SaaS, or paid SMS/email gateways.
- **External ABDM Sandbox Registration**: No live NHA gateway client credentials or external public webhooks required.
- **Phase 7 Features**: Telemedicine video streams, billing/invoicing, or push notifications.

---

## 4. Acceptance Criteria & Verification Matrix

| Area | Feature | Objective Acceptance Criteria |
|---|---|---|
| **Malware Scanning** | `ClamAVScanner` | Streams file bytes via TCP socket. EICAR test payloads yield `INFECTED` and remain quarantined. Clean files transition to `CLEAN` and move to `approved/`. Connection failures/timeouts return `SCAN_FAILED`. |
| **Storage Engine** | `StorageFactory` | Configured provider (`local` default) instantiated at startup. Keys undergo strict path traversal validation. `moveToNamespace` moves files between `quarantine/` and `approved/`. |
| **ABDM Transactions** | ABDM State Machine | State transitions for `REQUESTED` -> `GRANTED`/`DENIED`/`EXPIRED` validated. Duplicate state transitions rejected. `ABDM_EXCHANGE` outbox events written. |
| **Security & Isolation** | Data Boundaries | Non-CLEAN files block download attempts (HTTP 400/403). Multi-tenant isolation for hospital, doctor, lab, and patient profiles maintained. |
| **Regression** | Test Suites | `npx vitest run` passes 34+ test files (253+ tests). `npm run build` compiles 43+ frontend routes with 0 errors. |

---

## 5. Budget & ₹0 Cost Confirmation

- **ClamAV Antivirus Daemon**: Free open-source Docker container (`clamav/clamav:latest`).
- **Storage Engine**: Free local filesystem storage (`STORAGE_PROVIDER=local`) with zero-cost S3/MinIO abstraction.
- **Total Additional Cost**: **₹0**.
