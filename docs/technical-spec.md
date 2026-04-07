# TriggerMap Technical Specification

## 1. Document Purpose

This document defines the current-state technical architecture for TriggerMap and establishes the implementation contract for the mobile app, backend API, web client, shared package, analytics, reporting pipeline, and operational model.

It is intended for:

- Engineers onboarding into the codebase
- Product and design stakeholders who need implementation-aware constraints
- QA and release owners validating end-to-end behavior
- Future contributors extending reporting, subscriptions, notifications, or web support

## 2. Product Summary

TriggerMap is a lightweight emotional pattern tracking product built around fast event capture. A user logs a trigger, selects an emotion, optionally adds context, and receives:

- a searchable chronological timeline of moments
- lightweight immediate feedback after repeated trigger-emotion patterns
- a weekly report that aggregates the last seven days of activity
- optional authenticated continuity across devices and sessions
- premium subscription hooks for deeper paid experiences

The current implementation prioritizes low-friction logging, anonymous-first use, and Redis-backed aggregation that can support both real-time and scheduled reporting.

## 3. System Scope

### In Scope

- Expo/React Native mobile application
- Next.js backend used primarily as an API service
- Lightweight Next.js web client / PWA for anonymous access
- Shared constants and shape definitions used across packages
- Upstash Redis persistence and derived aggregate storage
- Email/password login and Google ID token login
- JWT-backed session validation
- Weekly report generation and optional local AI summary generation
- Android subscription verification through Google Play Developer API
- PostHog analytics and Sentry crash/error monitoring

### Out of Scope

- Multi-user collaboration
- clinician workflows or provider dashboards
- iOS subscription purchasing flows
- admin tooling
- historical analytics beyond the rolling windows already modeled in Redis
- personalization beyond current rule-based and batch AI insight generation

## 4. Monorepo Structure

| Workspace | Responsibility | Runtime |
| --- | --- | --- |
| `mobile/` | Primary end-user app | Expo / React Native |
| `backend/` | API routes, auth, storage, reporting, legal pages | Next.js on Node/Vercel |
| `web/` | Lightweight browser PWA for anonymous capture and reading | Next.js |
| `shared/` | Shared constants and typedefs | Local package |
| `docs/` | Product, compliance, and engineering documentation | Static markdown |

## 5. Architectural Principles

1. Anonymous-first logging
   Users can create meaningful data before authentication. Authentication upgrades continuity instead of blocking first use.
2. Derived-data over expensive queries
   The system writes aggregate counters as moments are created, reducing report generation cost.
3. Shared domain vocabulary
   Trigger and emotion labels are centralized in `shared/` to avoid drift between mobile, backend, and web.
4. Minimal backend surface area
   Most backend logic is exposed as a small set of API endpoints backed by composable services.
5. Operational simplicity
   Redis over REST, cron-based weekly generation, and Vercel deployment reduce infrastructure overhead.

## 6. High-Level Architecture

```mermaid
flowchart LR
    Mobile[Expo Mobile App] -->|HTTPS JSON| API[Next.js API Backend]
    Web[Next.js Web Client] -->|HTTPS JSON| API
    API --> Redis[(Upstash Redis REST)]
    API --> PostHog[(PostHog)]
    API --> Sentry[(Sentry)]
    Mobile --> PostHog
    Mobile --> SentryMobile[Sentry Mobile]
    Mobile --> Notifications[Expo Notifications]
    API --> GoogleAuth[Google ID Token Validation]
    API --> GooglePlay[Google Play Subscription Verification]
    Cron[Vercel Cron] --> API
    API --> Ollama[Local Ollama Model]
```

## 7. Runtime Components

### 7.1 Mobile App

The mobile app is the primary client. It uses Expo Router for navigation, a `SessionProvider` for application state, SecureStore/AsyncStorage for device persistence, and a small service layer for API, analytics, crash reporting, notifications, and subscriptions.

Primary responsibilities:

- bootstrap device identity and stored session
- handle onboarding and authentication
- capture trigger/emotion moments
- display timeline and weekly report
- manage reminders, export, and premium access

### 7.2 Backend API

The backend is a Next.js Pages Router application used as a JSON API. Each route is thin and delegates logic into `services/`. Redis is the source of truth for sessions, moments, aggregate counters, subscription state, and stored weekly AI insight payloads.

Primary responsibilities:

