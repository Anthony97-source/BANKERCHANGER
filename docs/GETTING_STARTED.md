# Getting Started with BANKERCHANGER

Complete contributor guide: get the full stack running on your local machine, run the tests, make changes, and submit a pull request.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#1-clone-the-repository)
3. [Environment Setup](#2-environment-setup)
4. [Run Locally with Docker](#3-run-locally-with-docker)
5. [Run Locally without Docker](#4-run-locally-without-docker)
6. [Database Migrations](#5-database-migrations)
7. [Deploy Contracts (Optional)](#6-deploy-contracts-optional)
8. [Run the Tests](#7-run-the-tests)
9. [Making Changes](#8-making-changes)
10. [Submitting a Pull Request](#9-submitting-a-pull-request)
11. [Troubleshooting](#troubleshooting)

## Prerequisites

Required:
- **Git**
- **Docker & Docker Compose** (v3.9+) — for the Docker workflow
- **Node.js 20+** and **npm** — for local development and tests

Optional (for contract development):
- **Rust** via [rustup](https://rustup.rs/)
- **Stellar CLI** via [Stellar documentation](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)

If you run without Docker you also need:
- **PostgreSQL 15+** (backend database)
- **Redis 7+** (backend cache)

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/bankerchanger.git
cd bankerchanger
```

Install dependencies for each package you plan to work on:

```bash
cd backend && npm install && cd ..
cd indexer && npm install && cd ..
cd frontend && npm install && cd ..
```

## 2. Environment Setup

Copy the example environment files and adjust them for your machine:

```bash
# Backend
cp backend/.env.example backend/.env

# Indexer
cp indexer/.env.example indexer/.env

# Frontend
cp frontend/.env.example frontend/.env
```

The backend validates its environment at startup (see `backend/src/config/env.ts`). The most important variables are:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://bankerchanger:bankerchanger@localhost:5432/bankerchanger`. Must match `backend/drizzle.config.ts`. |
| `REDIS_URL` | Redis connection string, e.g. `redis://localhost:6379`. |
| `STELLAR_RPC_URL` | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`). |
| `HORIZON_URL` | Horizon endpoint (e.g. `https://horizon-testnet.stellar.org`). |
| `STELLAR_NETWORK` | `testnet` or `mainnet`. |
| `FACTORY_CONTRACT_ADDRESS` | Deployed factory contract address. |
| `JWT_SECRET` / `ADMIN_JWT_SECRET` | Random secrets (at least 32 bytes). **Change in production.** |
| `ORACLE_PRIVATE_KEY` | Stellar secret key used by the oracle. |
| `PORT` | Backend HTTP port (default `3001`). |
| `NODE_ENV` | `development` / `production` / `test`. |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error`. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins, e.g. `http://localhost:3000`. |
| `EMAIL_PROVIDER`, `SMTP_*` | Optional email configuration. |

See the [Environment Variables](#environment-variables) section for full examples.

## 3. Run Locally with Docker

The fastest way to get everything running.

### 3.1 Start All Services

```bash
docker compose up
```

Or run in detached mode:

```bash
docker compose up -d
```

### 3.2 Verify All Services Are Running

```bash
docker compose ps
```

You should see:
- ✅ `postgres` - Database (port 5432)
- ✅ `redis` - Cache (port 6379)
- ✅ `indexer` - Stellar event indexer (port 3002)
- ✅ `backend` - REST API (port 3001)
- ✅ `frontend` - Web app (port 3000)

### 3.3 Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Indexer API**: http://localhost:3002
- **API Docs (if enabled)**: http://localhost:3001/docs

### 3.4 Check Service Health

```bash
# Backend health check
curl http://localhost:3001/health

# Expected response:
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "dbPool": {
    "totalCount": 10,
    "idleCount": 10,
    "waitingCount": 0
  }
}
```

## 4. Run Locally without Docker

Use this workflow for hot reload and debugging. You can either start the infrastructure (PostgreSQL, Redis) with Docker and run the apps on the host, or install PostgreSQL and Redis natively.

### 4.1 Start Infrastructure

With Docker (recommended):

```bash
docker compose up postgres redis
```

Without Docker, make sure PostgreSQL and Redis are running locally and reachable at the URLs in `backend/.env` (`DATABASE_URL`, `REDIS_URL`).

### 4.2 Run Backend Locally

```bash
cd backend
npm install
npm run dev
```

Backend will run on http://localhost:3001 with hot reload.

### 4.3 Run Indexer Locally

```bash
cd indexer
npm install
npm run dev
```

Indexer will run on http://localhost:3002 with hot reload.

### 4.4 Run Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on http://localhost:3000 with hot reload.

## Environment Variables

### Backend (.env)

Key variables you need to configure:

```env
# Database
DATABASE_URL=postgresql://bankerchanger:bankerchanger@localhost:5432/bankerchanger

# Redis
REDIS_URL=redis://localhost:6379

# Stellar
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK=testnet

# Contracts
FACTORY_CONTRACT_ADDRESS=<deployed-contract-address>

# Secrets (CHANGE IN PRODUCTION!)
JWT_SECRET=replace-this-with-a-random-secret-at-least-32-bytes
ADMIN_JWT_SECRET=change-me-in-production
ORACLE_PRIVATE_KEY=<your-stellar-secret-key>

# API
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# CORS (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Email (optional)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your-password
SMTP_FROM=no-reply@bankerchanger.app
```

### Indexer (.env)

```env
# Port
PORT=3002

# Stellar Network
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK=testnet

# Contract
FACTORY_CONTRACT_ADDRESS=<deployed-contract-address>

# Database (SQLite for indexer)
DB_PATH=./data/indexer.db
```

### Frontend (.env)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

## Docker Compose Commands

### Start All Services
```bash
docker compose up
```

### Start Specific Services
```bash
docker compose up postgres redis
docker compose up backend frontend
docker compose up indexer
```

### Stop All Services
```bash
docker compose down
```

### Stop and Remove Volumes (Clean Slate)
```bash
docker compose down -v
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f indexer
```

### Rebuild Services (After Code Changes)
```bash
docker compose up --build
```

### Rebuild Specific Service
```bash
docker compose up --build backend
```

## 5. Database Migrations

The backend schema lives in `backend/db/schema.sql`. Apply it with the migration script:

```bash
# Inside Docker container
docker compose exec backend npm run migrate

# Or locally
cd backend
npm run migrate
```

To verify that the schema and migrations are consistent, run the migration check:

```bash
cd backend
node scripts/migration-check.js
```

### Access PostgreSQL

```bash
# Via Docker
docker compose exec postgres psql -U bankerchanger -d bankerchanger

# Or locally
psql -h localhost -U bankerchanger -d bankerchanger
```

### Reset Database

```bash
docker compose down -v
docker compose up postgres -d
# Wait a few seconds for postgres to start
docker compose exec backend npm run migrate
```

## Troubleshooting

### Services Won't Start

**Check logs:**
```bash
docker compose logs backend
docker compose logs indexer
```

**Common issues:**
- `.env` files missing or misconfigured
- Port conflicts (3000, 3001, 3002 already in use)
- Docker out of disk space

### Backend Can't Connect to Database

**Check postgres is healthy:**
```bash
docker compose ps postgres
```

**Verify database credentials:**
```bash
docker compose exec postgres psql -U bankerchanger -d bankerchanger -c '\l'
```

### Port Already in Use

If ports 3000-3002 are taken, edit `docker-compose.yml`:

```yaml
services:
  backend:
    ports:
      - '3011:3001'  # External:Internal
```

### Rebuild After Package Changes

If you modify `package.json` or `package-lock.json`:

```bash
docker compose down
docker compose up --build
```

## 7. Run the Tests

Each package has its own test setup. Run the tests for the package you changed before opening a PR.

### 7.1 Backend Tests (Jest)

Configured in `backend/jest.config.json`.

```bash
# Inside Docker
docker compose exec backend npm test

# Or locally
cd backend
npm test
```

Integration tests:

```bash
cd backend
npm run test:integration
```

### 7.2 Indexer Tests (Jest)

Configured in `indexer/jest.config.js`.

```bash
# Inside Docker
docker compose exec indexer npm test

# Or locally
cd indexer
npm test
```

### 7.3 Frontend Tests (Jest + Playwright)

Unit tests are configured in `frontend/jest.config.js`; end-to-end tests in `frontend/playwright.config.ts`.

```bash
cd frontend

# Unit tests
npm test

# End-to-end tests (Playwright)
npx playwright install   # first time only
npm run test:e2e
```

### 7.4 Contract Tests (Rust)

```bash
cd contracts
cargo test --workspace
```

## 6. Deploy Contracts (Optional)

If you need to deploy smart contracts:

### 6.1 Install Dependencies

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Stellar CLI
cargo install stellar-cli
```

### 6.2 Build Contracts

```bash
cd contracts
cargo build --workspace
```

### 6.3 Deploy to Testnet

```bash
export ADMIN_SECRET_KEY=S...  # Your Stellar secret key
./contracts/scripts/deploy.sh testnet
```

### 6.4 Update Environment Files

After deployment, update `FACTORY_CONTRACT_ADDRESS` in:
- `backend/.env`
- `indexer/.env`

## Production Deployment

See [docs/DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guide.

## Architecture Overview

```
┌─────────────┐
│  Frontend   │ :3000
│  (Next.js)  │
└──────┬──────┘
       │
       │ HTTP
       ▼
┌─────────────┐     ┌──────────┐
│   Backend   │────▶│ Postgres │ :5432
│   (API)     │ :3001│          │
└──────┬──────┘     └──────────┘
       │
       │ Cache
       ▼
┌─────────────┐
│    Redis    │ :6379
└─────────────┘

┌─────────────┐     ┌──────────────────┐
│   Indexer   │────▶│ Stellar Horizon  │
│  (Events)   │ :3002│   (Testnet)      │
└──────┬──────┘     └──────────────────┘
       │
       │ Events
       ▼
┌─────────────┐
│  Postgres   │
└─────────────┘
```

## 8. Making Changes

1. **Create a branch** off `main`:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/short-description
   ```

   Use a prefix that matches the change: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.

2. **Make your changes** and keep them focused. Update docs and tests alongside code.

3. **Run the relevant tests** (see [Run the Tests](#7-run-the-tests)) and make sure they pass.

4. **Commit your changes.** We follow [Conventional Commits](https://www.conventionalcommits.org/):

   ```bash
   git add <files>
   git commit -m "feat(backend): add rate limit header"
   ```

   Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `ci`.
   Keep the subject in the imperative mood, under ~72 characters, and use the body for details.

5. **Keep your branch up to date**:

   ```bash
   git fetch origin
   git rebase origin/main
   ```

## 9. Submitting a Pull Request

1. **Push your branch**:

   ```bash
   git push -u origin feat/short-description
   ```

2. **Open a PR** against `main` on GitHub.

3. **Fill in the PR description**:
   - What the change does and why
   - How it was tested (commands you ran)
   - Screenshots for UI changes
   - Linked issue (e.g. `Closes #123`)

4. **Ensure CI passes** — tests, linting, and builds must be green.

5. **Respond to review feedback** by pushing additional commits (or amending, if asked).

6. Once approved and merged, delete your branch.

## Next Steps

1. ✅ Get the stack running with `docker compose up`
2. 📖 Read [API Documentation](./api-rate-limits.md)
3. 🏗️ Review [Architecture Overview](./architecture.md)
4. 🚀 Deploy contracts (see [Deploy Contracts](#6-deploy-contracts-optional))
5. 🧪 Run tests to verify everything works
6. 🔧 Start building!

## Additional Documentation

- [API Rate Limits](./api-rate-limits.md)
- [Architecture Overview](./architecture.md)
- [Observability Guide](./observability.md)
- [Operational Runbook](./runbook.md)
- [Contributing Guidelines](./contributing.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Email Verification Feature](./QUICK_START.md)

## Support

- **Issues**: https://github.com/your-org/bankerchanger/issues
- **Discussions**: https://github.com/your-org/bankerchanger/discussions

## Summary

✅ **One command to start**: `docker compose up`
✅ **Full stack ready**: Postgres, Redis, Indexer, Backend, Frontend
✅ **Development mode**: Run services locally with hot reload
✅ **Tests covered**: Jest (backend, indexer, frontend) and Playwright (frontend e2e)
✅ **Contributor workflow**: Branch, commit, and PR conventions documented
✅ **Production ready**: Docker-based deployment
✅ **Well documented**: Comprehensive guides and troubleshooting
