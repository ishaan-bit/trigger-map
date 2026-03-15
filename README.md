# TriggerMap

TriggerMap is a production-oriented monorepo with an Expo mobile app and a Next.js API backend backed by Redis.

## Stack

- Mobile: Expo + React Native
- Backend: Next.js pages API routes
- Database: Upstash Redis via REST, following the BNM Holi pattern
- Auth: Email/password plus Google ID token login with signed JWT sessions, following the Vouch approach to hashing and provider handling
- Analytics: PostHog
- Crash monitoring: Sentry
- Deployment: Vercel for backend, EAS for Android App Bundle builds

## Workspace

- mobile: Expo application
- backend: Next.js API routes and legal pages
- shared: shared constants and shape documentation

## Commands

- npm install
- npm run dev:backend
- npm run dev:mobile
- npm run build:backend
- npm run build:mobile

## Environment

Copy .env.example into backend/.env.local and mobile/.env as needed. The backend requires Upstash Redis, JWT, Google OAuth, APP_BASE_URL, optional Google Play service account credentials, PostHog, and Sentry.

## Backend Wiring & Environment Configuration

All frontend clients call the deployed backend via environment variables. No part of the frontend uses localhost in production.

### Deployed URLs

| Service | URL |
|---------|-----|
| Backend API | https://backend-five-nu-92.vercel.app |
| Web App | https://web-ashy-kappa-14.vercel.app |

### Web (`web/`)

Set `NEXT_PUBLIC_API_URL` in `web/.env.local` for local dev:

```
NEXT_PUBLIC_API_URL=https://backend-five-nu-92.vercel.app
```

For Vercel production, the env var is set via `vercel env add`. The web API client (`web/lib/api.js`) reads `process.env.NEXT_PUBLIC_API_URL` at build time. Falls back to `http://localhost:3000` only when the variable is unset (local dev without env file).

Restart the dev server after changing `.env.local`.

### Mobile (`mobile/`)

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` for local Expo dev:

```
EXPO_PUBLIC_API_URL=https://backend-five-nu-92.vercel.app
```

For EAS builds, the URL is baked in via `eas.json` build profile `env` blocks (both `preview` and `production` profiles). The mobile API client (`mobile/services/api.js`) reads `process.env.EXPO_PUBLIC_API_URL` at build time.

### Switching between localhost and deployed backend

To develop against a local backend, set the URL to `http://localhost:3000` (or `http://10.0.2.2:3000` for Android emulator). To use the deployed backend, set it to `https://backend-five-nu-92.vercel.app`.

### Health check

Verify the backend is reachable: `GET /api/health` returns `{"status":"ok",...}`.

## Deployment

- Backend: vercel deploy from backend/
- Mobile: eas build -p android --profile production from mobile/