- validate input and rate limits
- authenticate signed JWT sessions
- persist moments and aggregates
- compute timeline and weekly reports
- verify subscriptions
- emit analytics and monitoring events

### 7.3 Web Client

The web client is a lean anonymous-first PWA surface that supports:

- moment logging
- timeline browsing
- weekly report browsing
- installable PWA behavior

It mirrors the core backend API contract and creates its own browser-local `deviceId`.

### 7.4 Shared Package

The shared package contains the canonical trigger set, emotion set, notification labels, and JSDoc typedefs used as the system’s lightweight schema contract.

## 8. Technology Stack

| Area | Technology |
| --- | --- |
| Mobile UI | Expo, React Native, Expo Router |
| Mobile storage | AsyncStorage, SecureStore |
| Backend | Next.js Pages API, Node.js |
| Web | Next.js |
| Shared code | Local workspace package |
| Persistence | Upstash Redis via REST |
| Auth | Email/password, Google ID tokens, JWT via `jose` |
| Validation | `zod` |
| Analytics | PostHog |
| Monitoring | Sentry |
| Charts | `react-native-chart-kit` |
| Payments | `react-native-iap`, Google Play Android Publisher API |
| AI insight generation | Ollama-compatible local model |
| Deployment | Vercel for backend, EAS for Android builds |

## 9. Data Model

### 9.1 Core Entity: TriggerMoment

```js
{
  id: string,
  ownerId: string,
  trigger: string,
  emotion: string,
  note: string,
  timestamp: string,
  isAnonymous: boolean
}
```

### 9.2 Weekly Aggregate Snapshot

Daily aggregate hashes store a denormalized snapshot keyed by owner and day:

- total count
- trigger counts
- emotion counts
- trigger-emotion pair counts
- time-of-day bucket counts

### 9.3 Weekly Insight Report

The weekly report is derived from the last seven aggregate snapshots and includes:

- top trigger
- top emotion
- top pair
- correlation map
- time-of-day activity distribution
- energy distribution
- weekly emotion trajectory
- volatility score and narrative label
- most stable day
- optional AI summary payload
- generated insight strings

### 9.4 User and Session Data

User records store:

- id
- email
- name
- provider
- createdAt
- password hash if email-authenticated
- googleSub if Google-authenticated

Session records store:

- sessionId
- userId
- createdAt
- expiresAt

### 9.5 Subscription Data

Subscription hashes store:

- status
- subscriptionId
- purchaseToken
- expiresAt
- updatedAt
- optional `stubbed` flag in non-configured environments

## 10. Redis Key Design

All keys are prefixed with `triggermap:`.

| Key Pattern | Purpose |
| --- | --- |
| `triggermap:user:{userId}` | User hash |
| `triggermap:userEmail:{email}` | Email to user lookup |
| `triggermap:userGoogle:{googleSub}` | Google subject lookup |
| `triggermap:session:{sessionId}` | Session hash |
| `triggermap:moments:{ownerId}` | Ordered list of raw moments |
| `triggermap:daily:{ownerId}:{yyyy-mm-dd}` | Daily aggregate hash |
| `triggermap:owners` | Set of owners with aggregate activity |
| `triggermap:weekly_report:{ownerId}` | Stored AI weekly insight payload |
| `triggermap:subscription:{userId}` | Subscription hash |
| `triggermap:ratelimit:{key}` | Request throttling buckets |
| `triggermap:dau:{yyyy-mm-dd}` | Daily active owner set |
| `triggermap:counter:{name}` | Simple numeric counters |
| `triggermap:health` | Healthcheck probe key |

## 11. Client Identity Model

### 11.1 Anonymous Identity

Anonymous usage is keyed by a persistent device identifier:

- mobile creates and persists a UUID using AsyncStorage + SecureStore
- web creates and persists a browser-local ID in localStorage

This allows logging, timeline access, export, and weekly report access without authentication.

### 11.2 Authenticated Identity

After login or registration, the backend creates a JWT session and migrates any moments from the anonymous `deviceId` owner to the authenticated `user.id` owner.

This preserves continuity while keeping the initial capture flow low-friction.

## 12. Authentication and Authorization

### 12.1 Supported Auth Methods

- Email/password registration and login
- Google login using a mobile Google ID token

### 12.2 Session Mechanics

