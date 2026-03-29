# Arena-SaaS (multi-tenant esports platform)

**React + Vite** frontend and a **local Node/Express API** in **`server/`** backed by **PostgreSQL**. The UI uses `src/api/arenaClient.js` (exported as `maxikay` / `arena`), mirroring the legacy SDK shape so pages keep working.

## Documentation

| Document | Purpose |
|----------|---------|
| [`MASTER_IMPLEMENTATION_DIRECTIVE.md`](./MASTER_IMPLEMENTATION_DIRECTIVE.md) | Full architecture, RLS, payments, wallet, UI spec |
| [`CO_DEVELOPER_GUIDE.md`](./CO_DEVELOPER_GUIDE.md) | Onboarding summary for co-developers |
| [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) | What exists in **this** repo vs the master spec |
| [`RAILWAY.md`](./RAILWAY.md) | Production deploy on Railway (API + static web) |

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **Docker Desktop** (recommended for local Postgres)

## Full local stack (API + web)

```bash
git clone <your-repo-url> arena-saas && cd arena-saas
docker compose up -d
cd server && npm install && cp .env.example .env
# Edit server/.env — set DATABASE_URL (matches docker-compose) and optional SEED_DEV_USER=true
DATABASE_URL=postgresql://arena:arena_dev@localhost:5433/arena_dev node src/migrate.js
cd ..
npm install
cp .env.example .env.local
```

Ensure **`.env.local`** has `VITE_DEV_PORTAL=true` (default in `.env.example`) so localhost opens the **organizer app** (not the marketing shell).

From the **repo root**:

```bash
npm run dev:full
```

- **Web:** http://localhost:5173 (proxies `/api` → API)
- **API:** http://localhost:3001

Sign in at **http://localhost:5173/login**. If you used `SEED_DEV_USER=true` in `server/.env`, try **`admin@arena.local` / `admin123`** (then remove `SEED_DEV_USER`).

### Web only (API already running elsewhere)

```bash
npm install && cp .env.example .env.local
# Set VITE_API_URL=https://your-api-host  if not using the proxy
npm run dev
```

## Local infrastructure (Postgres + Redis)

Matches the **master directive** stack for when you add NestJS workers, RLS-backed API, or Socket.io:

```bash
npm run db:up
```

- **Postgres:** `localhost:5433` → container `5432` — user `arena`, password `arena_dev`, database `arena_dev`
- **Redis:** `localhost:6379`

Load the reference schema (optional):

```bash
# Requires psql (PostgreSQL client)
psql "postgresql://arena:arena_dev@localhost:5433/arena_dev" -f src/db/schema.sql
```

Stop services:

```bash
npm run db:down
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server (expects API on proxy or `VITE_API_URL`) |
| `npm run dev:api` | Express API only (`server/`) |
| `npm run dev:full` | Vite + API together |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`jsconfig`) |
| `npm run db:up` | Start Postgres + Redis (Docker) |
| `npm run db:down` | Stop Docker services |

## Production

See **[RAILWAY.md](./RAILWAY.md)** for API + static frontend on Railway. Set **`VITE_API_URL`** at build time to your public API URL.

---

**Project codename:** Arena-SaaS · **Spec:** `MASTER_IMPLEMENTATION_DIRECTIVE.md`
