# Deployment Changes — Vercel + Cloud PostgreSQL

## Overview
All changes made to support deploying the Construction Tracker on Vercel (frontend + backend serverless) with a cloud-hosted PostgreSQL database.

---

## Files Modified

### 1. `frontend/.env`
- **Changed**: `REACT_APP_API_URL` from `http://localhost:5001/api` → `https://ushnik-construction-pr-git-342465-yasarapusoni22-6396s-projects.vercel.app/api`
- **Why**: Deployed frontend must call the deployed backend, not localhost

### 2. `frontend/.env.example`
- **Changed**: Added comments showing both local dev and Vercel production URL formats
- **Why**: Template for other developers

### 3. `frontend/package.json`
- **Removed**: `"proxy": "http://localhost:5001"`
- **Why**: CRA proxy only works in `npm start` (local dev). It breaks Vercel builds and is not used in production

### 4. `frontend/src/contexts/SocketContext.tsx`
- **Changed**: Socket.io connection URL was hardcoded to `http://localhost:5001`
- **Now**: Derives the socket URL dynamically from `REACT_APP_API_URL` (strips `/api` suffix)
- **Before**: `io(process.env.REACT_APP_API_URL || 'http://localhost:5001', {...})`
- **After**: `const socketUrl = apiUrl.replace(/\/api\/?$/, ''); io(socketUrl, {...})`

### 5. `backend/server.js` — CORS (2 places: Socket.io + Express middleware)
- **Changed**: CORS `origin` from single string → array parsed from comma-separated `FRONTEND_URL`
- **Before**: `origin: process.env.FRONTEND_URL || 'http://localhost:3000'`
- **After**: `allowedOrigins = FRONTEND_URL.split(',').map(u => u.trim())` used in both Socket.io and `app.use(cors(...))`
- **Why**: Need to allow both Vercel frontend URLs + localhost

### 6. `backend/server.js` — Vercel Serverless Mode
- **Added**: `isVercel` check (`process.env.VERCEL === '1'`)
- **Vercel mode**: Lazy DB init middleware (no `server.listen()`, no `setInterval` health checks — serverless doesn't support them)
- **Local mode**: Unchanged — still does `sequelize.authenticate()` → `server.listen(PORT)`
- **Changed export**: `module.exports = app` (Vercel needs Express app as default export)

### 7. `backend/config/database.js`
- **Added**: `DATABASE_URL` connection string support with SSL
- **If `DATABASE_URL` is set**: Uses it directly with `ssl: { require: true, rejectUnauthorized: false }` and reduced pool (max: 10) for cloud DB connection limits
- **If `DATABASE_URL` is NOT set**: Falls back to existing `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` config (local dev unchanged)

### 8. `backend/.env`
- **Added**: Commented `DATABASE_URL` placeholder for cloud PostgreSQL
- **Changed**: `FRONTEND_URL` from `http://localhost:3000` → comma-separated list of all 3 origins:
  - `https://ushnik-construction-project-tracker.vercel.app`
  - `https://ushnik-construction-pr-git-342465-yasarapusoni22-6396s-projects.vercel.app`
  - `http://localhost:3000`

### 9. `backend/.env.example`
- **Added**: `DATABASE_URL` option with format example
- **Updated**: `FRONTEND_URL` showing comma-separated format

### 10. `backend/vercel.json` (NEW FILE)
- **Created**: Vercel deployment config
- Routes all requests to `server.js` via `@vercel/node` runtime
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

---

## What Was NOT Changed
- No ports changed (backend still `5001` locally, frontend still `3000`)
- No routes, models, or business logic changed
- No frontend components changed (except SocketContext URL)
- No database schema changes
- Local development workflow is completely unchanged

---

## Vercel Environment Variables Required

### Backend Project (Vercel Dashboard → Settings → Environment Variables)
| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=require` (from Neon/Supabase) |
| `JWT_SECRET` | A strong random secret key |
| `FRONTEND_URL` | `https://ushnik-construction-project-tracker.vercel.app,https://ushnik-construction-pr-git-342465-yasarapusoni22-6396s-projects.vercel.app` |
| `NODE_ENV` | `production` |

### Frontend Project (Vercel Dashboard → Settings → Environment Variables)
| Variable | Value |
|----------|-------|
| `REACT_APP_API_URL` | `https://your-backend-vercel-url.vercel.app/api` |

---

## Database Hosting Recommendation

| Provider | Free Tier | Recommended |
|----------|-----------|-------------|
| **Neon** (neon.tech) | 0.5 GB, 190 hrs/month | ⭐ Best for Vercel |
| **Supabase** | 500 MB, 2 projects | Great UI |
| **Railway** | $5 free credit | Easy setup |

After creating the cloud DB, seed it with:
```bash
DATABASE_URL="your-connection-string" node backend/scripts/seedDatabase.js
```

Connect PopSQL to the same `DATABASE_URL` to browse/query data.

---

## Important Note
> Socket.io (real-time updates) does NOT work on Vercel serverless. The app will still function via normal HTTP requests — sheets load, cells save, etc. Real-time push notifications just won't fire. If real-time is needed later, deploy the backend on Railway or Render instead.