- backend signs JWTs with `HS256`
- token subject is the `user.id`
- token includes `sid` for session lookup
- session hashes in Redis enforce server-side existence and expiry
- session lifetime is 30 days

### 12.3 Authenticated vs Anonymous Access

Authenticated endpoints:

- `GET /api/me`
- `POST /api/subscription/verify`

Dual-mode endpoints that accept either session token or `deviceId`:

- `POST /api/logMoment`
- `GET /api/timeline`
- `GET /api/weeklyReport`
- `GET /api/export`

## 13. API Surface

### 13.1 `POST /api/register`

Creates an email-auth user, issues a session, migrates anonymous moments, and tracks registration analytics.

Input:

```json
{
  "email": "user@example.com",
  "password": "min-8-chars",
  "name": "User Name",
  "deviceId": "optional-anonymous-device-id"
}
```

Success:

```json
{
  "ok": true,
  "data": {
    "token": "jwt",
    "user": {},
    "migratedMoments": 4
  }
}
```

### 13.2 `POST /api/login`

Authenticates an email/password user or Google user, creates a session, migrates anonymous moments, and returns the session payload.

### 13.3 `GET /api/me`

Validates session and returns user + subscription state.

### 13.4 `POST /api/logMoment`

Logs a moment for an authenticated user or anonymous device owner.

Validates:

- emotion required
- trigger optional but normalized
- note max 280 characters
- rate limit: 120 requests per 60 seconds per client IP

Persists:

- raw moment list item
- counter increment
- daily aggregate update
- DAU touch
- analytics event

Returns:

- stored moment
- optional pattern feedback
- optional smart reflection prompt
- pair count

### 13.5 `GET /api/timeline`

Returns reverse-chronological moments plus a grouped-by-day representation.

### 13.6 `GET /api/weeklyReport`

Modes:

- default: compute and return a report for the active owner
- `?mode=scheduled`: trigger the weekly batch generation loop for all known owners

### 13.7 `GET /api/export`

Returns a downloadable JSON document containing all moments for the active owner.

### 13.8 `POST /api/subscription/verify`

Validates an authenticated subscription purchase token and stores the resulting entitlement state.

### 13.9 `GET /api/health`

Performs a backend readiness check by validating Redis round-trip and reporting environment readiness booleans.

## 14. Input Normalization and Data Hygiene

- free-text notes are sanitized to remove control characters, collapse whitespace, trim, and cap at 280 characters
- invalid trigger values fall back to keyword detection from note text, otherwise `alone`
- invalid emotion values fall back to `neutral`
- timestamps are normalized to ISO format
- owner identity is enforced as either `user.id` or `deviceId`

## 15. Reporting and Pattern Engine

### 15.1 Real-Time Aggregate Maintenance

On every moment write, the system updates a day-specific aggregate hash. This avoids recomputing reports by scanning all raw moments for each report request.

Updated dimensions:

- total moments
- per-trigger frequency
- per-emotion frequency
- trigger-emotion pair frequency
- time-of-day bucket frequency

### 15.2 Weekly Report Computation

The report engine consumes the last seven daily aggregate snapshots and computes:

- top trigger and top emotion
- strongest trigger-emotion correlation
- time-of-day with highest activity
- emotion-energy distribution
- daily average emotion score trajectory
- variance-derived volatility score
- narrative volatility summary
- most stable day
- human-readable insight list

### 15.3 AI Summary Layer

The scheduled report job optionally asks a local Ollama model for:

- a concise summary
- a possible explanation
- a simple suggestion

The resulting payload is cached in Redis and merged into the read-time weekly report response.

### 15.4 Immediate Feedback Layer

After a moment is saved, the backend checks the seven-day count for the trigger-emotion pair. Based on thresholds, it returns:

- `patternFeedback` when a repeated pattern is detected
- `smartReflectionPrompt` for either rule-based exercise/calm insight or higher pair frequency follow-up reflection

## 16. Insight & Intelligence Architecture

The insight system has four generation layers. Each layer has different data requirements, latency characteristics, and failure modes. Understanding which layers are rule-based, which are LLM-powered, and which are hybrid is critical for debugging and extending the system.

### 16.1 Layer Overview

