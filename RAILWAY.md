# Deploying Arena-SaaS on Railway

Use **two services** (plus managed Postgres). The API is the Node server in `server/`; the web app is the static Vite build.

## 1. PostgreSQL

1. Create a **PostgreSQL** plugin on Railway (or Neon).
2. Copy **`DATABASE_URL`** — you will attach it to the API service.

## 2. API service (`server/`)

1. **New project → Empty service** → connect this repo.
2. In service **Settings → Root Directory**, set **`server`**.
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. **Variables:**

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | *(from Railway Postgres)* |
| `JWT_SECRET` | Long random string (required in production) |
| `PORT` | Railway sets automatically |
| `FRONTEND_URL` | Your web app URL, e.g. `https://your-app.up.railway.app` |
| `SEED_DEV_USER` | `true` once to create dev admin, then remove |
| `DEV_ADMIN_EMAIL` | Optional; default `admin@arena.local` |
| `DEV_ADMIN_PASSWORD` | Optional; default `admin123` |

6. **Run migrations** (one-time). From your machine (with `DATABASE_URL` in env):

```bash
cd server && npm install && DATABASE_URL="postgresql://..." node src/migrate.js
```

Or add a **Railway one-off command** / local script that runs `node src/migrate.js` against production `DATABASE_URL`.

7. Note the **public URL** of the API (e.g. `https://arena-api.up.railway.app`).

## 3. Web service (static Vite build)

1. **New service** from the same repo, **root directory** = repository root (or a dedicated static branch).
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npx serve -s dist -l $PORT`  
   - Add devDependency `serve` if you prefer, or use Railway’s **static** template / Nixpacks static file server.
4. **Variables:**

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | Full API origin, **no trailing slash**, e.g. `https://arena-api.up.railway.app` |

Rebuild after changing `VITE_*` vars (they are compile-time).

**Alternative:** Host `dist/` on **Cloudflare Pages** / **Netlify** and set `VITE_API_URL` in the CI build env to your Railway API URL.

## 4. CORS

The API allows origins from `FRONTEND_URL` and localhost patterns. Set `FRONTEND_URL` to your deployed web origin so browsers can call the API.

## 5. Local “full stack”

```bash
docker compose up -d
cd server && npm install && DATABASE_URL=postgresql://arena:arena_dev@localhost:5433/arena_dev node src/migrate.js
# optional: SEED_DEV_USER=true in server/.env
npm run dev:full   # from repo root — Vite + API
```

Use `.env.local` with `VITE_DEV_PORTAL=true` so `localhost` loads the organizer shell; sign in at `/login` (seed admin or self-register).
