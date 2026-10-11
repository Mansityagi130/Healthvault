# HealthVault — Version 1.0 (`v1.0.0`) Documentation

## 1. Overview and Purpose

**HealthVault Version 1.0 (`v1.0.0`)** represents the baseline architecture and initial release of HealthVault. Developed between August and September 2026, Version 1 established the end-to-end multi-tier web application architecture, data modeling, role-based access control, and containerization for a patient health-record platform.

Git Tag: [`v1.0.0`](https://github.com/Mansityagi130/Healthvault/releases/tag/v1.0.0)  
Release Title: **HealthVault Version 1.0**

---

## 2. Technology Stack (Version 1)

- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS, Lucide React icons.
- **Backend**: Node.js, Express, TypeScript, Zod schema validation, Helmet, CORS, Rate Limiter.
- **Database & ORM**: PostgreSQL 16, Prisma ORM 5.
- **Caching & Queues**: Redis 7, BullMQ.
- **Reverse Proxy**: Nginx Alpine.
- **Testing**: Vitest, Supertest.
- **DevOps**: Docker & Docker Compose.

---

## 3. Implemented & Verified Capabilities in Version 1

1. **Authentication & Identity**:
   - Patient registration and login with email and bcrypt password hashing.
   - Initial OTP verification foundation.
   - JWT authentication (access and refresh tokens stored via HttpOnly cookies).
   - Multi-role authorization models (Patient, Provider, Hospital Admin, Lab Technician).

2. **Patient Dashboard & Records**:
   - Basic clinical record creation (diagnoses, symptoms, medications, vital signs, allergies).
   - Document upload attachments saved directly to disk.
   - Basic record viewing and filtering by category.

3. **Provider & Hospital Encounters (Prototypes)**:
   - Initial doctor encounter recording workflow.
   - Lab test order and result attachment models.
   - Initial doctor-patient sharing via registered provider selection (`Dr. Alice Smith`, `Dr. Bob Jones`).

4. **Infrastructure & Containerization**:
   - Multi-container Docker Compose configuration (`healthvault-frontend`, `healthvault-backend`, `healthvault-db`, `healthvault-redis`, `healthvault-nginx`).
   - Centralized environment configuration.

---

## 4. Known Limitations in Version 1

1. **No Antivirus / Malware Protection**: Uploaded patient medical documents were saved directly to the local filesystem without automated virus scanning.
2. **Restricted QR Sharing**: Sharing was limited to selecting registered clinical providers. Patients could not create instant, self-service QR codes or direct shareable links for outside doctors or family members.
3. **No Recipient Access Authentication**: No dedicated recipient viewer for external smartphones scanning a shared record link.
4. **No Emergency Profile**: Patients had no emergency card (blood group, allergies, emergency contacts) accessible to first responders.
5. **No PDF Summary Export**: Patients could not export or print a comprehensive health summary.
6. **Development Secrets Permitted in Production**: Default secrets and fallback strings were permitted during startup.
7. **Email Delivery**: Dependent on unverified stubs or mock inboxes rather than configured SMTP.

---

## 5. Setup & Running Version 1

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 & Redis 7

### Running via Docker
```bash
# Clone the repository
git clone https://github.com/Mansityagi130/Healthvault.git
cd Healthvault

# Checkout Version 1
git checkout v1.0.0

# Start services
docker compose up -d --build
```

### Local Development
```bash
# Backend
cd backend
npm install
npx prisma migrate deploy
npm run dev

# Frontend (in a separate terminal)
cd ../frontend
npm install
npm run dev
```
Access the application at `http://localhost:3000` (or `http://localhost` if using Nginx).