| Layer | Engine | Runs When | Requires LLM | Output |
| --- | --- | --- | --- | --- |
| **Rule-Based Insight** | `generateInsight.js` | Every report view | No | Summary, drivers, loops, direction, what's working, where to focus |
| **LLM Insight** | `generateLlmInsight.js` | Weekly job (scheduled/manual) | Yes (Ollama/Mistral) | 3-section narrative (what stood out / contributing / try) |
| **Adaptive Modes** | `modeComposer.js` | Daily job for premium users | Yes (Ollama/Mistral) | Move/Fuel/Perspective narratives around knowledge items |
| **Action Engine** | `actionEngine.js` | Every report view | No (rule-based) + optional LLM enrichment | 3-5 contextual micro-actions |

### 16.2 Rule-Based Insight Generator (`backend/ai/generateInsight.js`)

**Type: Purely rule-based. No LLM dependency. Always available.**

This is the backbone of the insight system. It runs synchronously on every `GET /api/weeklyReport` request and produces the structured insight payload consumed by the Mirror tab.

**Inputs:**
- Weekly report from `patternEngine.js` (7-day aggregates, correlations, trajectories)
- Signal profile from `signalProfile.js` (volatility, drift, intensity, flattening, masking, crash risk)
- RAG context from `ragEngine.js` (interpretations, framing, interventions)

**Outputs:**
- `summary` — confidence-tier-aware narrative (too_early → low → emerging → moderate → strong)
- `drivers` — top triggers with regulator/friction/neutral effect tags
- `behavioralLoop` — trigger → emotion → recovery chains
- `actionableDirection` — single sentence of personalized guidance (RAG-enriched)
- `whatWorking` / `whereToFocus` — structured observation lists
- `stateOfMind`, `baselineSummary` — baseline-derived state labels
- `patternContext` — RAG-retrieved interpretation for the dominant pattern
- `microExperiment` — trigger-specific micro-action from static pools
- `confidence` — data quality tier
- `model: "rule-based-v4"` — version tag

**Key behaviors:**
- Confidence tiers gate complexity: `too_early` (<3 moments) returns minimal output; `strong` (≥20 moments) produces full signal-aware narratives
- Signal profile constrains language intensity (subtle patterns get restrained language)
- Contrast detection: when surface signals (stable volatility) contradict deeper signals (negative drift), the narrative acknowledges both layers
- Hindi parallel builders produce equivalent output via `insightLang.js`
- RAG interventions override static fallbacks for crash_risk, false_recovery, masking, declining drift, and flattening conditions

### 16.3 LLM Insight Generator (`backend/ai/generateLlmInsight.js`)

**Type: Purely LLM-powered. Requires running Ollama instance. Premium feature.**

Runs as a scheduled/manual job and caches the result in Redis with 7-day TTL. The frontend reads the cached output — it never calls LLM synchronously during a user request.

**Inputs:**
- Structured signal facts from `buildSignals()` (~60 lines of quantified behavioral data)
- Signal profile constraints from `signalProfile.js` (mandatory narrative rules)
- RAG context from `ragEngine.js` (6 knowledge chunks injected as "contextual knowledge")
- Recent user notes (free-text from moments)
- Action feedback history (tried/skipped actions)
- Style profile from `styleProfiles.js`

**Outputs:**
- 3-section narrative: "What stood out" / "What may be contributing" / "One thing to try"
- `generatedAt` timestamp, `model` tag

**Key behaviors:**
- The prompt is heavily constrained: exact section format, word budget (60-165 words), forbidden vocabulary, mandatory flattening/trajectory rules
- RAG context is injected as "CONTEXTUAL KNOWLEDGE" with instructions to inform but not quote
- Signal profile constraints are binding: if flattening is detected, the LLM MUST make it the central theme
- Output is post-processed: em-dashes stripped, pronouns fixed, incomplete sentences trimmed, markdown stripped
- Language: full Hindi (Devanagari) support with parallel system prompts
- Fallback: if LLM is unreachable, the frontend shows only rule-based output (graceful degradation)

### 16.4 Mode Composer (`backend/ai/modeComposer.js`)

**Type: Hybrid — rule-based item selection + LLM narrative composition. Premium feature.**

Three modes: Move (physical activity), Fuel (nourishment), Perspective (cognitive reframe).

**Rule-based components:**
- Knowledge libraries: `movementLibrary.js` (30+ exercises), `nourishmentLibrary.js` (40+ foods)
- Item selection: emotion-tag scoring, anti-repetition (recent history), user preference filtering (diet, equipment, dislikes)
- Context extraction: emotional centroid, baseline drift, state-of-mind from report

