# TriggerMap — Behavioral Model, Variable Calculations & Insights Rendering

> Complete technical reference for how TriggerMap models emotional behavior, generates reports, and renders the Insights screen.

---

## Table of Contents

1. [Data Foundation](#1-data-foundation)
2. [Emotion Scoring Model](#2-emotion-scoring-model)
3. [Daily Aggregation](#3-daily-aggregation)
4. [Pattern Engine (patternEngine.js)](#4-pattern-engine)
5. [Baseline Engine (baselineEngine.js)](#5-baseline-engine)
6. [Action Engine (actionEngine.js)](#6-action-engine)
7. [Rule-Based Insight Generation (generateInsight.js)](#7-rule-based-insight-generation)
8. [LLM Insight Generation (generateLlmInsight.js)](#8-llm-insight-generation)
9. [Weekly Report API Flow](#9-weekly-report-api-flow)
10. [Insights Screen Rendering (WeeklyReportScreen.js)](#10-insights-screen-rendering)
11. [Access Tiers & Gating](#11-access-tiers--gating)
12. [Text Polish & Personalization (v80–v84)](#12-text-polish--personalization-v80v84)
13. [Continuity Layer — Recurrence, Streaks & Baseline Language (v81)](#13-continuity-layer--recurrence-streaks--baseline-language-v81)
14. [Text Quality Hardening (v82–v84)](#14-text-quality-hardening-v82v84)

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

`generateWeeklyReport({ aggregates, allAggregates, previousAggregates })` — the core analysis function. Takes 7-day aggregates, optionally 45-day for baseline, and optionally the previous week's aggregates (days 8–14 ago) for delta comparisons.

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

#### Weekly Deltas (v78)

**`computeWeeklyDeltas(currentFreqs, previousAggregates)`** — Compares this week's frequency maps against the previous week (days 8–14 ago). Returns `null` if no previous data.

**`weeklyDeltas` output:**

| Field                | Type   | Description                                       |
|----------------------|--------|---------------------------------------------------|
| `totalMomentsDelta`  | number | Change in total moments vs last week              |
| `previousTotal`      | number | Last week's total moment count                    |
| `triggerDeltas`      | object | `{ [trigger]: { current, previous, delta } }` — only changed triggers |
| `emotionDeltas`      | object | `{ [emotion]: { current, previous, delta } }` — only changed emotions |

**`computeFrequencyDeltas(current, previous)`** — Generic comparator for two frequency maps. Returns per-key `{ current, previous, delta }` for keys that changed.

#### Change Highlights (v78)

**`buildChangeHighlights(deltas, report)`** — Generates up to 3 human-readable highlight sentences:

1. Total moments compared to last week ("You logged N more/fewer moments than last week")
2. Biggest trigger change ("work appeared N more times" / "travel dropped by N")
3. Biggest emotion change ("You felt calm N more times" / "frustrated showed up N fewer times")

Only computed when `weeklyDeltas` is available.

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
  dailyDrift:      [{ date, score, deviation }],
  baselineDeltas:  { deltaDrift, deltaStability, previousDrift, previousStability, previousRecentAverage } | null,
}
```

### Baseline Deltas (v78)

Computed when `aggregates.length >= 14` and drift is available. Compares the current 7-day window against the **previous 7-day window** (days 8–14 ago):

| Field                    | Type         | Description                                               |
|--------------------------|--------------|-----------------------------------------------------------|
| `deltaDrift`             | number       | This week's drift minus last week's drift                 |
| `deltaStability`         | number\|null | This week's stability minus last week's stability         |
| `previousDrift`          | number       | Last week's drift value                                   |
| `previousStability`      | number\|null | Last week's stability score                               |
| `previousRecentAverage`  | number       | Last week's 7-day average emotion score                   |

Used by the MirrorTab's `DeltaChip` arrows (↑/↓) to indicate week-over-week direction for State of Mind and Stability.

---

## 6. Action Engine

**File:** `backend/services/actionEngine.js`

`generateActions(report)` — Rule-based engine that produces 3–5 contextual behavioral actions from the full weekly report. **Requires ≥ 3 moments** (returns empty array below that).

### Thresholds

| Feature          | Moments Required |
|------------------|:----------------:|
| Actions          | **3**            |
| LLM Insights     | **5**            |

### Action Meta

Maps action types to display metadata:

| Type         | Icon | Label        |
|--------------|------|--------------|
| `regulate`   | 🌿   | "Try this"   |
| `awareness`  | 👁️   | "Notice"     |
| `experiment` | 🧪   | "Experiment" |

### Primary Strategies (1–5, evaluated in order)

These fire when strong patterns (friction zones, regulators, drift, deltas) are present:

| # | Strategy                       | Type         | Input Fields Used                                        |
|---|--------------------------------|--------------|----------------------------------------------------------|
| 1 | Friction + Regulator pairing   | `regulate`   | `frictionZones[0]`, `regulators[0]`                      |
| 2 | Repeated uncountered friction  | `awareness`  | `frictionZones[1]`                                        |
| 3 | Drift-based check-in           | `awareness`  | `baselineMetrics.drift.direction === 'declining'`         |
| 4 | Rising trigger alert           | `awareness`  | `weeklyDeltas.triggerDeltas` (triggers with `delta >= 2`) |
| 5 | Stability reinforcement        | `regulate`   | `regulators` (≥2) and drift not declining                 |

### Fallback Strategies (6–9)

Fire when primary strategies produce nothing — ensures users with 3+ moments always see actions, even with sparse or neutral data:

| # | Strategy                       | Type         | Fires When                          | Input Fields Used           |
|---|--------------------------------|--------------|-------------------------------------|-----------------------------|
| 6 | Top-pair awareness             | `awareness`  | 0 actions so far                    | `topPair`                   |
| 7 | Dominant trigger check-in      | `awareness`  | < 2 actions                         | `topTrigger`                |
| 8 | Variety experiment             | `experiment` | < 3 actions AND ≤ 3 unique triggers | `dataQuality.uniqueTriggers`|
| 9 | Logging consistency            | `experiment` | < 3 actions AND < 4 days logged     | `dataQuality.daysLogged`    |

### Action Object Shape

```js
{
  id:       string,    // Unique identifier
  type:     string,    // 'regulate' | 'awareness' | 'experiment'
  title:    string,    // Human-readable action title
  reason:   string,    // Why this action was suggested
  trigger:  string?,   // Related trigger (if applicable)
  emotion:  string?,   // Related emotion (if applicable)
  icon:     string,    // Emoji icon from ACTION_META
  category: string,    // Display label from ACTION_META
  order:    number,    // Position in the action list
}
```

### HiTL Feedback Loop

Users respond to each action with **tried** or **skipped**. Feedback is stored via `POST /api/actions` with `{ actionId, response }` and persisted in Redis (`RPUSH`, 90-day TTL). Feedback data feeds back into:

1. **Ops console** — Action Engine (HiTL) metrics panel shows tried/skipped counts.
2. **LLM insight generation** — `buildSignals()` includes action feedback so the LLM can tailor "One thing to try" based on what the user engaged with or skipped. This closes the HiTL loop: actions → feedback → personalized LLM suggestions.

---

## 7. Rule-Based Insight Generation

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

## 8. LLM Insight Generation

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
15. **Action feedback** — lists of action IDs the user tried or skipped (closes the HiTL loop)

### System Prompt

Key instructions to the LLM:
- "You are a concise emotional pattern analyst"
- **Anti-negativity bias**: "Do not fabricate negative emotions, diagnoses, or weaknesses that are not explicitly present in the data. If the data shows calm, neutral, or positive emotions, reflect that honestly."
- No markdown, em dashes, bullet points, numbered lists
- If action feedback is provided, acknowledge what the user tried and avoid re-suggesting things they skipped

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

## 9. Weekly Report API Flow

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
7. `getActionFeedback(ownerId)` — stored HiTL action responses (tried/skipped)

### Report Assembly

1. Compute `previousAggregates` from `allAggregates.slice(-14, -7)` (previous week) if ≥ 14 days available
2. `generateWeeklyReport({ aggregates, allAggregates, previousAggregates })` — pattern engine builds the full report with deltas and change highlights
3. If user has access to rule-based insights AND has moments → `generateInsight(report)` runs and attaches as `report.aiInsight`
4. `generateActions(report)` — action engine produces 3–5 contextual actions, attached as `report.actions`
5. `actionFeedback` attached to response for the ActionsTab's feedback state
6. LLM insight attached conditionally (see Access Tiers)

### Cron/Scheduled Jobs

**`generateWeeklyReports.js`** — Batch job to pre-compute and cache rule-based reports for all users:
- Runs per-owner with concurrency of 5
- Skips if last generation was within 7 days (unless `--force`)
- Now also runs `generateActions(report)` and stores action metadata (count, types)
- Passes `previousAggregates` for delta computation
- Stores in Redis: summary, micro-experiment, confidence, baseline fields (score, drift, stability, recovery), actionsCount, actionTypes, hasDeltaData, changeHighlightsCount

**`generateLlmInsights.js`** — Batch job for LLM insights:
- Runs per-owner, sequential
- Skips if last generation was within 3 days
- Fetches recent notes (up to 15) for LLM context
- Up to 5 retry attempts per user
- Stores in Redis as `llmInsight:{ownerId}`
- Can be filtered to specific users via `LLM_OWNER_IDS` env var

---

## 10. Insights Screen Rendering

**File:** `mobile/screens/WeeklyReportScreen.js`

### Screen Architecture

The Insights screen is a scrollable view with a shared header, a **4-tab pill selector**, and conditional content.

```
ScreenShell (loading state, retry, background glow)
└── Canvas
    ├── Background Image (report-bg.png, 5% opacity)
    ├── Hero Header (always visible)
    ├── Error State (if API fails)
    ├── Starter State (if confidence = "too_early")
    └── Main Content (if confidence > "too_early")
        ├── TabBar (4 pills)
        └── [MirrorTab | ThisWeekTab | ActionsTab | PremiumTab]
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

Four pills: **🪞 Mirror** | **📊 This Week** | **⚡ Actions** | **✨ Premium**

Default tab: `"mirror"`.

### Shared Sub-Components

| Component         | Description                                                        |
|-------------------|--------------------------------------------------------------------|
| `DeltaChip`       | Shows ↑/↓ colored chip for week-over-week changes. Props: `value`, `label`, `inverted`. Green for positive, red for negative. |
| `TabBar`          | Pill-style tab selector with active highlight                      |
| `AnimatedSection` | Fade-in + slide-up wrapper with configurable stagger delay         |
| `NarrativeCard`   | Pattern card showing trigger→emotion pair items with icon and colored border |
| `LockedSection`   | Gradient overlay + lock icon + CTA for gated content               |
| `InsightCard`     | Parsed LLM insight section card with colored left border           |
| `SectionHeader`   | Section title with optional LIVE/WEEKLY badge                      |
| `HBar`            | Horizontal frequency bar chart with colored fills                  |

---

### Tab 1: Mirror (MirrorTab) — Persistent identity view

The "who you are" tab — shows stable patterns and baselines that persist across weeks.

#### 1. State of Mind Hero Card
- **Shows when:** `baselineMetrics.stateOfMind` exists
- **Data:** `bm.stateOfMind` (label), `bm.drift.direction` (sub-text)
- **Visual:** Accent-bordered card with "HOW YOU'RE DOING" kicker
- **Delta:** `DeltaChip` showing `baselineDeltas.deltaDrift` (↑/↓ vs last week)
- **Sub-text logic:**
  - `stable` → "Tracking close to your personal baseline."
  - `improving` → "Trending a bit better than your usual."
  - `declining` → "A bit below your usual — temporary dips are normal."

#### 2. Core Patterns (NarrativeCards)
- **Shows when:** Regulators or friction zones exist
- **Components:** Two NarrativeCards:
  - "What helps" (🌿, green border) — regulator pairs: `"{Trigger} brings you {emotion} ({count}×)"`
  - "Friction zones" (🔥, red border) — friction pairs: `"{Trigger} tends to leave you {emotion} ({count}×)"`

#### 3. Stability & Recovery
- **Shows when:** `baselineMetrics.stability` exists
- **Data:** Stability label, recovery latency label
- **Delta:** `DeltaChip` showing `baselineDeltas.deltaStability` (↑/↓ vs last week)

#### 4. Change Highlights
- **Shows when:** `changeHighlights` array has items
- **Data:** Up to 3 human-readable sentences from `buildChangeHighlights()`
- **Visual:** Bullet list with highlight icon

#### 5. Confidence Badge
- **Shows when:** Always (when report exists)
- **Data:** `dataQuality.totalMoments`, `dq.daysLogged`

---

### Tab 2: This Week (ThisWeekTab) — Temporal data

The "what happened" tab — shows this week's specific data, charts, and weekly summary.

#### 1. Weekly Summary Card
- **Shows when:** `aiInsight.summary` exists
- **Data:** Rule-based summary text
- **Visual:** Card with accent left border, plain text
- **Delta:** Shows `weeklyDeltas.totalMomentsDelta` beneath card (e.g., "+3 vs last week")

#### 2. Emotional Tone (Trajectory)
- **Shows when:** `weeklyEmotionTrajectory` has ≥ 1 entry
- **Data:** Day-by-day score mapped through `scoreTone()`:
  - ≥ 4.2 → 🌟 Great (purple)
  - ≥ 3.5 → 😌 Good (green)
  - ≥ 2.8 → 😐 Mixed (grey)
  - ≥ 2.0 → 😟 Uneasy (orange)
  - < 2.0 → 😤 Tough (red)
- **Visual:** Horizontal scrolling day cards with emoji, label, and day name
- **Includes:** `trajectoryNote` if available

#### 3. Drift from Baseline (Timeline)
- **Shows when:** `bm.dailyDrift` has ≥ 2 entries
- **Data:** Array of `{ date, deviation }` for last 7 days
- **Visual:** Horizontal scrolling day cards. Each shows `+0.3` / `-0.5` colored green/red/muted. Day name below.

#### 4. Emotions Breakdown
- **Data:** Top 5 emotions from `emotionFrequency`
- **Visual:** Horizontal bar chart (`HBar`). Bar color matches emotion color.

#### 5. Triggers Breakdown
- **Data:** Top 9 triggers from `triggerFrequency`
- **Visual:** Horizontal bar chart. Bar color matches trigger color.

#### 6. When You Logged
- **Shows when:** `hasEnoughForRhythm` AND time entries exist
- **Data:** `timeOfDayPatterns`
- **Visual:** Horizontal bars with time-of-day icons (🌅 morning, ☀️ afternoon, 🌆 evening, 🌙 night)

#### 7. Trigger → Emotion Correlations
- **Shows when:** Signed in AND `hasEnoughForPairings` AND correlations exist
- **Gated:** Locked behind sign-in for anonymous users
- **Data:** Top 5 triggers, each showing up to 3 emotion chips with counts

#### 8. Gut Check (Prediction Accuracy)
- **Shows when:** `predictionAccuracy` exists
- **Data:** `correct` / `daysCompared`, `rate`
- **Visual:** Large emoji (🎯 if ≥ 50%, 🔮 otherwise) + descriptive copy

#### 9. Try This Week (Experiment Card)
- **Shows when:** `aiInsight.microExperiment` exists
- **Data:** Micro-experiment text
- **Visual:** Card with green left border, "Try this week" pill label

---

### Tab 3: Actions (ActionsTab) — **NEW in v78**

The "what to do" tab — surfaces contextual behavioral actions from the Action Engine with a human-in-the-loop feedback mechanism.

#### Action Cards
- **Shows when:** `report.actions` has items
- **Data:** Array of action objects from `generateActions(report)`
- **Each card shows:**
  - Icon (from `ACTION_META`)
  - Category label (Try this / Notice / Experiment)
  - Title (human-readable action)
  - Reason (why this action was suggested)
- **Feedback buttons:** "👍 Tried it" / "👎 Skip"
  - Calls `submitActionFeedback(actionId, response, deviceId, token)` on tap
  - Tracks `action_feedback` analytics event
  - Disabled once feedback is submitted for that action (from `report.actionFeedback`)

#### Empty State
- **Shows when:** No actions available (insufficient data)
- **Visual:** Encouragement to log more moments

---

### Tab 4: Premium (PremiumTab) — Deep learning / paywall

The "deeper insights" tab — premium-oriented content including behaviour profiles, action effectiveness, and LLM narratives.

#### 1. What Works For You
- **Shows when:** Regulators exist
- **Data:** Regulator pairs with effect sizes (count-based)
- **Visual:** Effect rows showing trigger→emotion with strength indicator

#### 2. Behaviour Profile
- **Shows when:** `baselineMetrics.baseline.reliable` is true
- **Data:** Chips for baseline label, stability label, recovery label, volatility label
- **Visual:** Horizontal chip row with colored badges

#### 3. Action Effectiveness
- **Shows when:** Any action feedback exists
- **Data:** Tried/skipped counts from `actionFeedback`
- **Visual:** Summary with tried vs skipped breakdown

#### 4. Baseline Details
- **Shows when:** `bm.baseline.reliable` is true
- **Data:** Baseline score (/5), 7-day average, drift value (colored), stability %, recovery days, days used
- **Visual:** 3-column grid of stats

#### 5. Personal Insight (LLM)
Conditional rendering based on user tier:

| User State            | What Renders                                                              |
|-----------------------|---------------------------------------------------------------------------|
| Anonymous             | `LockedSection` — "Unlock personalised insights" + Sign in button         |
| Premium + has insight | 3 InsightCards: 🔍 What stood out, 🧩 What may be contributing, 💡 One thing to try. Shows "Updated X days ago" footer. |
| Premium + no insight  | "Your insight is on its way" spinner state                                |
| Free + first-free/pass| All 3 InsightCards shown + "Free preview" label + "Future insights require Premium" hint |
| Free + teaser         | Truncated first section with fade gradient + "See the full picture" CTA   |
| Free + enough data    | "Your insight is ready to unlock" + Upgrade button                        |
| Free + not enough     | "Building your insight — log {N} more moments"                            |

---

## 11. Access Tiers & Gating

### What Each Tier Sees

| Feature                  | Anonymous | Free (signed in)   | Premium           |
|--------------------------|-----------|--------------------|--------------------|
| Pattern engine report    | ✅        | ✅                 | ✅                 |
| Rule-based insight       | ❌        | ✅                 | ✅                 |
| Micro-experiment         | ❌        | ✅                 | ✅                 |
| What's working / Focus   | ❌        | ✅                 | ✅                 |
| Baseline & drift         | ✅        | ✅                 | ✅                 |
| Weekly deltas & highlights| ✅       | ✅                 | ✅                 |
| Action cards (ActionsTab)| ✅        | ✅                 | ✅                 |
| Action feedback (HiTL)  | ❌        | ✅                 | ✅                 |
| Correlations             | ❌ (locked)| ✅                | ✅                 |
| Stability                | ❌ (locked)| ✅                | ✅                 |
| Trajectory               | ❌ (locked)| ✅                | ✅                 |
| Behaviour profile        | ❌        | ❌                 | ✅                 |
| Action effectiveness     | ❌        | ❌                 | ✅                 |
| LLM insight (full)       | ❌        | First-free or pass | ✅                 |
| LLM insight (teaser)     | ❌        | ✅ (truncated)     | N/A                |

### LLM Insight Gating Logic

1. **Premium** → full `llmInsight` with all 3 sections
2. **Free + first-free available** → full insight, flagged `firstFree: true`, marks first-free as used
3. **Free + free pass** → full insight, flagged `freePass: true` (pass auto-expires via Redis TTL)
4. **Free (signed in, no pass)** → `llmTeaser` with first section only + fade gradient + upgrade CTA
5. **Anonymous** → nothing, sign-in prompt

---

## 12. Text Polish & Personalization (v80–v84)

### Phrasing Layer (`backend/utils/phrasingLayer.js`)

Deterministic local text polisher that runs on every user-facing text path. Fixes encoding artifacts, smart quotes, stray markdown formatting, and spacing issues without calling any external API.

| Property | Value |
|----------|-------|
| Function | `localPolish()` — regex-based cleanup |
| Fallback | Returns original text unchanged on any failure |
| Request path? | **Yes** — runs on live API + batch jobs |

**What it cleans:**
- Em/en dashes → hyphens
- Smart quotes → straight quotes
- Zero-width/control characters → removed
- Markdown bold, headers, bullet markers → stripped
- Double spaces, excess newlines, double periods → collapsed
- Punctuation spacing issues → fixed

### First-Name Personalization

`extractFirstName(displayName)` takes the user's Google `name` field (stored at sign-in) and returns the first word (≥ 2 chars).

**Where text polish + personalization runs:**

| Path | What gets polished |
|------|--------------------|
| `weeklyReport.js` (live API) | `summary`, each `action.reason` |
| `generateWeeklyReports.js` (batch) | `insight.summary`, each `action.reason` |
| `generateLlmInsights.js` (batch) | Each narrative section body (preserves headers) |

### LLM Summary Rewrite (`backend/jobs/rewriteSummaries.js`) — v84

Optional ops-console job that rewrites stored rule-based summaries using a local Ollama model. Separate from the default text polish path.

| Property | Value |
|----------|-------|
| Source | Local worker (Ollama) |
| Models | `mistral`, `phi3`, `llama3`, `llama2`, `gemma`, `qwen2` |
| Timeout | 15s per rewrite |
| Fallback | Returns original text on any failure |
| Skips | Users with no stored report, or already-rewritten (unless `--force`) |
| Metadata | Stores `rewrittenBy` (model name) and `rewrittenAt` on the report |

Accessible from the ops console as **"Rewrite Summaries (LLM)"** with model picker and user picker.

### Premium Branding

- `weeklyReport.js` API strips `report.llmInsight.model` and `report.llmTeaser.model` before responding (prevents model name leakage)
- Mobile footer changed from `{model} · {date}` to `Generated by QuietDen · {date}`

### Push Notification Validation

Existing push infrastructure (`push-token.js`, `send-push.js`, Expo Push API) was extended with an ops console **"Send Test Notification"** panel:
- Title / body inputs
- User picker (reuses eligible-users infrastructure)
- Calls backend `send-push` endpoint
- Results logged to run log

---

## 13. Continuity Layer — Recurrence, Streaks & Baseline Language (v81)

### Recurrence Detection (`patternEngine.js`)

Detects repeated trigger–emotion pairs within the current 7-day window:

| Count | Classification |
|-------|---------------|
| ≥ 3   | `recurring`   |
| 2     | `emerging`    |

Top 3 pairs exposed as `report.recurrence[]` — each entry: `{ trigger, emotion, count, label }`.

### Streak Detection (`patternEngine.js`)

Uses the existing `weeklyEmotionTrajectory` array to find consecutive-day runs:

| Type | Threshold | Output |
|------|-----------|--------|
| Positive streak | score > 3.5 for ≥ 2 consecutive days | `report.positiveStreak: { days, startDate }` |
| Negative streak | score < 2.5 for ≥ 2 consecutive days | `report.negativeStreak: { days, startDate }` |

Purely derived — no Redis storage, no historical lookback beyond the 7-day window.

### Baseline Context Flags (`patternEngine.js`)

Exposes already-computed baseline signals in a flat consumable shape:

```js
report.baselineContext = {
  driftDirection: "improving" | "declining" | "stable",
  stabilityLevel: "very steady" | "mostly steady" | ... | null,
  recoveryLabel: "bounces back quickly" | ... | null,
}
```

### Insight Language Upgrades (`generateInsight.js`)

Three additive enrichments wired into the moderate and strong summary builders:

1. **Recurrence language** — When the top friction zone or pair is also a recurrence, appends: "This pattern has come up a few times this week." (recurring) or "This showed up more than once this week." (emerging).

2. **Baseline-aware language** — Uses `baselineContext.driftDirection` to add relative phrasing (max once per summary): "slightly better than your usual pattern" / "a bit below your usual pattern" / "fairly consistent with your usual pattern".

3. **Streak language** — If a meaningful streak exists (≥ 2 days), adds: "You had a N-day stretch of lower energy before recovering." or "You maintained a steady stretch of higher energy for N days."

### LLM Signal Alignment (`generateLlmInsight.js`)

Two new signal lines added to `buildSignals()`:
- `Recurring patterns this week: work + anxious (3x, recurring); family + frustrated (2x, emerging).`
- `Positive streak: 3 consecutive days of higher energy.` / `Low stretch: 2 consecutive days of lower energy.`

Anti-negativity bias strengthened in system prompt: added explicit instructions to default to supportive tone, emphasize resilience, and reflect positive data positively.

### UI Changes (`WeeklyReportScreen.js`)

- **This Week tab → Trajectory section**: Small inline note under the day cards when a streak exists, e.g., "3-day low stretch mid-week" or "3-day high-energy stretch".
- No new components, no layout shifts.

### Ops Console (`control.js`)

Per-user report rows now show:
- **↻** Top recurrence (yellow, e.g., `↻ work+anxious (3x, recurring)`)
- **↓/↑** Streak indicator (red for negative, green for positive, e.g., `2d↓` or `3d↑`)

---

## 14. Text Quality Hardening (v82–v84)

### Em Dash Sanitization (v82)

Source-level fixes across 15+ instances in `baselineEngine.js`, `generateInsight.js`, `actionEngine.js` removed em/en dashes at generation time. API boundary guard `sanitizeDeep()` in `sanitizeOutput.js` recursively walks any response object and replaces remaining dashes.

### HF Phrasing Layer — Added then Removed (v83–v84)

The HF phrasing layer (`phrasingLayer.js`) was introduced in v80 as a post-processing step using `google/gemma-2b-it`. It was degrading text quality — introducing grammar mistakes, random characters, and typos. After adding quality gates (v83-a) and making it opt-in (v83-b), HF was **fully removed in v84**. The `HF_TOKEN` env var, `hfPolish()` function, quality gate, and all `useHf` flags have been deleted.

### Local Deterministic Polish (v83-b → v84)

`phrasingLayer.js` now contains only `localPolish()` — deterministic regex cleanup that runs on **all** text paths (live API + batch). See Section 12 for details.

### LLM Summary Rewrite (v84)

New ops-console job **"Rewrite Summaries (LLM)"** allows rewriting stored rule-based summaries using a local Ollama model (with model and user selection). This replaces HF as the optional AI rewrite path, but uses a reliable local model instead of a free API. See Section 12 for details.

### Expanded `sanitizeDeep` (v83)

Now also strips: smart quotes, zero-width characters, control characters, stray bold/header/bullet markers, collapses double spaces and excess newlines. Applied at API boundary on every response.

### Mobile `cleanText` (v83)

Expanded to match backend sanitization: strips smart quotes, zero-width/control chars, bold markers, header markers, bullet markers, double spaces.

### Footer Fix (v83)

"Generated by QuietDen" footer was missing from the fallback LLM render path (when `parseLlmSections()` returned null). Now shown in all LLM insight rendering paths.

---

*Generated from source code as of v84. Files: `baselineEngine.js`, `patternEngine.js`, `actionEngine.js`, `generateInsight.js`, `generateLlmInsight.js`, `weeklyReport.js`, `aggregationService.js`, `WeeklyReportScreen.js`, `phrasingLayer.js`, `sanitizeOutput.js`, `rewriteSummaries.js`, `control.js`, `execute.js`, `workerClient.js`, `server.js`.*
