# Computational Behavioral Model: Formal Specification

## TriggerMap — Continuous Emotional State Inference Engine

**Version:** 1.0  
**Classification:** Technical IP Specification  
**Status:** Implementation-Ready Draft

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Field of Invention](#2-field-of-invention)
3. [Background and Limitations of Existing Systems](#3-background-and-limitations-of-existing-systems)
4. [Summary of Invention](#4-summary-of-invention)
5. [Core Novelty](#5-core-novelty)
6. [Mathematical Formulation](#6-mathematical-formulation)
   - 6.1 [Emotional State Vector](#61-emotional-state-vector)
   - 6.2 [Evoked vs. Invoked Emotion](#62-evoked-vs-invoked-emotion)
   - 6.3 [Emotional Gap and Masking Coefficient](#63-emotional-gap-and-masking-coefficient)
   - 6.4 [Personalized Baseline Model](#64-personalized-baseline-model)
   - 6.5 [Vacuum State Model](#65-vacuum-state-model)
   - 6.6 [Recursive State Transition](#66-recursive-state-transition)
   - 6.7 [Emotional Residue Dynamics](#67-emotional-residue-dynamics)
   - 6.8 [Pattern Formation and Signal Detection](#68-pattern-formation-and-signal-detection)
7. [System Architecture](#7-system-architecture)
   - 7.1 [Existing Architecture Overview](#71-existing-architecture-overview)
   - 7.2 [Proposed Additive Modules](#72-proposed-additive-modules)
   - 7.3 [Module-by-Module Integration Map](#73-module-by-module-integration-map)
8. [Data Model and Storage Design](#8-data-model-and-storage-design)
   - 8.1 [Existing Redis Schema](#81-existing-redis-schema)
   - 8.2 [New Keys and Fields](#82-new-keys-and-fields)
   - 8.3 [Backward Compatibility](#83-backward-compatibility)
9. [API and Processing Flow](#9-api-and-processing-flow)
   - 9.1 [Log Moment (Write-Time Enrichment)](#91-log-moment-write-time-enrichment)
   - 9.2 [Baseline Update (Batch-Time)](#92-baseline-update-batch-time)
   - 9.3 [Weekly Report Generation](#93-weekly-report-generation)
   - 9.4 [LLM Insight Generation](#94-llm-insight-generation)
10. [Non-Breaking Migration Plan](#10-non-breaking-migration-plan)
    - 10.1 [Phase 0 — Foundation (Feature-Flagged)](#101-phase-0--foundation-feature-flagged)
    - 10.2 [Phase 1 — Silent Dual-Write](#102-phase-1--silent-dual-write)
    - 10.3 [Phase 2 — Signal Integration](#103-phase-2--signal-integration)
    - 10.4 [Phase 3 — Full Activation](#104-phase-3--full-activation)
    - 10.5 [Rollback Strategy](#105-rollback-strategy)
11. [Ops Console Integration](#11-ops-console-integration)
12. [Validation and Backtesting Plan](#12-validation-and-backtesting-plan)
    - 12.1 [Archetype Harness Extension](#121-archetype-harness-extension)
    - 12.2 [Validation Criteria](#122-validation-criteria)
    - 12.3 [End-to-End Test Matrix](#123-end-to-end-test-matrix)
13. [Claims](#13-claims)
14. [Engineering Appendix](#14-engineering-appendix)
    - A. [Module Change Manifest](#a-module-change-manifest)
    - B. [New Redis Key Design](#b-new-redis-key-design)
    - C. [Compute Timing Budget](#c-compute-timing-budget)
    - D. [Report Payload Additions](#d-report-payload-additions)
    - E. [Migration Sequence Checklist](#e-migration-sequence-checklist)
    - F. [Test Plan](#f-test-plan)

---

## 1. Abstract

This specification describes a computational behavioral model for continuous emotional state inference from sparse, user-initiated behavioral signals. The system operates on a discrete emotion-trigger vocabulary logged at arbitrary intervals, constructing a longitudinal emotional state representation that distinguishes between **evoked** emotion (externally triggered responses) and **invoked** emotion (internally generated states), models **emotional masking** (divergence between reported and underlying state), tracks **emotional residue** (carry-over effects between contexts), and defines a **vacuum state** (the user's emotional ground truth in the absence of external stimulation).

The model is designed for deployment on a stateless serverless architecture (Next.js API routes on Vercel) with a single persistence layer (Upstash Redis), computing all derived state at batch-time from daily aggregated signals. It preserves full backward compatibility with the existing TriggerMap production system while introducing new computational layers through additive, feature-flagged modules.

---

## 2. Field of Invention

Computational behavioral analysis; continuous emotional state modeling from sparse self-reported signals; context-dependent emotional pattern recognition; personalized baseline inference; longitudinal mood trajectory prediction.

---

## 3. Background and Limitations of Existing Systems

### 3.1 Prior Art in Emotional Tracking

Existing digital mood-tracking systems fall into three categories:

1. **Simple journaling applications** (Daylio, Pixels) — capture a single mood rating per entry. No contextual pairing, no trigger correlation, no longitudinal modeling. Output is a color-coded calendar, not behavioral analysis.

2. **Clinical assessment instruments** (PHQ-9, GAD-7 digital forms) — validated psychometric scales administered at fixed intervals (typically 2-4 weeks). Designed for diagnostic screening, not continuous state inference. Require clinical interpretation. Cannot detect within-week patterns, context-dependent variation, or emotional residue.

3. **Wearable-derived affect estimation** (Fitbit Stress, Oura Readiness) — infer emotional states from physiological proxies (HRV, skin conductance, sleep quality). Subject to physiological confounds (caffeine, exercise, illness). Cannot distinguish emotional triggers or capture subjective experience. No user agency in the modeling loop.

### 3.2 Specific Limitations Addressed

| Limitation | Prior Art | This System |
|---|---|---|
| Emotion treated as atomic snapshot | All | Emotion decomposed into evoked/invoked components with contextual pairing |
| No trigger–emotion correlation | Most | Every emotion paired with a contextual trigger at log time |
| Fixed baseline assumption | All | Rolling recency-weighted personalized baseline with drift tracking |
| No masking detection | All | Divergence model detecting when surface reports deviate from inferred underlying state |
| No emotional carry-over model | All | Residue function modeling inter-context emotional bleed |
| No vacuum state concept | All | Explicit model of emotional ground state in absence of stimulation |
| Require clinical infrastructure | Clinical tools | Fully self-service, anonymous-first, no clinical gatekeeping |
| Passive data only | Wearables | Active self-report with contextual metadata, preserving user agency |

---

## 4. Summary of Invention

The invention comprises a computational behavioral model that:

1. **Represents emotional state as a multi-dimensional vector** over a discrete emotion vocabulary and trigger vocabulary, rather than a scalar mood score.

2. **Decomposes each reported emotion** into an evoked component (attributable to the paired trigger context) and an invoked component (residual, internally generated), using historical trigger-emotion correlations as the decomposition basis.

3. **Computes a masking coefficient** by measuring the divergence between reported emotion patterns and patterns inferred from behavioral signals (logging frequency, time-of-day shifts, vocabulary changes), detecting when users report stability while exhibiting behavioral instability.

4. **Maintains a personalized emotional baseline** using recency-weighted averaging over a 30-day window, from which drift, stability, and recovery latency are continuously derived.

5. **Defines a vacuum state model** representing the user's emotional ground truth when trigger influence is analytically removed, enabling isolation of internal emotional trajectory from external circumstance.

6. **Models emotional residue** as the carry-over effect of emotion from one trigger context into subsequent contexts within the same temporal window, detecting cross-contamination of emotional responses.

7. **Detects compound patterns** — including flattening (emotional range compression), false recovery (surface improvement masking underlying instability), and delayed crash (sustained positive state preceding rapid decline) — through recursive state analysis over the longitudinal record.

All computation occurs within a stateless serverless architecture, using pre-aggregated daily snapshots stored as Redis hashes, with no additional infrastructure requirements.

---

## 5. Core Novelty

### 5.1 What Is New

**No existing system** performs context-paired emotional decomposition (evoked/invoked), masking detection from behavioral metadata, or vacuum state inference from self-reported mood logs. These constructs are novel individually and in combination.

### 5.2 Why It Matters

Current mood-tracking tools answer: _"How did you feel?"_

This system answers: _"What caused that feeling, how much of it was the situation versus you, are you hiding something from yourself, what is your true emotional resting state, and how is that changing over time?"_

### 5.3 Defensibility

The model is:
- **Non-obvious:** The decomposition of a single mood report into evoked/invoked components using trigger-correlation history as the basis set is not an intuitive extension of mood tracking.
- **Technically specific:** Each construct has a precise mathematical definition, computable from the existing data structures.
- **Practically useful:** Each construct produces a distinct insight class that cannot be derived from existing mood-tracking outputs.

---

## 6. Mathematical Formulation

### 6.1 Emotional State Vector

Define the emotional vocabulary $\mathcal{E} = \{\text{frustrated}, \text{anxious}, \text{neutral}, \text{calm}, \text{energized}\}$ with ordinal scoring function:

$$\sigma : \mathcal{E} \to \{1, 2, 3, 4, 5\}$$

where $\sigma(\text{frustrated}) = 1$, $\sigma(\text{anxious}) = 2$, $\sigma(\text{neutral}) = 3$, $\sigma(\text{calm}) = 4$, $\sigma(\text{energized}) = 5$.

Define the trigger vocabulary $\mathcal{T} = \{\text{work}, \text{family}, \text{partner}, \text{social}, \text{alone}, \text{exercise}, \text{travel}, \text{health}, \text{money}\}$.

A **moment** $m$ is a tuple:

$$m = (e, \tau, t, \mathbf{g})$$

where $e \in \mathcal{E}$ is the reported emotion, $\tau \in \mathcal{T}$ is the trigger, $t$ is the timestamp, and $\mathbf{g} \subseteq \mathcal{G}$ is an optional tag set ($|\mathbf{g}| \leq 3$) from the context-specific tag vocabulary $\mathcal{G}_\tau \subset \mathcal{G}$.

The **daily state vector** on day $d$ is the frequency distribution over the emotion-trigger product space:

$$\mathbf{S}(d) = \left[ n_{e,\tau}(d) \right]_{e \in \mathcal{E},\, \tau \in \mathcal{T}} \in \mathbb{N}^{|\mathcal{E}| \times |\mathcal{T}|}$$

where $n_{e,\tau}(d)$ is the count of moments with emotion $e$ and trigger $\tau$ logged on day $d$.

The **marginal emotion distribution** is:

$$\mathbf{E}(d) = \left[ \sum_{\tau \in \mathcal{T}} n_{e,\tau}(d) \right]_{e \in \mathcal{E}}$$

The **daily emotion score** is:

$$s(d) = \frac{\sum_{e \in \mathcal{E}} \sigma(e) \cdot E_e(d)}{\sum_{e \in \mathcal{E}} E_e(d)}$$

This is the existing `emotionAvgScore` function in the production system.

### 6.2 Evoked vs. Invoked Emotion

For a given trigger $\tau$ and user with history $\mathcal{H} = \{m_1, m_2, \ldots, m_N\}$, define the **trigger-conditioned emotion distribution**:

$$P(e \mid \tau) = \frac{|\{m \in \mathcal{H} : m.e = e \wedge m.\tau = \tau\}|}{|\{m \in \mathcal{H} : m.\tau = \tau\}|}$$

This is the normalized form of the existing `correlations[trigger][emotion]` object in `patternEngine.js`.

The **evoked emotion score** for moment $m_i = (e_i, \tau_i, t_i, \mathbf{g}_i)$ is the expected emotion score under the trigger-conditioned distribution:

$$s_{\text{evoked}}(m_i) = \sum_{e \in \mathcal{E}} \sigma(e) \cdot P(e \mid \tau_i)$$

This represents the "typical" emotional response to this trigger for this user.

The **invoked emotion score** is the residual:

$$s_{\text{invoked}}(m_i) = \sigma(e_i) - s_{\text{evoked}}(m_i)$$

**Interpretation:**
- $s_{\text{invoked}} \approx 0$ → The user's emotional response is fully explained by the trigger context. The situation is driving the feeling.
- $s_{\text{invoked}} > 0$ → The user is feeling _better_ than this trigger typically produces. An internal positive state is elevating the response.
- $s_{\text{invoked}} < 0$ → The user is feeling _worse_ than this trigger typically produces. An internal negative state is suppressing the response or an unlogged factor is contributing.

The **daily invoked average** aggregates internal state signal:

$$\bar{s}_{\text{invoked}}(d) = \frac{1}{|M_d|} \sum_{m \in M_d} s_{\text{invoked}}(m)$$

where $M_d$ is the set of moments on day $d$.

**Mapping to existing architecture:** The `correlations` object already contains $n_{e,\tau}$ counts per trigger. Computing $P(e \mid \tau)$ requires normalizing per-trigger totals, which are derivable from `triggerFrequency`. No new storage is required.

### 6.3 Emotional Gap and Masking Coefficient

**Emotional masking** occurs when a user's reported emotions diverge from what their behavioral signals suggest. Define:

**Behavioral instability index** $\beta(d)$:

$$\beta(d) = w_1 \cdot \hat{f}(d) + w_2 \cdot \hat{v}(d) + w_3 \cdot \hat{t}(d)$$

where:
- $\hat{f}(d)$ = normalized logging frequency deviation (moments on day $d$ vs. user's average daily moments). Sudden increases or decreases in logging frequency are behavioral signals.
- $\hat{v}(d)$ = normalized within-day emotion variance (the existing `varianceForDay` function).
- $\hat{t}(d)$ = time-of-day shift signal — deviation in logging time distribution from user's historical pattern.
- $w_1, w_2, w_3$ are empirical weights (initial: $0.4, 0.4, 0.2$).

All three components are computable from the existing daily aggregate hashes (`total`, `time:{bucket}`, `emotion:{e}` fields).

The **masking coefficient** $\mu(d)$ detects divergence between reported stability and behavioral instability:

$$\mu(d) = \max\!\left(0, \;\beta(d) - \lambda \cdot |s(d) - B|\right)$$

where:
- $B$ is the personalized baseline score (§6.4)
- $|s(d) - B|$ is the reported drift magnitude
- $\lambda$ is a sensitivity parameter (initial: $1.0$)

**Interpretation:**
- $\mu(d) \approx 0$ → Reported emotion and behavioral signals are consistent. No masking detected.
- $\mu(d) > 0$ → Behavioral signals (logging more/less, at unusual times, with higher intra-day variance) suggest instability that the reported emotion scores do not reflect. The user may be masking.

**Masking detection** flags when $\mu(d) > \mu_{\text{threshold}}$ for $k$ consecutive days:

$$\text{MASK\_ALERT}(d) = \begin{cases} 1 & \text{if } \mu(d-j) > \mu_{\text{threshold}} \;\;\forall\; j \in \{0, 1, \ldots, k-1\} \\[2pt] 0 & \text{otherwise}\end{cases}$$

with initial parameters $\mu_{\text{threshold}} = 0.3$, $k = 3$.

**Relation to existing system:** The existing `isFlattening` flag in the signal profile is a special case of masking detection — it identifies neutral-dominant reporting with declining trajectory. The masking coefficient generalizes this to any emotion-behavioral divergence.

### 6.4 Personalized Baseline Model

The personalized baseline $B$ is computed as a recency-weighted average over a 30-day window, as implemented in `baselineEngine.js`:

$$B = \frac{\sum_{i=1}^{D} w_i \cdot s(d_i)}{\sum_{i=1}^{D} w_i}$$

where:
- $D$ is the number of logged days in the baseline window ($D \leq 30$)
- $d_i$ are the logged days, ordered oldest ($i = 1$) to newest ($i = D$)
- $w_i = i$ (linear recency weighting — the existing implementation)
- The baseline is considered **reliable** when $D \geq 5$ (`MIN_BASELINE_DAYS`)

**Drift** is the signed deviation of the 7-day recent average from the baseline:

$$\Delta(d) = \bar{s}_{\text{recent}}(d) - B$$

where $\bar{s}_{\text{recent}}(d) = \frac{1}{|R|}\sum_{d' \in R} s(d')$ and $R$ is the set of logged days within the most recent 7 days.

**Drift labels** (from the production `driftLabel` function):

| $\Delta$ Range | Label |
|---|---|
| $> 0.8$ | significantly improving |
| $(0.4, 0.8]$ | improving |
| $(0.15, 0.4]$ | slightly improving |
| $[-0.15, 0.15]$ | stable |
| $[-0.4, -0.15)$ | slightly declining |
| $[-0.8, -0.4)$ | declining |
| $\leq -0.8$ | significantly declining |

**Stability score** $\Sigma$:

$$\Sigma = \frac{|\{d : |s(d) - B| \leq 0.5\}|}{D}$$

The fraction of logged days within the recovery band ($\pm 0.5$) of the baseline.

**Recovery latency** $\rho$: the mean number of days required to return to the baseline recovery band after a dip episode (consecutive days with $s(d) < B - 0.4$).

These are all production-implemented constructs in `baselineEngine.js`. The formalization here serves as the mathematical foundation for the new additive constructs that extend them.

### 6.5 Vacuum State Model

The **vacuum state** $V(d)$ represents the user's emotional ground truth when the influence of external triggers is analytically removed. It is the answer to: _"If nothing happened to you today, what would your emotional state be?"_

Define:

$$V(d) = B + \bar{s}_{\text{invoked}}(d)$$

The vacuum state is the baseline adjusted by the average invoked (internal) component of recent emotions. Alternatively, using a smoothed multi-day form:

$$V(d) = B + \alpha \cdot \bar{s}_{\text{invoked}}(d) + (1 - \alpha) \cdot (V(d-1) - B)$$

where $\alpha \in (0, 1]$ is a smoothing parameter (initial: $0.3$), ensuring the vacuum state tracks internal shifts gradually rather than jumping on single-day anomalies.

**Properties:**
- When $\bar{s}_{\text{invoked}} \approx 0$ consistently, $V(d) \approx B$ — the user's internal state matches their historical average.
- When $\bar{s}_{\text{invoked}} < 0$ persistently, $V(d) < B$ — the user's internal state is declining independently of triggers.
- $V(d) - B$ gives the **vacuum drift**, a measure of autonomous emotional trajectory uncontaminated by external circumstance.

**Clinical analogy:** The vacuum state is conceptually similar to a "residual mood" in cognitive behavioral models — what remains when situational factors are accounted for. However, it is computed dynamically from behavioral signals rather than derived through therapeutic assessment.

**Vacuum trajectory** over time:

$$\mathbf{V}_{\text{traj}} = [V(d_1), V(d_2), \ldots, V(d_D)]$$

A declining vacuum trajectory with a stable surface score is a strong masking signal: the user's external circumstances may be stable, but their internal state is deteriorating.

### 6.6 Recursive State Transition

Define the **full state** at day $d$ as:

$$\Phi(d) = \left(s(d),\; V(d),\; \mu(d),\; \Delta(d),\; \Sigma(d),\; \rho(d),\; \mathbf{R}(d)\right)$$

where $\mathbf{R}(d)$ is the residue vector (§6.7).

The **state transition** is:

$$\Phi(d) = f\!\left(\Phi(d-1),\; \mathbf{S}(d),\; \mathcal{H}\right)$$

where $f$ is the composite function:

1. Compute $s(d)$ from $\mathbf{S}(d)$ (daily emotion score from new moments)
2. Compute evoked/invoked decomposition from $\mathbf{S}(d)$ and $\mathcal{H}$
3. Update vacuum state $V(d)$ with smoothing from $V(d-1)$
4. Compute behavioral instability $\beta(d)$ and masking $\mu(d)$
5. Recompute baseline $B$ and drift $\Delta(d)$ incorporating day $d$
6. Update stability $\Sigma(d)$ and recovery latency $\rho(d)$
7. Update residue vector $\mathbf{R}(d)$ (§6.7)

This is a recursive, fully deterministic function — given the same history $\mathcal{H}$ and daily state $\mathbf{S}(d)$, the output is always the same. No stochastic elements. No model training. No gradient descent. The system is a **deterministic state machine**.

### 6.7 Emotional Residue Dynamics

**Emotional residue** models the carry-over of emotional state from one trigger context into subsequent contexts within the same temporal window.

For a sequence of moments $m_1, m_2, \ldots, m_k$ logged within a single day, define the **residue** at moment $m_j$ as:

$$R(m_j) = \sum_{i < j} \gamma^{t_j - t_i} \cdot s_{\text{invoked}}(m_i)$$

where:
- $\gamma \in (0, 1)$ is a temporal decay factor (initial: $0.7$ per hour)
- $t_j - t_i$ is the time gap in hours between moments

**Interpretation:**
- High residue at moment $m_j$ means prior emotional states are still influencing the current report.
- A user who logs `frustrated + work` at 9am and then `anxious + partner` at 7pm still carries residue from the morning frustration. The partner interaction may not be the primary driver.

The **daily residue vector** captures the dominant carry-over per trigger:

$$\mathbf{R}(d) = \left[ \bar{R}_\tau(d) \right]_{\tau \in \mathcal{T}}$$

where $\bar{R}_\tau(d)$ is the mean residue across moments with trigger $\tau$ on day $d$.

**Cross-context contamination detection:** When $|\bar{R}_\tau(d)| > R_{\text{threshold}}$ (initial: $0.5$), the emotions logged under trigger $\tau$ are significantly contaminated by prior context.

**Mapping to existing architecture:** The current system stores moments as a JSON list in `triggermap:moments:{ownerId}`. Residue computation requires time-ordered moment access within a day, which is available from the existing data. No new keys required — computation occurs at report generation time.

### 6.8 Pattern Formation and Signal Detection

The existing system already detects:
- **Regulators:** trigger-emotion pairs where $\sigma(e) \geq 4$ and count $\geq 2$
- **Friction zones:** trigger-emotion pairs where $\sigma(e) \leq 2$ and count $\geq 2$
- **Recurrence:** pairs appearing $\geq 2$ times per week
- **Streaks:** consecutive days above 3.5 (positive) or below 2.5 (negative)
- **Flattening:** neutral dominance + low volatility + declining trajectory

The new model adds three compound pattern detectors:

#### 6.8.1 False Recovery Detection

A **false recovery** occurs when the surface score returns to baseline but the underlying state has not stabilized.

$$\text{FALSE\_RECOVERY}(d) = \begin{cases} 1 & \text{if } |s(d) - B| < 0.3 \;\wedge\; V(d) < B - 0.4 \;\wedge\; \Sigma(d) < 0.4 \\[2pt] 0 & \text{otherwise}\end{cases}$$

The user's reported scores look normal, but the vacuum state is depressed and stability is low.

#### 6.8.2 Delayed Crash Prediction

A **delayed crash** is predicted when sustained positive state occurs with accumulating negative residue.

$$\text{CRASH\_RISK}(d) = \begin{cases} 1 & \text{if } s_{\text{trend}}(d) > 3.5 \;\wedge\; V_{\text{trend}}(d) < B \;\wedge\; \mu_{\text{avg}}(d) > 0.2 \;\wedge\; \text{days} \geq 3 \\[2pt] 0 & \text{otherwise}\end{cases}$$

where $s_{\text{trend}}$ and $V_{\text{trend}}$ are 3-day moving averages. The user is reporting positive outcomes while their vacuum state and masking signals suggest underlying strain.

#### 6.8.3 Context Contamination Pattern

When residue analysis shows that a single trigger context is consistently contaminating others:

$$\text{CONTAM}(\tau_{\text{src}}) = \frac{1}{|\mathcal{T} \setminus \{\tau_{\text{src}}\}|} \sum_{\tau \neq \tau_{\text{src}}} \text{corr}(R_{\tau_{\text{src}}}, s_{\tau})$$

where $\text{corr}$ is the Pearson correlation over available days. High $\text{CONTAM}(\tau_{\text{src}})$ means emotions from $\tau_{\text{src}}$ are bleeding into other areas of the user's life.

---

## 7. System Architecture

### 7.1 Existing Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Expo Mobile  │  │  Next.js    │  │  Ops Console        │  │
│  │ (React       │  │  PWA (Web)  │  │  (internal/ routes) │  │
│  │  Native)     │  │             │  │                     │  │
│  └──────┬───────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼─────────────────┼────────────────────┼─────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                    API LAYER (Vercel)                         │
│  Next.js API Routes — Stateless, Serverless                  │
│                                                              │
│  logMoment → timeline → weeklyReport → actions               │
│  register → login → me → subscription/verify                 │
│  export → deleteData → push-token → health                   │
│  internal/control/{run-job, manage-user, clear-cache}        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                              │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ aggregation  │  │  patternEngine  │  │ baselineEngine │  │
│  │ Service      │  │  (weekly report │  │ (baseline,     │  │
│  │ (daily agg,  │  │   generation)   │  │  drift,        │  │
│  │  HINCRBY)    │  │                 │  │  stability,    │  │
│  └──────────────┘  └─────────────────┘  │  recovery)     │  │
│                                          └────────────────┘  │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ signalProfile│  │ generateInsight │  │ generateLlm    │  │
│  │ (classifier, │  │ (rule-based)    │  │ Insight (LLM)  │  │
│  │  constraints)│  │                 │  │                │  │
│  └──────────────┘  └─────────────────┘  └────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                          │
│                     Upstash Redis                             │
│                                                              │
│  triggermap:moments:{ownerId}           (List, JSON)         │
│  triggermap:daily:{ownerId}:{date}      (Hash, 45-day TTL)   │
│  triggermap:weekly_report:{ownerId}     (String, JSON)       │
│  triggermap:llm_insight:{ownerId}       (String, JSON)       │
│  triggermap:subscription:{ownerId}      (Hash, 90-day TTL)   │
│  triggermap:owners                      (Set)                │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Proposed Additive Modules

The behavioral model introduces **two new modules** and **extends three existing modules**. No existing modules are modified in incompatible ways.

```
┌──────────────────────────────────────────────────────────────┐
│                    NEW / EXTENDED MODULES                     │
│                                                              │
│  ┌───────────────────────────────────┐                       │
│  │ emotionDecomposer.js         [NEW]│                       │
│  │                                   │                       │
│  │ • computeEvokedScore(moment, H)   │                       │
│  │ • computeInvokedScore(moment, H)  │                       │
│  │ • computeDailyInvoked(moments, H) │                       │
│  │ • computeResidue(moments)         │                       │
│  │ • detectContamination(residue)    │                       │
│  └───────────────────────────────────┘                       │
│                                                              │
│  ┌───────────────────────────────────┐                       │
│  │ vacuumStateEngine.js         [NEW]│                       │
│  │                                   │                       │
│  │ • computeVacuumState(B, invoked,  │                       │
│  │     prevVacuum, alpha)            │                       │
│  │ • computeVacuumTrajectory(aggs)   │                       │
│  │ • computeMaskingCoefficient(...)  │                       │
│  │ • detectFalseRecovery(state)      │                       │
│  │ • detectCrashRisk(state)          │                       │
│  └───────────────────────────────────┘                       │
│                                                              │
│  ┌───────────────────────────────────┐                       │
│  │ patternEngine.js          [EXTEND]│                       │
│  │                                   │                       │
│  │ + invokedMetrics: {               │                       │
│  │     dailyInvoked, vacuumState,    │                       │
│  │     vacuumDrift, maskingCoeff,    │                       │
│  │     residueHotspots }             │                       │
│  │ + compoundPatterns: {             │                       │
│  │     falseRecovery, crashRisk,     │                       │
│  │     contextContamination }        │                       │
│  └───────────────────────────────────┘                       │
│                                                              │
│  ┌───────────────────────────────────┐                       │
│  │ signalProfile.js          [EXTEND]│                       │
│  │                                   │                       │
│  │ + vacuumDriftDirection            │                       │
│  │ + maskingLevel: none|low|moderate │                       │
│  │     |high                         │                       │
│  │ + residueContamination: boolean   │                       │
│  │ + LLM constraint text for new     │                       │
│  │   signals                         │                       │
│  └───────────────────────────────────┘                       │
│                                                              │
│  ┌───────────────────────────────────┐                       │
│  │ generateInsight.js        [EXTEND]│                       │
│  │                                   │                       │
│  │ + Summary branches for masking,   │                       │
│  │   vacuum drift, false recovery    │                       │
│  │ + whereToFocus items for new      │                       │
│  │   compound patterns               │                       │
│  └───────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Module-by-Module Integration Map

| Existing Module | Change Type | What Changes | Backward Compat |
|---|---|---|---|
| `aggregationService.js` | **None** | No changes. Daily aggregate hashes remain unchanged. | ✅ |
| `patternEngine.js` | **Additive** | Add optional `invokedMetrics` and `compoundPatterns` fields to the report object. All existing fields remain. Gated by feature flag. | ✅ |
| `baselineEngine.js` | **None** | No changes. Existing baseline computation is consumed as-is. | ✅ |
| `signalProfile.js` | **Additive** | Add optional fields to signal profile output. Existing fields unchanged. New constraint text appended to LLM constraints. | ✅ |
| `generateInsight.js` | **Additive** | New summary branches selected only when new signals are present. Existing branches unchanged. | ✅ |
| `generateLlmInsight.js` | **Additive** | New signal lines appended to `buildSignals()` output when invoked metrics are available. Existing prompt structure unchanged. | ✅ |
| `weeklyReport.js` (API route) | **None** | Returns whatever `patternEngine` produces. New fields appear automatically. | ✅ |
| `logMoment.js` (API route) | **None** | No changes to write path. | ✅ |

---

## 8. Data Model and Storage Design

### 8.1 Existing Redis Schema

| Key Pattern | Type | TTL | Contents |
|---|---|---|---|
| `triggermap:moments:{ownerId}` | List | None | JSON strings, each a moment object |
| `triggermap:daily:{ownerId}:{YYYY-MM-DD}` | Hash | 45 days | `total`, `trigger:{t}`, `emotion:{e}`, `pair:{t}\|{e}`, `time:{bucket}`, `tag:{tag}`, `prediction` |
| `triggermap:weekly_report:{ownerId}` | String (JSON) | None | Full weekly report payload |
| `triggermap:llm_insight:{ownerId}` | String (JSON) | None | LLM narrative + metadata |
| `triggermap:llm_free_pass:{ownerId}` | String | 48h (172800s) | Free-pass token |
| `triggermap:subscription:{ownerId}` | Hash | 90 days | Subscription status/metadata |
| `triggermap:owners` | Set | None | All active ownerIds |

### 8.2 New Keys and Fields

#### 8.2.1 Vacuum State Cache

**Key:** `triggermap:vacuum:{ownerId}`  
**Type:** String (JSON)  
**TTL:** 7 days (recomputed each weekly report cycle)

```json
{
  "vacuumScore": 3.12,
  "vacuumDrift": -0.18,
  "vacuumTrajectory": [
    { "date": "2025-01-13", "vacuum": 3.25 },
    { "date": "2025-01-14", "vacuum": 3.18 },
    { "date": "2025-01-15", "vacuum": 3.12 }
  ],
  "maskingCoefficient": 0.15,
  "maskingAlert": false,
  "computedAt": "2025-01-15T10:00:00Z"
}
```

**Rationale:** Vacuum state is computed from full moment history plus daily aggregates. Caching the result avoids reprocessing on every report fetch. Recomputed at weekly report generation time.

#### 8.2.2 Extended Weekly Report Fields

The existing `triggermap:weekly_report:{ownerId}` JSON payload gains **optional** new keys:

```json
{
  "...existing fields preserved exactly...",

  "invokedMetrics": {
    "dailyInvoked": [
      { "date": "2025-01-13", "meanInvoked": -0.3, "momentCount": 4 },
      { "date": "2025-01-14", "meanInvoked": 0.1, "momentCount": 3 }
    ],
    "weeklyInvokedAvg": -0.12,
    "vacuumState": 3.12,
    "vacuumDrift": -0.18,
    "maskingCoefficient": 0.15,
    "maskingAlert": false,
    "residueHotspots": [
      { "sourceTrigger": "work", "affectedTriggers": ["partner", "family"], "avgResidue": 0.6 }
    ]
  },
  "compoundPatterns": {
    "falseRecovery": false,
    "crashRisk": false,
    "contextContamination": [
      { "source": "work", "targets": ["partner"], "strength": 0.45 }
    ]
  }
}
```

**Backward compatibility:** Existing consumers that read `topTrigger`, `topEmotion`, `baselineMetrics`, etc. are unaffected. New fields are additive — `undefined` in old reports.

#### 8.2.3 Extended Signal Profile Fields

New optional fields on the signal profile (in-memory, not persisted separately):

```json
{
  "...existing fields...",
  "vacuumDrift": "stable",
  "maskingLevel": "none",
  "residueContamination": false
}
```

### 8.3 Backward Compatibility

All existing Redis keys, field names, TTLs, and access patterns remain unchanged. New keys follow the existing `triggermap:{type}:{ownerId}` naming convention. The `vacuum` key can be deleted at any time without affecting core functionality — it is a cache, not source of truth.

Clients that do not understand the new report fields will ignore them (standard JSON forward compatibility). No API response shape changes; new fields appear alongside existing ones.

---

## 9. API and Processing Flow

### 9.1 Log Moment (Write-Time Enrichment)

**Route:** `POST /api/logMoment`

**Current flow (unchanged):**
1. Validate emotion ∈ $\mathcal{E}$, trigger ∈ $\mathcal{T}$
2. Create moment JSON, `RPUSH` to `triggermap:moments:{ownerId}`
3. Call `appendDailyAggregate(moment)` — `HINCRBY` on all counters
4. Refresh weekly insight asynchronously (non-blocking)
5. Return immediate feedback

**Change:** None. Write path is not modified. All new computation occurs at report generation time (batch). This is critical for latency — logMoment must remain < 200ms.

### 9.2 Baseline Update (Batch-Time)

**Current flow (unchanged):**
1. `patternEngine.generateWeeklyReport()` calls `computeBaselineMetrics(allAggregates, rawVolatility)`
2. Baseline engine fetches up to 30 days of daily aggregates
3. Computes baseline score, drift, stability, recovery latency, state of mind

**New additive step (feature-flagged):**
4. If `FEATURE_FLAGS.computeInvokedMetrics === true`:
   a. Fetch recent moments from `triggermap:moments:{ownerId}` (last 7 days)
   b. Compute `P(e | τ)` from historical correlations (already available in report)
   c. Compute per-moment invoked scores and daily invoked averages
   d. Compute vacuum state using smoothing from previous vacuum cache
   e. Compute masking coefficient from behavioral signals
   f. Compute residue for same-day moment sequences
   g. Run compound pattern detectors
   h. Attach `invokedMetrics` and `compoundPatterns` to report object
   i. Cache vacuum state to `triggermap:vacuum:{ownerId}`

**Compute cost:** Steps 4a-4i process at most 7 days × ~15 moments/day ≈ 105 moments. All arithmetic is O(n) with small constants. Estimated additional latency: < 50ms per user. Well within the Vercel 60-second function timeout for batch processing.

### 9.3 Weekly Report Generation

**Job:** `generateWeeklyReports.js` (concurrency: 5 users)

**Current flow:**
1. For each owner, fetch 7-day aggregates + 30-day allAggregates + previous-week aggregates
2. Call `generateWeeklyReport({ aggregates, allAggregates, previousAggregates })`
3. Call `generateInsight(report)` for rule-based summary
4. Store combined result to `triggermap:weekly_report:{ownerId}`

**Extended flow (feature-flagged):**
Between steps 2 and 3:
- 2a. If flag enabled, call `computeInvokedMetrics(report, moments)` from `emotionDecomposer.js`
- 2b. Call `computeVacuumState(...)` from `vacuumStateEngine.js`
- 2c. Attach results to report object
- 2d. Extend signal profile with new fields

Step 3 insight generation then has access to the new fields for richer summaries.

### 9.4 LLM Insight Generation

**Job:** `generateLlmInsights.js`

**Current flow:**
1. Fetch weekly report (which now contains invoked metrics if enabled)
2. Call `buildSignals(report, recentNotes, actionFeedback)` — structured text for LLM
3. Build prompt with constraints from signal profile
4. Send to Ollama API
5. Post-process response

**Change to `buildSignals`:** Append new signal lines when `invokedMetrics` is present:

```
If invoked metrics available:
  "Vacuum state: {vacuumScore} (drift: {vacuumDrift} from baseline {B})."
  "Masking coefficient: {maskingCoefficient} ({maskingLevel})."
  If residueHotspots:
    "Residue hotspot: emotions from {source} are carrying into {targets}."
  If compoundPatterns.falseRecovery:
    "FALSE RECOVERY DETECTED: Surface scores look normal but underlying state is depressed."
  If compoundPatterns.crashRisk:
    "CRASH RISK: Sustained positive reporting with declining vacuum state."
```

**Change to `buildSignalConstraints`:** Append constraint text for new signals:

```
If maskingLevel >= 'moderate':
  "MASKING DETECTED: The user's reported emotions may not fully reflect their actual state.
   Gently acknowledge that the surface picture may not tell the whole story."

If vacuumDrift is negative:
  "VACUUM DRIFT: The user's underlying emotional state is declining independently of
   trigger contexts. Note internal trajectory, not just trigger-based patterns."
```

---

## 10. Non-Breaking Migration Plan

### 10.1 Phase 0 — Foundation (Feature-Flagged)

**Duration:** Implementation sprint  
**Risk level:** Zero — no production behavior changes

1. Add feature flag `computeInvokedMetrics: false` to `shared/constants/flags.js`
2. Create `backend/services/emotionDecomposer.js` with all functions
3. Create `backend/services/vacuumStateEngine.js` with all functions
4. Add unit tests for both modules using archetype data
5. Ship to production — flag is `false`, new code never executes

### 10.2 Phase 1 — Silent Dual-Write

**Duration:** 1-2 weeks  
**Risk level:** Minimal — new fields written but not consumed

1. Set `computeInvokedMetrics: true`
2. `patternEngine.js` calls new modules, attaches `invokedMetrics` and `compoundPatterns` to report
3. New fields are **written** to weekly report JSON in Redis
4. No consumer reads them yet — rule-based insight and LLM insight use only existing fields
5. New `triggermap:vacuum:{ownerId}` keys are written with 7-day TTL
6. Monitor via ops console: verify new fields appear, no errors, no latency spike

**Validation:**
- Run archetype test harness (all 9): verify all existing expectations still pass
- Spot-check `invokedMetrics` values for known archetypes against expected behavior
- Verify Vercel function duration remains < 30 seconds

### 10.3 Phase 2 — Signal Integration

**Duration:** 1-2 weeks  
**Risk level:** Low — additive language, never removes existing content

1. Extend `signalProfile.js` to read new fields and produce extended profile
2. Extend `generateInsight.js` with new summary branches (masking, vacuum drift, false recovery)
3. Extend `buildSignals()` and `buildSignalConstraints()` in LLM pipeline with new signal lines
4. New insight language only appears when new signals are present and significant
5. Existing insight branches are unchanged for cases where new signals are weak/absent

**Validation:**
- Run archetype test harness with extended expectations for new metrics
- Verify that archetypes without notable invoked/vacuum signals produce unchanged insights
- Run LLM tests with phi3 — verify new signal lines don't cause hallucination

### 10.4 Phase 3 — Full Activation

**Duration:** Ongoing  
**Risk level:** Low — new features fully tested

1. All new constructs active and producing insights
2. Begin collecting user feedback on new insight types via action feedback loop (existing HiTL mechanism)
3. Tune thresholds ($\alpha$, $\gamma$, $\mu_{\text{threshold}}$, $\lambda$, $w_1$/$w_2$/$w_3$) based on feedback
4. Consider adding vacuum trajectory visualization to premium report UI

### 10.5 Rollback Strategy

**At any phase:**
- Set `computeInvokedMetrics: false` → all new computation stops immediately
- Existing report fields continue to be produced normally
- `triggermap:vacuum:{ownerId}` keys expire naturally (7-day TTL), no cleanup needed
- New fields in weekly report JSON are ignored by consumers (forward compatibility)
- No data loss, no schema rollback, no Redis key cleanup required

**Total rollback time:** Single flag change + deployment ≈ 2 minutes.

---

## 11. Ops Console Integration

### 11.1 Existing Ops Endpoints

| Endpoint | Relevance |
|---|---|
| `POST /api/internal/control/run-job` | Trigger report generation with new metrics, override model for LLM |
| `POST /api/internal/control/manage-user` | Reset/clear user data (vacuum cache clears with data wipe) |
| `POST /api/internal/control/clear-cache` | Add `vacuum` as a clearable cache type |

### 11.2 New Ops Capabilities

#### 11.2.1 Cache Clearing

Extend `clear-cache.js` to accept a new cache type `vacuum`:

```javascript
// In clear-cache.js handler, add to the switch:
case "vacuum":
  keys = await getKeysByPattern("triggermap:vacuum:*");
  break;
```

#### 11.2.2 Job Enhancement

Extend `run-job.js` to support new options for report generation:

```javascript
// In the generateWeeklyReports job handler:
// Already supports: force, personalize, ownerIds
// New parameter: computeInvokedMetrics (override the global flag for this run)
```

This allows ops to:
- Force-regenerate reports WITH invoked metrics for specific users
- Force-regenerate reports WITHOUT invoked metrics (override flag ON → OFF for debugging)

#### 11.2.3 Diagnostic Endpoint

Add `POST /api/internal/control/diagnose-user` to inspect computed behavioral state:

```json
// Request
{ "action": "diagnose", "ownerId": "device_abc123" }

// Response
{
  "baseline": { "score": 3.2, "reliable": true, "daysUsed": 28 },
  "recentAvg": 2.9,
  "drift": { "value": -0.3, "label": "slightly declining" },
  "vacuum": { "score": 2.85, "drift": -0.35 },
  "masking": { "coefficient": 0.22, "alert": false },
  "residue": { "hotspots": ["work → partner"] },
  "compoundPatterns": { "falseRecovery": false, "crashRisk": false },
  "signalProfile": { "...full profile..." }
}
```

This endpoint reads the cached vacuum state and current weekly report, presenting a unified diagnostic view.

---

## 12. Validation and Backtesting Plan

### 12.1 Archetype Harness Extension

The existing test harness (`backend/scripts/test-archetypes.mjs`) defines 9 personality archetypes with full moment arcs. Each archetype is extended with expected behavioral model outputs.

| Archetype | Expected Vacuum Drift | Expected Masking | Expected Compound Pattern |
|---|---|---|---|
| **burnout-candidate** | Declining vacuum, below baseline | Low-to-moderate masking | Crash risk likely |
| **steady-achiever** | Vacuum ≈ baseline | No masking | None |
| **social-butterfly** | Slight positive vacuum | No masking | None |
| **relationship-focused** | Vacuum follows partner trigger | Low masking possible | Context contamination (partner → work) |
| **wellness-warrior** | Stable-to-positive vacuum | No masking | None |
| **delayed-crash** | Declining vacuum under positive surface | High masking | Crash risk + false recovery |
| **false-recovery** | Vacuum below baseline despite surface recovery | Moderate masking | False recovery detected |
| **context-split** | Oscillating vacuum | Low masking | Context contamination (work ↔ exercise) |
| **silent-drift** | Gradually declining vacuum | Moderate masking (neutral surface) | Flattening + vacuum decline |

### 12.2 Validation Criteria

For each archetype, the test harness verifies:

**Level 1 — Computation correctness:**
- Invoked scores have correct sign and magnitude relative to trigger history
- Vacuum state is within [1.0, 5.0] range
- Masking coefficient is non-negative
- Residue decays over time (later moments have lower residue from earlier triggers)

**Level 2 — Signal detection:**
- Archetypes with known masking (delayed-crash, false-recovery, silent-drift) produce masking coefficient > threshold
- Archetypes without masking (steady-achiever, wellness-warrior) produce masking coefficient near zero
- Compound pattern flags match expected behavior

**Level 3 — Insight quality:**
- Rule-based summaries mention vacuum/masking concepts when signals are significant
- Rule-based summaries do NOT mention vacuum/masking when signals are weak
- LLM insights reflect new signals without fabricating unsupported claims

### 12.3 End-to-End Test Matrix

| Test | Method | Pass Criteria |
|---|---|---|
| Backward compat: flag OFF | Run all 9 archetypes with `computeInvokedMetrics: false` | All existing expectations pass. No new fields in report. |
| New metrics: flag ON | Run all 9 archetypes with `computeInvokedMetrics: true` | All existing expectations pass AND new metric expectations pass. |
| Vacuum cache | Generate report → read cache → regenerate → compare | Cached and recomputed values match within $\epsilon = 0.01$. |
| Masking detection | Run delayed-crash and false-recovery archetypes | Both produce masking coefficient > 0.2. Steady-achiever produces < 0.05. |
| Residue ordering | Log 3 moments in sequence: frustrated→calm→energized | Residue of moment 3 < residue of moment 2. |
| API backward compat | Fetch `/api/weeklyReport` with old client | Response parseable, no breaking field changes. |
| LLM signal injection | Generate LLM insight with new signals | New signal lines appear in prompt. Output does not hallucinate unsupported patterns. |
| Performance | Generate reports for 50 test users with flag ON | Total batch time < 60s. Per-user time < 2s. |
| Rollback | Enable flag → generate reports → disable flag → regenerate | After disable: reports contain no new fields. Vacuum cache exists but unused. |

---

## 13. Claims

### Claim 1 — Evoked/Invoked Decomposition
A method for decomposing a self-reported emotion into an evoked component (attributable to the paired contextual trigger based on user-specific historical correlations) and an invoked component (the residual, representing internally generated emotional state), enabling isolation of external influence from internal emotional trajectory.

### Claim 2 — Emotional Masking Detection
A method for detecting emotional masking by computing a divergence metric between a user's reported emotional stability and their behavioral instability (measured via logging frequency deviations, within-day variance, and time-of-day distribution shifts), wherein a sustained divergence above a threshold indicates that the user's reported emotions do not fully reflect their actual state.

### Claim 3 — Vacuum State Inference
A method for computing a personalized emotional vacuum state — the user's inferred emotional ground truth in the absence of external trigger stimulation — by adjusting a personalized baseline score by the smoothed average of invoked emotion components, enabling detection of autonomous internal emotional trajectory independent of circumstances.

### Claim 4 — Emotional Residue Modeling
A method for computing emotional residue — the carry-over effect of emotional state from one contextual trigger domain to subsequent trigger domains within the same temporal window — using a time-decayed sum of invoked emotion scores from prior moments, enabling detection of cross-context emotional contamination.

### Claim 5 — False Recovery Detection
A method for detecting false emotional recovery by identifying states where a user's reported emotion scores return to within a threshold of their personalized baseline while their vacuum state remains depressed and stability score remains below a floor, indicating surface normalization without underlying stabilization.

### Claim 6 — Crash Risk Prediction
A method for predicting delayed emotional crashes by detecting sustained positive surface reporting co-occurring with a declining vacuum state and elevated masking coefficient over a minimum number of consecutive days.

### Claim 7 — Compound Behavioral Pattern System
A system combining Claims 1-6 into a recursive state machine that maintains a full emotional state vector $\Phi(d)$ and applies deterministic transition functions at each timestep, producing a complete behavioral profile from sparse self-reported emotion-trigger pairs without machine learning training, model fitting, or external data requirements.

---

## 14. Engineering Appendix

### A. Module Change Manifest

| File | Action | Lines Changed (est.) | Risk |
|---|---|---|---|
| `backend/services/emotionDecomposer.js` | **CREATE** | ~180 | None (new file) |
| `backend/services/vacuumStateEngine.js` | **CREATE** | ~200 | None (new file) |
| `backend/services/patternEngine.js` | **MODIFY** | +25 (import + call + attach) | Low (additive) |
| `backend/ai/signalProfile.js` | **MODIFY** | +40 (new fields + constraints) | Low (additive) |
| `backend/ai/generateInsight.js` | **MODIFY** | +60 (new summary branches) | Low (additive) |
| `backend/ai/generateLlmInsight.js` | **MODIFY** | +20 (new signal lines) | Low (additive) |
| `shared/constants/flags.js` | **MODIFY** | +1 (new flag) | None |
| `backend/pages/api/internal/control/clear-cache.js` | **MODIFY** | +5 (vacuum cache type) | None |
| `backend/scripts/test-archetypes.mjs` | **MODIFY** | +150 (new expectations) | None |

**Total new code:** ~380 lines (two new modules)  
**Total modified code:** ~300 lines across 7 files  
**Deleted code:** 0 lines

### B. New Redis Key Design

| Key | Type | TTL | Size (est.) | Write Frequency |
|---|---|---|---|---|
| `triggermap:vacuum:{ownerId}` | String (JSON) | 7 days | ~400 bytes | Weekly (batch job) |

**Storage impact:** For 10,000 users: ~4 MB additional Redis storage. Negligible relative to existing moment data.

**No other new keys.** The `invokedMetrics` and `compoundPatterns` are embedded in the existing `triggermap:weekly_report:{ownerId}` payload, adding ~500 bytes per user to an already ~2KB payload.

### C. Compute Timing Budget

All processing occurs during weekly report batch generation. Per-user budget:

| Step | Current (ms) | New Addition (ms) | Total (ms) |
|---|---|---|---|
| Fetch aggregates (Redis) | ~20 | 0 | 20 |
| Fetch moments for invoked calc | 0 | ~15 | 15 |
| Pattern engine computation | ~30 | 0 | 30 |
| Invoked decomposition | 0 | ~10 | 10 |
| Vacuum state computation | 0 | ~5 | 5 |
| Masking coefficient | 0 | ~5 | 5 |
| Residue computation | 0 | ~10 | 10 |
| Compound pattern detection | 0 | ~5 | 5 |
| Signal profile extension | ~2 | ~2 | 4 |
| Rule-based insight | ~5 | ~3 | 8 |
| Write report to Redis | ~10 | ~2 (larger payload) | 12 |
| **Total per user** | **~67** | **+57** | **~124** |

**Batch impact:** At concurrency 5, processing 1000 users: ~25 seconds → ~25 seconds (pipeline is dominated by LLM generation time at ~30s per user when LLM insights run, not by pattern computation).

### D. Report Payload Additions

The weekly report JSON payload grows by approximately 500 bytes with the following structure appended:

```typescript
// TypeScript type definition for documentation
interface InvokedMetrics {
  dailyInvoked: Array<{
    date: string;          // YYYY-MM-DD
    meanInvoked: number;   // range: typically -2.0 to +2.0
    momentCount: number;
  }>;
  weeklyInvokedAvg: number;
  vacuumState: number;       // range: 1.0 to 5.0
  vacuumDrift: number;       // vacuum - baseline
  maskingCoefficient: number; // >= 0
  maskingAlert: boolean;
  residueHotspots: Array<{
    sourceTrigger: string;
    affectedTriggers: string[];
    avgResidue: number;
  }>;
}

interface CompoundPatterns {
  falseRecovery: boolean;
  crashRisk: boolean;
  contextContamination: Array<{
    source: string;
    targets: string[];
    strength: number;       // correlation coefficient
  }>;
}
```

These types would be added to `shared/types/` for consumption by mobile and web clients when UI visualization is implemented.

### E. Migration Sequence Checklist

```
Phase 0: Foundation
  [ ] Add computeInvokedMetrics flag to shared/constants/flags.js
  [ ] Create backend/services/emotionDecomposer.js
  [ ] Create backend/services/vacuumStateEngine.js
  [ ] Write unit tests for emotionDecomposer
  [ ] Write unit tests for vacuumStateEngine
  [ ] Run existing archetype tests — all 9 pass
  [ ] Commit and deploy (flag = false)

Phase 1: Silent Dual-Write
  [ ] Integrate emotionDecomposer into patternEngine (behind flag)
  [ ] Integrate vacuumStateEngine into patternEngine (behind flag)
  [ ] Add vacuum cache write to report generation
  [ ] Set flag = true in staging/production
  [ ] Verify new fields appear in weekly report JSON
  [ ] Verify Vercel function duration stays under 30s
  [ ] Monitor for 1 week, check error logs

Phase 2: Signal Integration
  [ ] Extend signalProfile.js with new fields
  [ ] Extend signalConstraints with new constraint text
  [ ] Add new summary branches to generateInsight.js
  [ ] Add new signal lines to buildSignals() in generateLlmInsight.js
  [ ] Extend archetype test expectations for new metrics
  [ ] Run full test harness: 9/9 rule-based, 9/9 LLM
  [ ] Commit and deploy

Phase 3: Full Activation
  [ ] Collect action feedback on new insight types
  [ ] Review threshold values against real user data
  [ ] Consider UI visualization of vacuum trajectory (premium feature)
  [ ] Update ops console with vacuum cache clearing and diagnose endpoint
```

### F. Test Plan

#### F.1 Unit Tests

| Module | Test | Input | Expected Output |
|---|---|---|---|
| `emotionDecomposer` | Even trigger history | Correlations: work→calm 50%, work→anxious 50% | Evoked score = 3.0 for any work moment |
| `emotionDecomposer` | Skewed trigger history | Correlations: work→frustrated 80%, work→calm 20% | Evoked score ≈ 1.6 for work moments |
| `emotionDecomposer` | Invoked residual | Moment: calm+work, evoked = 1.6 | Invoked = 4.0 - 1.6 = 2.4 (feeling much better than work usually makes them) |
| `emotionDecomposer` | Residue decay | Moments 1h apart vs 6h apart | Residue at 1h > residue at 6h |
| `vacuumStateEngine` | Stable user | Baseline 3.5, invoked avg ≈ 0 | Vacuum ≈ 3.5, drift ≈ 0 |
| `vacuumStateEngine` | Declining user | Baseline 3.5, invoked avg = -0.8 | Vacuum < 3.5, drift < 0 |
| `vacuumStateEngine` | Masking detection | High behavioral instability, low reported drift | Masking coefficient > 0 |
| `vacuumStateEngine` | No masking | Low behavioral instability, low reported drift | Masking coefficient ≈ 0 |
| `vacuumStateEngine` | False recovery | Surface at baseline, vacuum depressed, stability low | `detectFalseRecovery` returns true |
| `vacuumStateEngine` | Crash risk | Positive surface > 3 days, vacuum declining, masking elevated | `detectCrashRisk` returns true |

#### F.2 Integration Tests (Archetype-Based)

Run each archetype through the full pipeline (patternEngine → signalProfile → generateInsight → generateLlmInsight) and verify:

| Archetype | New Assertion |
|---|---|
| burnout-candidate | `invokedMetrics.vacuumDrift < -0.3`, `compoundPatterns.crashRisk === true` |
| steady-achiever | `invokedMetrics.maskingCoefficient < 0.05`, no compound patterns |
| social-butterfly | `invokedMetrics.vacuumDrift >= 0`, no masking |
| relationship-focused | `invokedMetrics.residueHotspots` contains partner → other triggers |
| wellness-warrior | `invokedMetrics.vacuumState >= baseline`, no compound patterns |
| delayed-crash | `invokedMetrics.maskingCoefficient > 0.2`, `compoundPatterns.crashRisk === true` |
| false-recovery | `compoundPatterns.falseRecovery === true` |
| context-split | `invokedMetrics.residueHotspots.length > 0` |
| silent-drift | `invokedMetrics.vacuumDrift < -0.2`, `invokedMetrics.maskingCoefficient > 0.1` |

#### F.3 Regression Tests

- All existing archetype expectations continue to pass with flag ON and OFF
- All existing API route contracts unchanged (JSON shape, HTTP status codes, rate limits)
- Weekly report payload round-trips through existing mobile/web report rendering without error
- LLM generation does not exceed word count limits with additional signal lines

---

*End of specification.*