**LLM components:**
- Narrative composition: given 2 selected items + emotional context + RAG dynamics, the LLM writes 3-4 sentences explaining why these items suit the user's state
- System prompts are mode-specific (movement guide / nourishment guide / perspective-giver)
- Perspective mode is fully LLM-composed (no knowledge library items — free-form reframe)

**RAG integration:**
- `retrieveForMode()` injects emotional dynamics and interpretation knowledge into the context
- This gives the LLM deeper vocabulary for connecting physical/nutritional suggestions to emotional patterns

### 16.5 Action Engine (`backend/services/actionEngine.js`)

**Type: Primarily rule-based with optional LLM enrichment via HiTL feedback loop.**

Generates 3-5 contextual micro-actions on every report view. Actions are NOT stored — they are computed fresh from current report data + feedback history.

**Rule-based core (12 strategies):**
1. Centroid-based mood pairings (activated-negative, heavy-negative, settled-positive)
2. Centroid drift awareness (rising energy)
3. Friction + regulator pairing ("Try X when Y gets tough")
4. Repeated friction awareness
5. Drift-based check-in
6. Rising trigger detection (week-over-week delta)
7. Stability reinforcement
8. Liked-trigger reinforcement (from HiTL feedback)
9. Top-pair awareness (fallback)
10. Dominant trigger check-in (fallback)
11. Top emotion reflection (fallback)
12. Generic safety net (guarantees minimum 3 actions)

**LLM enrichment (via HiTL):**
- The `generateLlmActions` job runs periodically when feedback accumulates
- It sends the user's report + feedback history to Ollama and generates 3 fresh LLM-authored actions
- These are stored in `action_prefs.llmActions` and prioritized over rule-based candidates on next view
- LLM prompt incorporates what the user tried (enhance) vs skipped (change approach)

**HiTL feedback loop:**
1. User marks action as "helped" or "not helpful" → stored in `action_feedback:{ownerId}` (Redis list, 90-day TTL)
2. Feedback index tracks per-action counters: `{helped: n, notHelpful: n}`
3. Actions with 2+ "not helpful" responses are permanently blacklisted
4. Helped triggers are boosted in future action ranking
5. Rotation epoch: every 3 feedback responses, action IDs rotate so the user always gets fresh candidates
6. LLM action job uses feedback to steer future generations

### 16.6 RAG Layer (`backend/knowledge/`)

**Type: Tag-based semantic retrieval. No vector DB, no embeddings.**

The RAG layer augments all three generation pipelines with structured domain knowledge.

**Knowledge base (`insightKnowledge.js`):**
- 47 chunks across 4 domains: interpretation, intervention, dynamics, framing
- Each chunk has: tags (signal profile vocabulary), weight (0-1 priority), content (knowledge text)
- Covers: flattening, masking, crash risk, false recovery, drift patterns, vacuum states, trigger-specific contexts, evidence-based micro-interventions, emotional dynamics, narrative framing

**Retrieval engine (`ragEngine.js`):**
- `extractTags()`: builds tag set from signal profile + report data (triggers, emotions, confidence, streaks, recovery)
- `scoreChunk()`: (matched tags / total chunk tags) × chunk weight — favors chunks with high tag coverage
- Four retrieval functions tuned for each consumer:
  - `retrieveForLLM(report, 6)` → formatted context block for LLM prompt injection
  - `retrieveForRuleBased(report, 4)` → structured `{interpretations, framing}` objects
  - `retrieveForMode(report, 3)` → dynamics + interpretation context string
  - `retrieveIntervention(report)` → best-matching intervention content

**Safety:** All RAG calls are wrapped in try-catch. If RAG fails, pipelines continue with empty context (graceful degradation).

### 16.7 Signal Profile (`backend/ai/signalProfile.js`)

**Type: Purely rule-based classifier. No LLM dependency.**

Classifies the current report into discrete signal dimensions used by all downstream generators:

| Dimension | Values | Source |
| --- | --- | --- |
| Volatility | low / moderate / high | `volatilityScore` |
| Drift | positive / neutral / slight_negative / strong_negative | baseline drift value |
| Trigger strength | none / weak / moderate / strong | pairing count + max frequency |
| Intensity | subtle / moderate / strong | composite of above |
| Flattening | boolean | neutral dominance + within-week decline |
| Masking | none / low / high | behavioral divergence coefficient |
| Crash risk | boolean | sustained positive surface + declining underlying |
| False recovery | boolean | surface recovery without underlying resolution |
| Vacuum drift | string | trigger-removed emotional drift |

