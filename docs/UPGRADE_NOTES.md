# TriggerMap v2 Upgrade Notes

## Overview

This document summarizes all changes made during the v1 → v2 overhaul. It covers shared contracts, backend improvements, mobile UX, web companion, and cleanup.

---

## Shared Contracts

### New: Premium Entitlement Matrix (`shared/constants/premium.js`)

Canonical source of truth for free vs premium feature access:

| Feature Key            | Tier    | Description                  |
|------------------------|---------|------------------------------|
| coreMomentLogging      | free    | Trigger + emotion logging    |
| timeline               | free    | Timeline review              |
| basicWeeklyReport      | free    | Weekly pattern report        |
| exportLogs             | free    | Export your data             |
| momentEditing          | free    | Edit and delete moments      |
| aiWeeklySummary        | premium | AI-powered weekly insight    |
| detailedReportCharts   | premium | Detailed report charts       |

Exports: `PREMIUM_FEATURES`, `PREMIUM_PRODUCT_ID`, `PREMIUM_PRICE_LABEL`, `requiresPremium(featureKey)`, `hasAccess(featureKey, subscriptionStatus)`

### Fixed: Feature Flags (`shared/constants/flags.js`)

Renamed from misleading marketing copy to actual feature slugs:
- `premiumMonthlyReports` → `aiWeeklySummary`
- `behavioralExperiments` → `detailedReportCharts`
- `dataExport` → `momentEditing`

### Fixed: Response Envelope (`backend/services/response.js`)

Changed from `{ ok: true, ...data }` (flat spread) to `{ ok: true, data: {...} }` (nested envelope). Both API clients (`mobile/services/api.js` and `web/lib/api.js`) unwrap `.data` centrally so all consumers continue working unchanged.

---

## Backend

### New: Premium Service (`backend/services/premiumService.js`)

Provides `getSubscriptionStatus(userId)`, `checkFeatureAccess(userId, featureKey)`, and `isPremiumActive(userId)` — all backed by the shared entitlement matrix.

### Improved: Weekly Report Job (`backend/jobs/generateWeeklyReports.js`)

- **Premium gating**: AI insight generation now only runs for users with `aiWeeklySummary` access (active/grace_period subscription)
- **Graceful AI failure**: Ollama call is wrapped in its own try/catch; failures skip the user instead of crashing the entire job
- Free-tier users are skipped with reason `"free-tier"`

### Improved: Weekly Report API (`backend/pages/api/weeklyReport.js`)

- AI insight is only included in the response when the user has `aiWeeklySummary` access
- Free users still get the full pattern engine report (trigger frequency, emotion trajectory, correlations, etc.)

### New: Moment Edit/Delete

**API Route**: `backend/pages/api/moment/[id].js`
- `PUT /api/moment/:id` — Edit trigger, emotion, or note. Requires authentication.
- `DELETE /api/moment/:id` — Delete a moment. Requires authentication.
- Both operations repair daily aggregates automatically.

**Service Layer** (`backend/services/momentService.js`):
- `getMomentById(ownerId, momentId)` — Find a specific moment
- `updateMoment(ownerId, momentId, updates)` — Edit with validation, returns `{ original, updated }`
- `deleteMoment(ownerId, momentId)` — Remove from list, returns removed moment

**Aggregate Repair** (`backend/services/aggregationService.js`):
- `decrementDailyAggregate(moment)` — Reverse the counters for a removed/changed moment
- `repairAggregateForEdit(original, updated)` — Decrement old + increment new

### Cleanup

- **Deleted**: `backend/ai/generateInsight.ts` (dead TypeScript duplicate)
- **Deleted**: `backend/jobs/generateWeeklyReports.ts` (dead TypeScript duplicate)
- **Deleted**: `backend/middleware/` (empty directory)

---

## Mobile

### Rewritten: PremiumScreen

- Removed misleading benefit copy ("Monthly reports", "Behavioral experiments", "Data export")
- Now reads directly from `PREMIUM_FEATURES` constant
- Shows "Included free" section (checkmarks) and "Premium features" section (stars)
- Displays actual price from `PREMIUM_PRICE_LABEL`
- Shows active subscription confirmation when applicable
- Correctly checks both `active` and `grace_period` status

### Improved: Timeline (day-grouped)

- Moments are now grouped by day with section headers using `getRelativeDayLabel()`
- `TimelineGroup` component no longer shows redundant day label per card
- Arrow changed from `->` to `→`

### New: Edit/Delete Moments

- Long-press on any timeline moment (when signed in) shows options: Edit, Delete
- Edit flow: choose new trigger → choose new emotion (via Alert dialogs)
- Delete flow: confirmation dialog, then optimistic local removal
- `useAppSession` exposes `updateMoment(id, updates)` and `removeMoment(id)`
- `api.js` exports `editMoment(id, payload, token)` and `deleteMomentApi(id, token)`

### Improved: Weekly Report Screen

- Added `scroll` prop to ScreenShell (content was overflowing)
- Shows premium upsell card when AI insight is absent and user is not premium

### Improved: Settings Screen

- Shows subscription status text ("Premium active" / "Free plan")
- Version now reads from `Constants.expoConfig.version` instead of hardcoded "1.0.0"

---

## Web

### Improved: Timeline (day-grouped)

- Moments grouped by day with section headers
- Added `→` arrow between trigger and emotion pills
- Removed "No note added" placeholder for moments without notes

### Improved: Report Page

- Shows premium upsell text when AI insight is absent

### CSS

- Added `.momentArrow` style for trigger→emotion separator

---

## Files Changed Summary

| Area    | File                                      | Action   |
|---------|-------------------------------------------|----------|
| shared  | constants/premium.js                      | Created  |
| shared  | constants/index.js                        | Modified |
| shared  | constants/flags.js                        | Modified |
| backend | services/response.js                      | Modified |
| backend | services/premiumService.js                | Created  |
| backend | services/momentService.js                 | Modified |
| backend | services/aggregationService.js            | Modified |
| backend | jobs/generateWeeklyReports.js             | Modified |
| backend | pages/api/weeklyReport.js                 | Modified |
| backend | pages/api/moment/[id].js                  | Created  |
| backend | ai/generateInsight.ts                     | Deleted  |
| backend | jobs/generateWeeklyReports.ts             | Deleted  |
| backend | middleware/                                | Deleted  |
| mobile  | services/api.js                           | Modified |
| mobile  | hooks/useAppSession.js                    | Modified |
| mobile  | screens/PremiumScreen.js                  | Rewritten|
| mobile  | screens/TimelineScreen.js                 | Modified |
| mobile  | screens/WeeklyReportScreen.js             | Modified |
| mobile  | screens/SettingsScreen.js                 | Modified |
| mobile  | components/TimelineGroup.js               | Modified |
| web     | lib/api.js                                | Modified |
| web     | pages/timeline.js                         | Modified |
| web     | pages/report.js                           | Modified |
| web     | styles/globals.css                        | Modified |
| docs    | UPGRADE_NOTES.md                          | Created  |
