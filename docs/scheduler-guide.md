# TriggerMap — Weekly Report Scheduler Guide

## What the scheduler does

The weekly report job (`backend/jobs/generateWeeklyReports.js`) iterates through
every owner ID stored in Redis and, for each premium subscriber who has logged
moments, generates an AI-powered insight using the rule-based engine.
The result is stored in Redis under `weekly_report:{ownerId}` and served from
`GET /api/weeklyReport`.

### Pipeline

```
listOwnerIds()          ← SMEMBERS owners
  ↓
getStoredWeeklyInsight() ← check freshness (7-day TTL logic)
  ↓
getWeeklyAggregates()    ← daily aggregate hashes for the last 7 days
  ↓
generateWeeklyReport()   ← pattern engine: frequencies, correlations, volatility
  ↓
checkFeatureAccess()     ← skip if user is free-tier
  ↓
generateInsight()        ← rule-based AI insight engine (rule-based-v1)
  ↓
storeWeeklyInsight()     ← SET weekly_report:{ownerId} JSON
```

Free/anonymous users get the basic pattern report (frequencies, top trigger,
top emotion, volatility, etc.) in real-time when they open the report page.
Only the `aiInsight` block (summary + suggestion) is generated and stored by
the scheduler for premium users.

---

## How to run it

### 1. Vercel cron (automatic — production)

The backend `vercel.json` already configures a cron:

```json
{
  "crons": [
    {
      "path": "/api/weeklyReport?mode=scheduled",
      "schedule": "0 3 * * 1"
    }
  ]
}
```

This fires **every Monday at 03:00 UTC** (08:30 IST).
When the `/api/weeklyReport` endpoint receives `?mode=scheduled`, it calls
`runGenerateWeeklyReports()` internally and returns a summary of how many users
were processed.

**Nothing to do** — this runs automatically on the Vercel Hobby plan (1 cron
job free) and on Pro (unlimited).

### 2. Manual trigger via HTTP

Hit the endpoint directly from a browser or terminal:

```bash
curl "https://backend-five-nu-92.vercel.app/api/weeklyReport?mode=scheduled"
```

Or from PowerShell:

```powershell
Invoke-RestMethod "https://backend-five-nu-92.vercel.app/api/weeklyReport?mode=scheduled"
```

The response tells you exactly what happened:

```json
{
  "ok": true,
  "data": {
    "generated": 3,
    "skipped": 12,
    "results": [
      { "ownerId": "abc", "report": { "summary": "...", "weekStart": "2026-03-09" } },
      { "ownerId": "xyz", "skipped": true, "reason": "free-tier" },
      { "ownerId": "anon-1", "skipped": true, "reason": "no-data" }
    ]
  }
}
```

### 3. Local CLI (development / testing)

From the repo root:

```bash
cd backend
npm run reports:generate
```

This runs `node ./jobs/generateWeeklyReports.js` directly.
Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to be set
in `backend/.env` (or exported as environment variables).

---

## When to run it

| Scenario | Action |
|---|---|
| **Normal week** | Automatic — Vercel cron fires Monday 03:00 UTC |
| **After deploying new AI logic** | Trigger manually once: `curl …?mode=scheduled` |
| **User reports stale insight** | Same manual trigger — the freshness check is 7 days, so re-running mid-week overwrites only if the existing insight is older than 7 days |
| **Testing locally** | `npm run reports:generate` from `backend/` |
| **Want to force-refresh all users** | Currently the `isStale()` check prevents re-generation within 7 days. To force: temporarily delete the Redis keys (`DEL weekly_report:{ownerId}`) then re-run |

### Recommended cadence

- **Monday 03:00 UTC** — automatic cron, covers the previous week's data.
- **After any deploy that changes `generateInsight.js` or `patternEngine.js`** —
  run the manual trigger once so existing premium users pick up improved insight
  text on their next visit.
- **Mid-week manual runs are safe** — the job skips users whose insight is
  under 7 days old, so it won't waste resources.

---

## Who gets what

| User type | Basic report (frequencies, correlations) | AI insight (summary + suggestion) |
|---|---|---|
| **Anonymous (deviceId)** | Yes — computed on-the-fly | No — upsell shown |
| **Free account** | Yes — computed on-the-fly | No — upsell shown |
| **Premium subscriber** | Yes — computed on-the-fly | Yes — from stored `weekly_report:{ownerId}` |

The basic report is always generated in real-time from `getWeeklyAggregates()` +
`generateWeeklyReport()`. The scheduler only pre-generates the AI insight block.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Cron never fires | Vercel Hobby only supports 1 cron — check no other crons conflict | Remove any duplicate crons in `vercel.json` |
| `"reason": "free-tier"` for a premium user | Subscription not verified in Redis | Check `subscription:{userId}` key, or re-verify from Play Store |
| `"reason": "ai-failed"` | `generateInsight` threw — unlikely with rule-based engine | Check backend logs in Vercel dashboard |
| `"reason": "no-data"` | User had zero moments that week | Expected — nothing to analyze |
| `"reason": "fresh"` | Insight already generated within 7 days | Working as intended — skip to save resources |
| Insight text unchanged after deploying | Freshness guard blocks re-gen | Manually delete Redis key and re-trigger, or wait until next Monday |

---

## Environment variables required

| Variable | Where | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Backend `.env` / Vercel env | Redis connection |
| `UPSTASH_REDIS_REST_TOKEN` | Backend `.env` / Vercel env | Redis auth |

No other env vars are needed for the report scheduler. The AI engine is
rule-based (no external API key required).