Also provides: `rankSignals()` (primary/secondary signal priority), `detectRelationship()` (alignment vs contrast), `buildSignalConstraints()` (mandatory narrative rules for LLM prompts).

### 16.8 Pipeline Dependency Map

```
patternEngine.js (7-day aggregates)
  ↓
signalProfile.js (classification)
  ↓
  ├── ragEngine.js (tag extraction → knowledge retrieval)
  │     ↓
  │     ├── generateInsight.js    [rule-based, always runs, RAG-enriched]
  │     ├── generateLlmInsight.js [LLM, scheduled job, RAG-augmented prompt]
  │     ├── modeComposer.js       [hybrid, scheduled job, RAG context]
  │     └── actionEngine.js       [rule-based, every view, optional LLM prefs]
  │
  └── actionEngine.js also reads:
        ├── action_feedback (Redis list, HiTL responses)
        └── action_prefs (Redis JSON, LLM-generated actions + liked triggers)
```

### 16.9 Failure Modes & Degradation

| Component | If it fails... | User sees... |
| --- | --- | --- |
| patternEngine | Report API returns error | Error state in app |
| signalProfile | Defaults to neutral/subtle classification | Less nuanced language, but report still renders |
| RAG layer | Try-catch returns empty context | Insight quality slightly reduced, no crash |
| Rule-based insight | Never fails (pure computation) | Always available |
| LLM insight | Timeout / Ollama down | Premium tab shows rule-based only, no LLM narrative |
| Mode composer | Timeout / Ollama down | Mode cards show "warming up" state |
| Action engine | Edge case: <3 moments | Shows "actions on the way" state |
| LLM action job | Ollama down | Rule-based actions continue normally |

## 17. Subscription System

### 17.1 Mobile Purchase Flow

1. User opens Premium tab.
2. User taps Start subscription.
3. App initializes the Play billing connection.
4. App requests the monthly subscription SKU.
5. App extracts the purchase token.
6. App sends token and subscription ID to backend verification endpoint.
7. Backend validates via Google Play or uses a stubbed fallback if environment variables are absent.
8. App finishes the transaction and stores the returned subscription state in session memory.

### 17.2 Environment Fallback Behavior

If Google Play credentials are not configured, the backend stores a stubbed `grace_period` subscription for 30 days. This supports non-production testing while making the environment difference explicit.

## 18. Notifications

Supported notification types:

- Reflection reminder
- Pattern alert
- Weekly insight ready

Guardrails before sending notifications:

- user must grant notification permission
- only one notification per day
- no reminder if a moment was already logged that day
- no reminder if the app was opened recently within a 45-minute window

Triggering behavior:

- after logging a moment, a pattern alert may be scheduled immediately
- if reminders are enabled, a daily reflection reminder is scheduled
- enabling weekly reminder schedules a weekly Monday 7 PM local notification

## 18. Analytics and Monitoring

### 18.1 Analytics Events

Mobile and backend both emit analytics. Current important events include:

- `login_completed`
- `register_completed`
- `moment_logged`
- `weekly_report_viewed`
- `subscription_started`
- `subscription_cancelled`

### 18.2 Monitoring

- mobile initializes Sentry at app boot
- backend captures route failures through a monitoring wrapper
- backend health endpoint validates Redis availability and key environment readiness

## 19. Security Model

### 19.1 Current Protections

- bcrypt password hashing with cost 12
- JWT signing via server secret
- server-side session existence checks
- zod input validation at API boundary
- authorization header parsing only when prefixed with Bearer
- request rate limiting by client IP for auth and logging routes
- text sanitization for notes and names

### 19.2 Current Risks and Constraints

- anonymous owners are device-scoped rather than user-verified
- no refresh token rotation; long-lived session token is used directly
- per-IP rate limiting is coarse and may not handle shared-network edge cases well
- Redis REST access requires careful environment management because it is directly used for all persistence
- AI summary generation depends on a locally reachable Ollama service, which is not a managed production dependency by default

## 20. Deployment and Operations

### 20.1 Backend Deployment

- hosted on Vercel
- API functions under `pages/api/**/*.js`
- current function max duration: 10 seconds
- scheduled cron triggers `GET /api/weeklyReport?mode=scheduled` every Monday at 03:00 UTC

