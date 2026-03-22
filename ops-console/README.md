# TriggerMap Ops Console

Internal-only operations dashboard for monitoring, debugging, and controlling the TriggerMap backend.

**This is not part of the user-facing product.** It is a founder control console.

## Architecture

- **Separate Next.js app** — deploys independently from the main product
- **Direct Redis reads** — queries Upstash Redis for metrics (same instance as backend)
- **Backend internal API** — triggers jobs and cache operations via authenticated endpoints on the main backend
- **JWT session auth** — protected by hashed admin password

## Setup

### 1. Install dependencies

```bash
cd ops-console
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

**Required variables:**

| Variable | Description |
|---|---|
| `OPS_ADMIN_PASSWORD_HASH` | bcrypt hash of admin password |
| `OPS_JWT_SECRET` | Random secret for session JWT signing |
| `UPSTASH_REDIS_REST_URL` | Same Upstash URL as main backend |
| `UPSTASH_REDIS_REST_TOKEN` | Same Upstash token as main backend |
| `BACKEND_URL` | Main backend URL (e.g. `https://your-backend.vercel.app`) |
| `BACKEND_INTERNAL_KEY` | Shared secret matching `INTERNAL_API_KEY` on backend |

**Generate a password hash:**

```bash
node -e "import('bcryptjs').then(b => b.default.hash('your-password', 12).then(console.log))"
```

**Generate a JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure backend internal key

Add `INTERNAL_API_KEY` to the main backend's environment variables. This must match `BACKEND_INTERNAL_KEY` in the ops console.

### 4. Run locally

```bash
npm run dev
```

Opens at `http://localhost:3100`

## Deployment

### Vercel (recommended)

1. Create a new Vercel project pointing to the `ops-console/` directory
2. Set root directory to `ops-console`
3. Add all environment variables from `.env.example`
4. Deploy

The `vercel.json` includes `noindex` headers to prevent search engine indexing.

### Security notes

- The console is protected by admin password authentication
- All API routes require a valid session JWT
- Control actions (jobs, cache) go through the backend's internal API, protected by `X-Internal-Key` header
- The internal API key is verified with constant-time comparison
- Session cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` in production
- All pages include `X-Frame-Options: DENY` and `X-Robots-Tag: noindex`

## Running Locally

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```
2. Fill in values in `.env.local` (same as Vercel env vars — get from `npx vercel env pull`).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3100`

**Dev-mode fallback:** If `OPS_ADMIN_PASSWORD_HASH` is not set, the password `admin123` works automatically in development. A warning is logged on startup. This fallback is disabled in production.

## Pages

| Page | Path | Purpose |
|---|---|---|
| Dashboard | `/` | System overview — health, core metrics, 7-day trend, anomalies |
| Control Panel | `/control` | Trigger backend jobs, clear caches (with confirmation) |
| Diagnostics | `/diagnostics` | System health, anomalies, data quality, activity feed |
| KPIs & Signals | `/intelligence` | DAU/WAU, retention, engagement cohorts, product health assessment |
| Users | `/users` | User registry — auth status, subscription, activity |
| Insights | `/insights` | Insight pipeline — rule/LLM coverage, model usage, recent generations |

## Backend Internal Endpoints

Added to the main backend under `/api/internal/`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/internal/control/run-job` | POST | Trigger a named job (weekly reports, LLM insights, free pass) |
| `/api/internal/control/clear-cache` | POST | Clear cached reports/insights/free passes |

All internal endpoints require `X-Internal-Key` header matching `INTERNAL_API_KEY`.

## Extending

To add new modules:

1. **New metrics** — Add API route under `pages/api/metrics/` or `pages/api/diagnostics/`
2. **New controls** — Add to `ALLOWED_JOBS` or `ALLOWED_CACHES` in the execute endpoint, add backend handler
3. **New pages** — Create page under `pages/`, add nav entry in `components/Layout.js`
4. **New components** — Add to `components/`

The codebase is intentionally flat and direct. Each page fetches its own data from dedicated API routes.
