# HealthVault — Setup and Development Guide

## 1. Prerequisites

Before setting up HealthVault locally or on a server, verify your system meets the following requirements:

- **Operating System**: Linux (Ubuntu 22.04+), macOS (13+), or Windows 10/11 with WSL2 / PowerShell.
- **Docker Engine**: Version 24.0.0 or higher.
- **Docker Compose**: Version 2.20.0 or higher.
- **Node.js** (for local host development): Node.js 20 LTS (`v20.x`).
- **RAM**: Minimum 4 GB of available system memory (Docker should have at least 2.5 GB allocated to accommodate the ClamAV virus signature database).

---

## 2. Quickstart with Docker Compose (Recommended)

Docker Compose orchestrates the full multi-tier stack, including the database, caching layer, antivirus daemon, API, frontend, and reverse proxy.

### Step 1: Clone the Repository
```bash
git clone https://github.com/Mansityagi130/Healthvault.git
cd Healthvault
```

### Step 2: Configure Environment Variables
Create your local environment file from the provided template:
```bash
cp .env.example .env
```
Open `.env` and verify or set appropriate keys for local development.

### Step 3: Build and Launch Containers
```bash
docker compose up -d --build
```

### Step 4: Verify Container Health
```bash
docker compose ps
```
All core containers should report `Up` and `healthy`:
```text
NAME                  IMAGE                  STATUS
healthvault-nginx     nginx:alpine           Up (healthy)
healthvault-frontend  healthvault-frontend   Up (healthy)
healthvault-backend   healthvault-backend    Up (healthy)
healthvault-db        postgres:16-alpine     Up (healthy)
healthvault-redis     redis:7-alpine         Up (healthy)
healthvault-clamav    clamav/clamav:latest   Up (healthy)
```

Access the application in your browser:
- **Web Application**: [http://localhost](http://localhost)
- **API Health Check**: [http://localhost/api/health](http://localhost/api/health)

---

## 3. Local Host Development (Non-Docker)

If you prefer developing locally with live reload on host processes:

### Step 1: Run Infrastructure Services
Run only PostgreSQL, Redis, and ClamAV in Docker:
```bash
docker compose up -d db redis clamav
```

### Step 2: Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# (Optional) Seed initial test accounts
npm run seed

# Start API in development mode
npm run dev
```
The API server will listen on `http://localhost:5000`.

### Step 3: Frontend Setup
In a new terminal window:
```bash
cd frontend

# Install dependencies
npm install

# Launch Next.js development server
npm run dev
```
The frontend will be accessible at `http://localhost:3000`.

---

## 4. Database Management & Migrations

HealthVault uses Prisma ORM with PostgreSQL.

### Viewing the Database with Prisma Studio
```bash
cd backend
npx prisma studio --port 5555
```
Open `http://localhost:5555` to browse models and rows.

### Applying Migrations
```bash
cd backend
npx prisma migrate deploy
```

### Creating a New Migration
```bash
cd backend
npx prisma migrate dev --name <migration_description>
```

---

## 5. Troubleshooting & FAQ

### Issue: ClamAV container is unhealthy or taking too long to start
- **Cause**: ClamAV downloads and indexes the official virus definition database on initial boot, which requires 1.5–2 GB RAM and several minutes on slower connections.
- **Solution**: Check logs via `docker compose logs -f clamav`. Ensure Docker Desktop has at least 3–4 GB memory allocated. The backend will wait for ClamAV to become healthy before accepting document uploads.

### Issue: "Missing or weak secrets" error on backend startup
- **Cause**: In production (`NODE_ENV=production`), the application refuses to start if `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, or `MFA_ENCRYPTION_KEY` are shorter than 32 characters or contain placeholder values.
- **Solution**: Set strong, random 32+ character strings in `.env`:
  ```bash
  # Generate a 32-character random string:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### Issue: Next.js frontend shows stale cached styles or views
- **Cause**: Next.js client-side bundles are heavily cached by browsers.
- **Solution**: Perform a hard refresh using `Ctrl + F5` (Windows/Linux) or `Cmd + Shift + R` (macOS).
