# HealthVault — Backup, Recovery and Disaster Recovery Procedures

## 1. Overview and Operational Principles

This document defines the standardized operational procedures for backup creation, storage synchronization, and disaster recovery validation for HealthVault.

### Core Safety Rules
1. **Never restore over an active production or staging database.** All restore tests and recovery drills must be executed exclusively in an isolated target database (e.g. `healthvault_restore_drill` or temporary staging container).
2. **Backups must be encrypted at rest and in transit.** Database dumps contain sensitive protected health information (PHI) and must be encrypted using AES-256 (GPG/KMS).
3. **Backup consistency between Database and Storage**: Document metadata and storage keys must match the physical files in object storage. Backups should take a database snapshot at the same checkpoint as storage snapshots.

---

## 2. PostgreSQL Database Backup Procedures

### A. Automated Nightly Logical Backup (`pg_dump`)
Logical backups export schema definitions, foreign keys, constraints, and table rows using PostgreSQL's custom archive format (`-F c`), which includes built-in compression and metadata.

#### Command:
```bash
# Set credentials securely in environment (do not pass in plaintext CLI args)
export PGPASSWORD="${DB_PASSWORD}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/healthvault/database"
BACKUP_FILE="${BACKUP_DIR}/healthvault_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# Execute custom-format backup
pg_dump \
  -h "${DB_HOST:-127.0.0.1}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-healthvault_user}" \
  -d "${DB_NAME:-healthvault}" \
  -F c \
  -b \
  -v \
  -f "${BACKUP_FILE}"

# Encrypt backup using GPG / KMS key
gpg --batch --yes --encrypt --recipient ops-backup@healthvault.local "${BACKUP_FILE}"
rm -f "${BACKUP_FILE}"
```

### B. Point-in-Time Recovery (PITR) via WAL Archiving (Production Tier)
For production deployments requiring RPO < 15 minutes:
1. In `postgresql.conf`:
   ```ini
   wal_level = replica
   archive_mode = on
   archive_command = 'test ! -f /mnt/wal_archive/%f && cp %p /mnt/wal_archive/%f'
   max_wal_senders = 3
   ```
2. Archive WAL segments continuously to secure encrypted cloud storage (e.g., S3 Glacier or GCS Archive).

---

## 3. Medical Document & File Storage Backup Procedures

### A. Local Filesystem Storage (`/app/storage`)
When using local storage (`STORAGE_PROVIDER=local`):
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
STORAGE_BACKUP="/var/backups/healthvault/storage/storage_${TIMESTAMP}.tar.gz"

mkdir -p "$(dirname "${STORAGE_BACKUP}")"

# Create compressed archive of storage directory
tar -czvf "${STORAGE_BACKUP}" -C /app storage

# Encrypt archive
gpg --batch --yes --encrypt --recipient ops-backup@healthvault.local "${STORAGE_BACKUP}"
rm -f "${STORAGE_BACKUP}"
```

### B. S3 / Cloud Object Storage (`STORAGE_PROVIDER=s3`)
When using S3-compatible cloud storage:
1. **Enable S3 Versioning**: Protects against accidental deletion and ransomware.
2. **Object Lifecycle Management**:
   - Retain current versions indefinitely.
   - Transition non-current versions to Glacier after 30 days.
3. **Cross-Region Replication (CRR)**:
   - Replicate bucket `healthvault-records` to a disaster recovery region `healthvault-records-dr`.
   - Require KMS Customer Managed Keys (CMK) with automated rotation.

---

## 4. Disaster Recovery & Restore Verification Runbook

### Prerequisites
- Never execute restore commands against the running production instance.
- Create an isolated database: `healthvault_restore_drill`.

### Step-by-Step Restore Verification Procedure

#### Step 1: Decrypt Backup Artifact
```bash
gpg --decrypt "${ENCRYPTED_BACKUP_FILE}" > /tmp/restore_drill.dump
```

#### Step 2: Create Isolated Target Database
```bash
export PGPASSWORD="${DB_PASSWORD}"

psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "${DB_USER:-healthvault_user}" -d postgres -c \
  "DROP DATABASE IF EXISTS healthvault_restore_drill;"

psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "${DB_USER:-healthvault_user}" -d postgres -c \
  "CREATE DATABASE healthvault_restore_drill;"
```

#### Step 3: Execute pg_restore
```bash
pg_restore \
  -h "${DB_HOST:-127.0.0.1}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-healthvault_user}" \
  -d healthvault_restore_drill \
  -v \
  --no-owner \
  /tmp/restore_drill.dump
```

#### Step 4: Validate Data Integrity and Row Counts
Run an automated verification query comparing row counts between production baseline and restored database:
```sql
SELECT 'User' as tbl, count(*) FROM "User"
UNION ALL
SELECT 'PatientProfile', count(*) FROM "PatientProfile"
UNION ALL
SELECT 'MedicalRecord', count(*) FROM "MedicalRecord"
UNION ALL
SELECT 'MedicalDocument', count(*) FROM "MedicalDocument"
UNION ALL
SELECT 'AuditLog', count(*) FROM "AuditLog";
```

#### Step 5: Clean Up Drill Database and Temp Artifacts
```bash
psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "${DB_USER:-healthvault_user}" -d postgres -c \
  "DROP DATABASE healthvault_restore_drill;"
rm -f /tmp/restore_drill.dump
```

---

## 5. Recovery Objectives (RPO & RTO)

| Metric | Target (Controlled Pilot) | Target (Full Production) |
|---|---|---|
| **Recovery Point Objective (RPO)** | 24 Hours (Daily snapshot) | 15 Minutes (WAL archiving) |
| **Recovery Time Objective (RTO)** | < 1 Hour | < 30 Minutes |
| **Integrity Verification Frequency** | Bi-weekly drill | Automated weekly test restore |