### 20.2 Mobile Deployment

- built with EAS for Android AAB release
- requires Expo env configuration and store credentials outside the repo

### 20.3 Web Deployment

- standard Next.js deployment
- designed as a lightweight companion surface rather than the primary product experience

## 21. Environment Requirements

### 21.1 Backend Required Variables

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `JWT_SECRET`
- `APP_BASE_URL`

### 21.2 Backend Optional / Feature Variables

- `GOOGLE_CLIENT_ID`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `SENTRY_DSN`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `MODEL_PROVIDER`
- `MODEL_NAME`

### 21.3 Mobile Public Variables

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_WEB_BASE_URL`
- `EXPO_PUBLIC_POSTHOG_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID`

### 21.4 Web Variables

- `NEXT_PUBLIC_API_URL`

## 22. Performance Characteristics

### 22.1 Fast Paths

- timeline reads scan only one owner’s raw moment list
- weekly reports read seven aggregate hashes instead of full raw history
- immediate feedback checks only seven daily aggregate snapshots

### 22.2 Potential Bottlenecks

- very large raw moment lists per owner may slow export and timeline operations over time
- batch weekly report generation loops serially through all owners
- Redis REST round-trips add latency compared to direct Redis connections
- local-model AI generation is likely the slowest scheduled-path dependency

## 23. Failure Modes and User Impact

| Failure | User Impact | Current Behavior |
| --- | --- | --- |
| Backend unavailable | Mobile startup and data fetches fail | Startup toast, retry-capable screens |
| Redis unavailable | Most backend operations fail | Healthcheck fails, API returns server errors |
| Session invalid | Authenticated actions fail | Session bootstrap clears token on failure |
| Google auth not configured | Google login unavailable | Dedicated server error response |
| Play verification not configured | Subscription is stubbed | Grace-period state returned |
| Ollama unavailable | No fresh AI summaries in scheduled path | Weekly report still computes without generated summary |

## 24. Engineering Constraints

- Backend uses the Pages Router, not App Router handlers.
- Shared package is JavaScript-first and relies on JSDoc typing rather than full TypeScript enforcement.
- Anonymous and authenticated ownership models coexist and must be supported in API contracts.
- Reporting logic depends on daily aggregates being written at log time; backfills require aggregate regeneration if raw data changes retroactively.
- Premium copy currently promises features that are only partially implemented in code and should be aligned before broad release.

## 25. Recommended Next Technical Evolutions

1. Introduce a formal schema package with runtime and static typing for all API payloads.
2. Add aggregate backfill and repair scripts for data correction scenarios.
3. Move weekly generation to concurrent batch processing if owner volume increases.
4. Add session revocation and token refresh strategy.
5. Gate premium features in both UI and backend instead of only storing subscription state.
6. Add integration tests for anonymous-to-auth migration, report generation, and subscription verification fallback behavior.

## 26. Source of Truth Files

The most important implementation references for this spec are:

- `mobile/hooks/useAppSession.js`
- `mobile/services/api.js`
- `mobile/services/deviceService.js`
- `mobile/services/notificationService.js`
- `backend/pages/api/*.js`
- `backend/services/authService.js`
- `backend/services/momentService.js`
- `backend/services/aggregationService.js`
- `backend/services/patternEngine.js`
- `backend/jobs/generateWeeklyReports.js`
- `backend/services/subscriptionService.js`
- `shared/constants/*.js`

## 27. Acceptance Criteria for Major System Behavior

### Logging

- A user can log a moment anonymously.
- Invalid trigger input still results in a stored normalized trigger.
- Immediate feedback returns when pair frequency crosses the implemented threshold.

### Auth

- A user can register or login and receive a session token.
- Anonymous moments tied to `deviceId` migrate to the authenticated owner.

### Reporting

- A weekly report can be generated from the most recent seven aggregate snapshots.
- The report returns a usable empty-state structure when data is sparse.

### Subscriptions

- A signed-in user can initiate a subscription flow.
- The backend stores a verifiable subscription state or a clearly stubbed fallback.

### Notifications

- Weekly reminders can be enabled and disabled.
- The app suppresses notification spam through one-per-day and recent-open checks.

## 28. Document Status

Status: current-state technical specification based on repository implementation as of March 13, 2026.
