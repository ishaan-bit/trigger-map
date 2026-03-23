# TriggerMap — Behavioral Model, Variable Calculations & Insights Rendering

> Complete technical reference for how TriggerMap models emotional behavior, generates reports, and renders the Insights screen.

---

## Table of Contents

1. [Data Foundation](#1-data-foundation)
2. [Emotion Scoring Model](#2-emotion-scoring-model)
3. [Daily Aggregation](#3-daily-aggregation)
4. [Pattern Engine (patternEngine.js)](#4-pattern-engine)
5. [Baseline Engine (baselineEngine.js)](#5-baseline-engine)
6. [Rule-Based Insight Generation (generateInsight.js)](#6-rule-based-insight-generation)
7. [LLM Insight Generation (generateLlmInsight.js)](#7-llm-insight-generation)
8. [Weekly Report API Flow](#8-weekly-report-api-flow)
9. [Insights Screen Rendering (WeeklyReportScreen.js)](#9-insights-screen-rendering)
10. [Access Tiers & Gating](#10-access-tiers--gating)

---

## 1. Data Foundation

### Moment (single log entry)

Each time the user logs, a **moment** is created with:

| Field       | Type     | Description                                       |
|-------------|----------|---------------------------------------------------|
| `ownerId`   | string   | User ID or anonymous device ID                    |
| `trigger`   | string   | One of: `work`, `family`, `partner`, `social`, `alone`, `exercise`, `travel`, `health`, `money` |
| `emotion`   | string   | One of: `calm`, `neutral`, `anxious`, `frustrated`, `energized` |
| `timestamp` | ISO date | When the moment was logged                        |
| `note`      | string?  | Optional free-text note                           |
| `tags`      | string[] | Optional context tags                             |
| `prediction`| string?  | Morning prediction of expected emotion for the day |

### Redis Storage

Moments are stored individually, but for reporting purposes they are **aggregated into daily snapshots** stored as Redis hashes with a 45-day TTL.

---

## 2. Emotion Scoring Model

Every emotion maps to a numeric score on a 1–5 scale:

| Emotion      | Score | Energy Category |
|--------------|-------|-----------------|
| `frustrated` | 1     | drained         |
| `anxious`    | 2     | tense           |
| `neutral`    | 3     | balanced        |
| `calm`       | 4     | steady          |
| `energized`  | 5     | uplifted        |

Higher score = more positive emotional state. This scale is used throughout all calculations.

---

## 3. Daily Aggregation

**File:** `backend/services/aggregationService.js`

When a moment is logged, `appendDailyAggregate()` increments Redis hash fields:

```
Redis key: triggermap:daily:{ownerId}:{YYYY-MM-DD}
```

| Hash Field          | Example              | Description                          |
|---------------------|----------------------|--------------------------------------|
| `total`             | `3`                  | Total moments logged that day        |
| `trigger:{name}`    | `trigger:work → 2`  | Count per trigger                    |
| `emotion:{name}`    | `emotion:calm → 1`  | Count per emotion                    |
| `pair:{t}|{e}`      | `pair:work|anxious → 2` | Count per trigger–emotion pair    |
| `time:{bucket}`     | `time:morning → 1`  | Count per time bucket (morning/afternoon/evening/night) |
| `tag:{name}`        | `tag:deadline → 1`  | Count per context tag                |
| `prediction`        | `calm`               | Morning prediction (first one wins per day) |
| `date`              | `2026-03-23`         | Date string                          |

### Time Buckets

| Bucket      | Hours   |
|-------------|---------|
| `night`     | 0–5     |
| `morning`   | 6–11    |
| `afternoon` | 12–17   |
| `evening`   | 18–23   |

### Fetching Aggregates

- `getWeeklyAggregates(ownerId, days = 7)` — fetches daily snapshots for the last N days via Redis pipeline
- Each snapshot is parsed into a structured object with `triggers`, `emotions`, `pairs`, `timeOfDay`, `tags`, `total`, `prediction`, `date`

---

## 4. Pattern Engine

**File:** `backend/services/patternEngine.js`

`generateWeeklyReport({ aggregates, allAggregates, aiInsight })` — the core analysis function. Takes 7-day aggregates (and optionally 45-day for baseline) and computes everything.

### Variables Computed

#### Top Trigger / Emotion

- **`topTrigger`** — The trigger with the highest total count across the week. `null` if there's a tie.
- **`topEmotion`** — The emotion with the highest total count. `null` if tied.
- **`tiedTriggers` / `tiedEmotions`** — Array of all triggers/emotions sharing the max count.
- **`hasDominantTrigger` / `hasDominantEmotion`** — Boolean, true only if there's a single winner.

#### Frequency Maps

- **`triggerFrequency`** — `{ work: 5, family: 3, ... }` — total count of each trigger across the week.
- **`emotionFrequency`** — `{ calm: 4, anxious: 2, ... }` — total count of each emotion.
- **`tagFrequency`** — `{ deadline: 3, meeting: 1, ... }` — total count of each context tag.
- **`timeOfDayPatterns`** — `{ morning: 3, afternoon: 5, evening: 2, night: 0 }`.
- **`energyDistribution`** — Maps emotions to energy buckets via `ENERGY_MAP`, then counts: `{ steady: 4, tense: 2, ... }`.

#### Pairings

- **`correlations`** — Nested map: `{ work: { anxious: 3, calm: 1 }, family: { calm: 2 } }`. Built from pair keys like `work|anxious`.
- **`topPair`** — The single most frequent trigger–emotion pair: `{ trigger, emotion, count }`.
- **`pairFrequency`** — Raw pair counts: `{ "work|anxious": 3, ... }`.

#### Regulators & Friction Zones

Derived from `correlations` via `classifyPairings()`:

- **`regulators`** — Pairs where the emotion scores ≥ 4 (calm or energized) with count ≥ 2. These are **positive patterns** — things that help the user feel better. Sorted by count descending.
- **`frictionZones`** — Pairs where the emotion scores ≤ 2 (anxious or frustrated) with count ≥ 2. These are **negative patterns** — trigger–emotion combos causing distress. Sorted by count descending.
- **`pairings`** — All qualifying pairs regardless of valence.

#### Volatility & Stability

- **Day Variance** — For each day, compute: $\text{variance} = \frac{\sum (S_e - \mu)^2 \times n_e}{\sum n_e}$ where $S_e$ is the emotion score, $\mu$ is the day's average score, and $n_e$ is the count of that emotion.
- **`volatilityScore`** — Average variance across all days with data. Lower = more emotionally steady.
  - `< 0.3` → "steady"
  - `< 0.8` → "mild shifts"
  - `< 1.5` → "moderate swings"
  - `≥ 1.5` → "high variability"
- **`volatilityLabel`** — Human-readable label for the score.
- **`mostStableDay`** — The date with the lowest variance (needs ≥ 2 valid days).

#### Emotional Trajectory

- **`weeklyEmotionTrajectory`** — Array of daily entries (only days with logged moments):
  ```
  { date, score, dominantEmotion, tone }
  ```
  - `score` — Day's weighted average emotion score (1–5).
  - `dominantEmotion` — Most frequent emotion that day.
  - `tone` — `"positive"` (≥ 4), `"mixed"` (2.5–4), `"negative"` (< 2.5).

- **`trajectoryNote`** — Human-readable summary of the week's trajectory arc. Compares first day score to last day score and range:
  - "Emotional tone stayed fairly consistent..."
  - "Emotional tone improved as the week went on."
  - "Slight downward shift in emotional tone..."
  - etc.

#### Prediction Accuracy ("Gut Check")

- **`predictionAccuracy`** — Only computed when ≥ 2 days have both a prediction and logged moments:
  ```
  { daysCompared, correct, rate }
  ```
  - A day is "correct" if the morning prediction matches the day's dominant emotion.
  - `rate` = `correct / daysCompared`.

#### Concentration / Diversity

- **`triggerConcentration`** — Herfindahl index of trigger distribution. $H = \sum (s_i)^2$ where $s_i$ is the share of trigger $i$.
  - `< 0.3` → "spread broadly"
  - `< 0.5` → "moderately concentrated"
  - `≥ 0.5` → "dominated by few"
- **`emotionConcentration`** — Same formula for emotions.

#### Busiest Time

- **`busiestTime`** — The time-of-day bucket with the most moments. Only computed if ≥ 3 days logged.

#### Confidence Model

**`dataQuality.confidence`** — Determines how much the system can say:

| Level        | Condition                                         |
|--------------|---------------------------------------------------|
| `too_early`  | < 3 total moments                                 |
| `low`        | < 5 moments OR < 2 days                           |
| `emerging`   | < 8 moments OR < 3 days                           |
| `moderate`   | < 15 moments OR < 5 days                          |
| `strong`     | ≥ 15 moments AND ≥ 5 days                         |

**`dataQuality` object:**

| Field                   | Type    | Description                               |
|-------------------------|---------|-------------------------------------------|
| `totalMoments`          | number  | Total moments in the 7-day window         |
| `daysLogged`            | number  | Number of days with at least 1 moment     |
| `uniqueTriggers`        | number  | Distinct triggers used                    |
| `uniqueEmotions`        | number  | Distinct emotions logged                  |
| `confidence`            | string  | Confidence tier (see above)               |
| `hasEnoughForPairings`  | boolean | ≥ 8 moments                              |
| `hasEnoughForRhythm`    | boolean | ≥ 3 days                                 |
| `hasEnoughForTrajectory`| boolean | ≥ 3 days with data in trajectory          |
| `hasEnoughForStability` | boolean | ≥ 5 moments AND ≥ 2 valid days           |

#### Baseline Metrics

Computed by the **Baseline Engine** (see next section). The pattern engine calls:
```js
const baselineInput = allAggregates || filledAggregates;
const baselineMetrics = computeBaselineMetrics(baselineInput, rawVolatility);
```

---

## 5. Baseline Engine

**File:** `backend/services/baselineEngine.js`

Longitudinal emotional state modeling. Uses up to 45 days of daily aggregates.

### Configuration Constants

| Constant              | Value | Meaning                                    |
|-----------------------|-------|--------------------------------------------|
| `BASELINE_WINDOW_DAYS`| 30    | How many days of history to learn from     |
| `RECENT_WINDOW_DAYS`  | 7     | Recent window for drift comparison         |
| `DRIFT_THRESHOLD`     | 0.4   | Deviation threshold to count as "drifting" |
| `RECOVERY_BAND`       | 0.5   | ±range from baseline to count as "recovered"|
| `MIN_BASELINE_DAYS`   | 5     | Minimum logged days for a reliable baseline|

### Day Score

For each daily snapshot:

$$\text{dayScore} = \frac{\sum S_e \times n_e}{\sum n_e}$$

Where $S_e$ = emotion score (1–5), $n_e$ = count of that emotion. Returns `null` if no moments.

### Personal Baseline

**`computeBaseline(aggregates)`**

Recency-weighted average of all day scores across the aggregate window:

$$\text{baseline} = \frac{\sum_{i=0}^{N-1} \text{dayScore}_i \times (i+1)}{\sum_{i=0}^{N-1} (i+1)}$$

Where index 0 is the oldest day (weight 1) and index N-1 is the newest (weight N). More recent days pull the baseline toward current state.

**Output:**
- `score` — The baseline number (1.0–5.0)
- `daysUsed` — How many days contributed
- `reliable` — `true` if `daysUsed ≥ 5`
- `label` — Human: `"generally calm/energized"` (≥4), `"balanced"` (≥3), `"tends toward tense"` (≥2), `"emotionally strained"` (<2)

### Recent Average

**`computeRecentAverage(aggregates)`**

Simple mean of day scores from the last 7 days (no recency weighting):

$$\text{recentAvg} = \frac{\sum \text{dayScore}_{\text{recent}}}{n_{\text{recent}}}$$

### Emotional Drift

**`computeDrift(baseline, recentAvg)`**

$$\text{drift} = \text{recentAverage} - \text{baselineScore}$$

Only computed when baseline is reliable and recent average exists.

**Drift labels:**

| Drift Value   | Label                      | Direction     |
|---------------|----------------------------|---------------|
| > +0.8        | "significantly improving"  | `improving`   |
| > +0.4        | "improving"                | `improving`   |
| > +0.15       | "slightly improving"       | `improving`   |
| +0.15 to -0.15| "stable"                  | `stable`      |
| > -0.4        | "slightly declining"       | `declining`   |
| > -0.8        | "declining"                | `declining`   |
| ≤ -0.8        | "significantly declining"  | `declining`   |

### Stability Score

**`computeStability(aggregates, baselineScore)`**

$$\text{stability} = \frac{\text{days within } \pm 0.5 \text{ of baseline}}{\text{total logged days}}$$

Requires ≥ 3 logged days. Value ranges 0.0–1.0.

**Labels:**

| Score  | Label                  |
|--------|------------------------|
| ≥ 0.8  | "very steady"          |
| ≥ 0.6  | "mostly steady"        |
| ≥ 0.4  | "moderate fluctuation"  |
| ≥ 0.2  | "frequent shifts"       |
| < 0.2  | "highly variable"       |

### Recovery Latency

**`computeRecoveryLatency(aggregates, baselineScore)`**

Tracks **dip episodes**: periods where the day score falls below `baselineScore - 0.4`. An episode ends when the day score returns to within `±0.5` of baseline.

$$\text{recoveryLatency} = \frac{\sum \text{episode durations (days)}}{\text{number of completed episodes}}$$

Unclosed episodes (user hasn't recovered yet) are excluded.

**Labels:**

| Days  | Label                             |
|-------|-----------------------------------|
| ≤ 1   | "bounces back quickly"            |
| ≤ 2   | "recovers within a couple of days"|
| ≤ 4   | "takes a few days to settle"      |
| > 4   | "slow to return to baseline"      |

### State of Mind

**`computeStateOfMind(drift, stability, volatility)`**

Composite qualitative label from drift, stability score, and volatility. Priority-ordered:

| Condition                                     | Label                                    |
|-----------------------------------------------|------------------------------------------|
| drift > +0.4 AND stability ≥ 0.6             | "grounded and improving"                 |
| drift > +0.4                                  | "improving with some ups and downs"      |
| drift < -0.4 AND stability < 0.4             | "unsettled — worth paying attention"      |
| drift < -0.4                                  | "below your usual — a temporary dip"     |
| stability ≥ 0.7                               | "steady — close to your normal"          |
| volatility > 1.2                              | "emotionally active — more range than usual" |
| default                                       | "holding steady with some variation"     |

### Daily Drift Timeline

**`computeDailyDrift(aggregates, baselineScore)`**

For each day in the last 7 days with logged data:

```
{ date, score, deviation: score - baselineScore }
```

### Full Output Shape

```js
{
  baseline:        { score, daysUsed, reliable, label },
  recentAverage:   number | null,
  drift:           { value, label, direction } | null,
  stability:       { score, label } | null,
  recoveryLatency: { days, label } | null,
  stateOfMind:     string | null,
  dailyDrift:      [{ date, score, deviation }]
}
```

---

## 6. Rule-Based Insight Generation

**File:** `backend/ai/generateInsight.js`

Called as `generateInsight(report)` where `report` is the full output of `generateWeeklyReport()`.

### Summary Generation

The summary text varies by confidence tier:

| Tier        | Strategy                                                                         |
|-------------|----------------------------------------------------------------------------------|
| `too_early` | Generic encouragement: "You're just getting started..."                          |
| `low`       | Mentions moment count and top trigger if any                                     |
| `emerging`  | References top trigger/emotion, first regulator, drift direction                 |
| `moderate`  | Includes top trigger, top friction zone with count, top regulator, state of mind |
| `strong`    | Full narrative: trigger, friction pattern with count, regulator, state of mind, recovery latency, volatility, trajectory |

After building the base text, two enrichment passes:
1. **Tag context** — If top tag appeared ≥ 2 times, appended: `Notably, "{tag}" came up {n} times.`
2. **Prediction context** — If gut check rate ≥ 0.6 or ≤ 0.3, adds a sentence.

### Micro-Experiment

A randomly selected, trigger-specific suggestion. 9 trigger categories with 3 options each. Examples:
- **work**: "Close your laptop at a fixed time one evening this week and notice the shift."
- **partner**: "Ask your partner one open-ended question and just listen."
- **health**: "Track one health habit for three days and note your mood alongside."

Not generated for `too_early` confidence.

### Structured Fields

| Field              | Type      | Description                                              |
|--------------------|-----------|----------------------------------------------------------|
| `summary`          | string    | Human-readable paragraph                                 |
| `microExperiment`  | string?   | "Try this week" suggestion                               |
| `whatWorking`      | array?    | Up to 3 regulator items + stability note if applicable   |
| `whereToFocus`     | array?    | Up to 3 friction items + drift/recovery notes            |
| `stateOfMind`      | string?   | From baseline engine                                     |
| `baselineSummary`  | string?   | "Your emotional baseline sits around {label}..."         |
| `confidence`       | string    | Tier label                                               |
| `model`            | string    | Always `"rule-based-v3"`                                 |
| `generatedAt`      | ISO date  | When generated                                           |

### What's Working (whatWorking)

Array of items:
- Top 3 regulators: `{ text, trigger, emotion, count }` — e.g. `{ text: "exercise tends to bring you calm", trigger: "exercise", emotion: "calm", count: 4 }`
- If volatility < 0.5: `{ text: "Your emotions have been pretty steady this week" }`
- If stability ≥ 0.7: `{ text: "You're consistently hovering near your emotional baseline" }`

### Where to Focus (whereToFocus)

Array of items:
- Top 3 friction zones: `{ text, trigger, emotion, count }`
- If drift is declining: `{ text: "Your emotional tone has dipped below your usual baseline this week" }`
- If recovery > 3 days: `{ text: "It's been taking a few days to bounce back..." }`

---

## 7. LLM Insight Generation

**File:** `backend/ai/generateLlmInsight.js`

Premium feature. Runs against a local OpenAI-compatible API (Ollama/llama.cpp/LM Studio).

### Signal Extraction

`buildSignals(report, recentNotes)` converts the structured report into a plain-text signal block for the LLM. Includes:

1. Moment count and days
2. Confidence level
3. Dominant trigger & emotion (or tied)
4. Top 3 regulators (positive pairings)
5. Top 3 friction zones (negative pairings)
6. Volatility score
7. Trajectory note
8. Busiest time of day
9. **Baseline data** (if reliable): baseline score, 7-day average, drift value + label, stability %, recovery latency, state of mind
10. Trigger diversity
11. Top 5 context tags
12. Prediction accuracy
13. Daily prediction vs reality comparisons
14. Recent user notes (up to 15, truncated to 120 chars each)

### System Prompt

Key instructions to the LLM:
- "You are a concise emotional pattern analyst"
- **Anti-negativity bias**: "Do not fabricate negative emotions, diagnoses, or weaknesses that are not explicitly present in the data. If the data shows calm, neutral, or positive emotions, reflect that honestly."
- No markdown, em dashes, bullet points, numbered lists

### User Prompt Structure

Forces exactly 3 sections with specific headers:
1. **What stood out** — Most notable pattern
2. **What may be contributing** — Possible cause connecting trigger–emotion pairing
3. **One thing to try** — Concrete micro-experiment

Word limit is configurable via `LLM_MAX_WORDS` env var (default 150). Temperature: 0.3.

### Post-Processing

Extensive cleanup pipeline:
1. Strip markdown artifacts (bold, headers, bullets, numbered lists)
2. Normalize smart quotes and em dashes
3. Strip prompt echo lines the model might repeat
4. Normalize variant section headers to canonical names
5. Strip preamble before first recognized header
6. Truncate after first complete 3-section set (prevent repetition)
7. Validate each section has ≥ 8 chars of content
8. Trim incomplete sentences at section boundaries
9. Requires ≥ 2 valid sections to accept output

### Retry Logic

Up to 5 attempts to get 3 valid sections. Keeps the best result across attempts.

### Output Shape

```js
{
  narrative:     string,   // Full cleaned text with 3 sections
  sectionCount:  number,   // 2 or 3
  model:         string,   // "llm-{modelName}"
  generatedAt:   ISO date
}
```

---

## 8. Weekly Report API Flow

**File:** `backend/pages/api/weeklyReport.js`

### Request Flow

```
GET /api/weeklyReport?deviceId=xxx
  (+ optional Bearer token for authenticated users)
```

### Data Fetching (parallel)

1. `getWeeklyAggregates(ownerId)` — 7-day aggregates
2. `getWeeklyAggregates(ownerId, 45)` — 45-day aggregates (for baseline)
3. `getSubscription(ownerId)` — subscription status
4. `getStoredLlmInsight(ownerId)` — cached LLM insight from Redis
5. `isFirstAiFreeAvailable(ownerId)` — first-free eligibility
6. `hasFreePass(ownerId)` — free pass check

### Report Assembly

1. `generateWeeklyReport({ aggregates, allAggregates })` — pattern engine builds the full report
2. If user has access to rule-based insights AND has moments → `generateInsight(report)` runs and attaches as `report.aiInsight`
3. LLM insight attached conditionally (see Access Tiers)

### Cron/Scheduled Jobs

**`generateWeeklyReports.js`** — Batch job to pre-compute and cache rule-based reports for all users:
- Runs per-owner with concurrency of 5
- Skips if last generation was within 7 days (unless `--force`)
- Stores in Redis: summary, micro-experiment, confidence, baseline fields (score, drift, stability, recovery)

**`generateLlmInsights.js`** — Batch job for LLM insights:
- Runs per-owner, sequential
- Skips if last generation was within 3 days
- Fetches recent notes (up to 15) for LLM context
- Up to 5 retry attempts per user
- Stores in Redis as `llmInsight:{ownerId}`
- Can be filtered to specific users via `LLM_OWNER_IDS` env var

---

## 9. Insights Screen Rendering

**File:** `mobile/screens/WeeklyReportScreen.js`

### Screen Architecture

The Insights screen is a scrollable view with a shared header, a 3-tab pill selector, and conditional content.

```
ScreenShell (loading state, retry, background glow)
└── Canvas
    ├── Background Image (report-bg.png, 5% opacity)
    ├── Hero Header (always visible)
    ├── Error State (if API fails)
    ├── Starter State (if confidence = "too_early")
    └── Main Content (if confidence > "too_early")
        ├── TabBar (3 pills)
        └── [SummaryTab | PatternsTab | AnalyticsTab]
```

### Hero Header (always visible when report exists)

| Element          | Data Source                       | Rendering                                      |
|------------------|-----------------------------------|-------------------------------------------------|
| Kicker           | Static: "Weekly patterns"          | Accent colored uppercase text                   |
| Title            | Static: "Your Week"               | Large bold text                                 |
| Subtitle         | `report.totalMoments`, `dq.daysLogged` | "{N} moments across {D} days"            |
| Emotion pill     | `report.topEmotion`               | Emoji + emotion name, colored by emotion        |
| Trigger pill     | `report.topTrigger` or tied count | 🎯 + trigger name, colored by trigger           |
| Confidence pill  | `dq.confidence`                   | Maps to: "Just getting started" / "Early patterns" / "Taking shape" / "Solid picture" / "High confidence" |

### Tab Bar

Three pills: **📊 Your Week** | **🧩 Patterns** | **📈 Analytics**

---

### Tab 1: Your Week (SummaryTab)

Rendered top-to-bottom in this order:

#### 1. State of Mind Hero Card
- **Shows when:** `baselineMetrics.stateOfMind` exists
- **Data:** `bm.stateOfMind` (label), `bm.drift.direction` (sub-text)
- **Visual:** Accent-bordered card with "HOW YOU'RE DOING" kicker
- **Sub-text logic:**
  - `stable` → "Tracking close to your personal baseline."
  - `improving` → "Trending a bit better than your usual."
  - `declining` → "A bit below your usual — temporary dips are normal."

#### 2. Human Summary Card
- **Shows when:** `report.aiInsight.summary` exists
- **Data:** Rule-based summary text
- **Visual:** Card with accent left border, plain text

#### 3. What's Working (NarrativeCard)
- **Shows when:** `aiInsight.whatWorking` has items, OR `report.regulators` has items
- **Data:** Array of `{ trigger, emotion, count }` items
- **Visual:** 🌿 icon, green left border. Each item rendered as: `"{Trigger} brings you {emotion} ({count}×)"`

#### 4. Worth Noticing (NarrativeCard)
- **Shows when:** `aiInsight.whereToFocus` has items, OR `report.frictionZones` has items
- **Data:** Array of friction zone items
- **Visual:** 🔥 icon, red left border. Each item: `"{Trigger} tends to leave you {emotion} ({count}×)"`

#### 5. Try This Week (Experiment Card)
- **Shows when:** `aiInsight.microExperiment` exists
- **Data:** Micro-experiment text
- **Visual:** Card with green left border, "Try this week" pill label

#### 6. LLM Insight Section
Conditional rendering based on user tier (see Access Tiers). Possible states:

| User State            | What Renders                                                              |
|-----------------------|---------------------------------------------------------------------------|
| Anonymous             | "Unlock personalised insights" + Sign in button                           |
| Premium + has insight | 3 InsightCards: 🔍 What stood out, 🧩 What may be contributing, 💡 One thing to try. Each parsed from the LLM narrative. Shows "Updated X days ago" footer. |
| Premium + no insight  | "Your insight is on its way" spinner state                                |
| Free + first-free/pass| All 3 InsightCards shown + "Free preview" label + "Future insights require Premium" hint |
| Free + teaser         | Truncated first section with fade gradient + "See the full picture" CTA   |
| Free + enough data    | "Your insight is ready to unlock" + Upgrade button                        |
| Free + not enough     | "Building your insight — log {N} more moments"                            |

**InsightCard component:** Animated slide-in card with colored left border. Each card has an icon, uppercase label, and body text. Colors: What stood out = accent, Contributing = purple, Try = green.

---

### Tab 2: Patterns (PatternsTab)

#### 1. Your Baseline
- **Shows when:** `bm.baseline.reliable` is true (OR shows "still learning" placeholder)
- **Data:** Baseline score (/5), recent average (/5), drift label, stability label, recovery label, days used
- **Visual:** Two-column stat layout. Scores colored: green (≥ 3.5), yellow (≥ 2.5), red (< 2.5)
- **Explainer:** "Your baseline is learned from {N} days of logging..."

#### 2. Drift from Baseline (Timeline)
- **Shows when:** `bm.dailyDrift` has ≥ 2 entries
- **Data:** Array of `{ date, deviation }` for last 7 days
- **Visual:** Horizontal scrolling day cards. Each shows `+0.3` / `-0.5` colored green/red/muted. Day name below.
- **Hint text:** "How your daily emotional tone compared to your personal baseline."

#### 3. Emotional Loops
- **Shows when:** Regulators or friction zones exist
- **Components:** Two NarrativeCards — "Friction zones" (🔥) and "What helps" (🌿)

#### 4. Trigger → Emotion Correlations
- **Shows when:** Signed in AND `hasEnoughForPairings` AND correlations exist
- **Gated:** Locked behind sign-in for anonymous users
- **Data:** Top 5 triggers, each showing up to 3 emotion chips with counts
- **Visual:** Each trigger name colored by trigger color. Emotion chips with tinted backgrounds: `{emoji} {emotion} ×{count}`

#### 5. Stability
- **Shows when:** `hasEnoughForStability` is true
- **Data:** `volatilityLabel`, `volatilityScore`, `mostStableDay`
- **Visual:** Two metric cards side by side
  - "Day-to-day shifts" — label colored by severity
  - "Steadiest day" — formatted date

#### 6. Emotional Tone (Trajectory)
- **Shows when:** `weeklyEmotionTrajectory` has ≥ 1 entry
- **Data:** Day-by-day score mapped through `scoreTone()`:
  - ≥ 4.2 → 🌟 Great (purple)
  - ≥ 3.5 → 😌 Good (green)
  - ≥ 2.8 → 😐 Mixed (grey)
  - ≥ 2.0 → 😟 Uneasy (orange)
  - < 2.0 → 😤 Tough (red)
- **Visual:** Horizontal scrolling day cards with emoji, label, and day name
- **Includes:** `trajectoryNote` if available

---

### Tab 3: Analytics (AnalyticsTab)

#### 1. Emotions Breakdown
- **Data:** Top 5 emotions from `emotionFrequency`
- **Visual:** Horizontal bar chart (`HBar` component). Bar color matches emotion color. Top entry highlighted.

#### 2. Triggers Breakdown
- **Data:** Top 9 triggers from `triggerFrequency`
- **Visual:** Horizontal bar chart. Bar color matches trigger color.

#### 3. When You Logged
- **Shows when:** `hasEnoughForRhythm` AND time entries exist
- **Data:** `timeOfDayPatterns`
- **Visual:** Horizontal bars with time-of-day icons (🌅 morning, ☀️ afternoon, 🌆 evening, 🌙 night)

#### 4. Energy Flow
- **Shows when:** Signed in AND energy entries exist
- **Data:** `energyDistribution` — steady/balanced/tense/drained/uplifted counts
- **Visual:** Horizontal bars. Colors: steady=green, balanced=accent, tense=orange, drained=red, uplifted=purple

#### 5. Gut Check (Prediction Accuracy)
- **Shows when:** `predictionAccuracy` exists
- **Data:** `correct` / `daysCompared`, `rate`
- **Visual:** Large emoji (🎯 if ≥ 50%, 🔮 otherwise) + title + descriptive copy based on rate tier

#### 6. Baseline Details
- **Shows when:** `bm.baseline.reliable` is true
- **Data:** Baseline score, 7-day average, drift value (colored), stability %, recovery days, days used
- **Visual:** 3-column grid of stats

---

## 10. Access Tiers & Gating

### What Each Tier Sees

| Feature                  | Anonymous | Free (signed in)   | Premium           |
|--------------------------|-----------|--------------------|--------------------|
| Pattern engine report    | ✅        | ✅                 | ✅                 |
| Rule-based insight       | ❌        | ✅                 | ✅                 |
| Micro-experiment         | ❌        | ✅                 | ✅                 |
| What's working / Focus   | ❌        | ✅                 | ✅                 |
| Baseline & drift         | ✅        | ✅                 | ✅                 |
| Correlations             | ❌ (locked)| ✅                | ✅                 |
| Stability                | ❌ (locked)| ✅                | ✅                 |
| Trajectory               | ❌ (locked)| ✅                | ✅                 |
| LLM insight (full)       | ❌        | First-free or pass | ✅                 |
| LLM insight (teaser)     | ❌        | ✅ (truncated)     | N/A                |
| Analytics tab (full)     | ✅        | ✅                 | ✅                 |

### LLM Insight Gating Logic

1. **Premium** → full `llmInsight` with all 3 sections
2. **Free + first-free available** → full insight, flagged `firstFree: true`, marks first-free as used
3. **Free + free pass** → full insight, flagged `freePass: true` (pass auto-expires via Redis TTL)
4. **Free (signed in, no pass)** → `llmTeaser` with first section only + fade gradient + upgrade CTA
5. **Anonymous** → nothing, sign-in prompt

---

*Generated from source code as of v73. Files: `baselineEngine.js`, `patternEngine.js`, `generateInsight.js`, `generateLlmInsight.js`, `weeklyReport.js`, `aggregationService.js`, `WeeklyReportScreen.js`.*
