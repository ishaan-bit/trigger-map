/**
 * Trigger Signal — synthesis selector for the redesigned Trigger Map.
 * ──────────────────────────────────────────────────────────────────
 * Pure, framework-free. Turns the already-client-available weekly `report`
 * (+ optional longitudinal `progress`) into ONE legible, calibrated read:
 *
 *   • state      — the single most relevant situation right now
 *   • headline   — what's happening, in one human line (semantic key + vars)
 *   • barometer  — "is something building?" as a calibrated band, not a fake score
 *   • connected  — what's linked to it (friction zones) + what steadies you
 *   • changes    — what shifted vs before
 *   • watch      — emerging signals worth noticing (lower confidence)
 *   • action     — the single most relevant next step (insight → action bridge)
 *
 * Every output carries a confidence so the UI can clearly distinguish
 * observed patterns, emerging signals, and "not enough yet". Nothing here
 * fabricates precision — the barometer marker is a position within a labelled
 * qualitative band, never a percentage shown to the user.
 *
 * All inputs are optional-chained: a partial/empty report degrades gracefully.
 */

// Confidence ladder (mirrors backend patternEngine.computeConfidence)
export const CONFIDENCE_ORDER = ["too_early", "low", "emerging", "moderate", "strong", "stale"];

function confAtLeast(confidence, floor) {
  // stale is its own branch; treat it as not "enough" for normal reads
  if (confidence === "stale") return false;
  return CONFIDENCE_ORDER.indexOf(confidence) >= CONFIDENCE_ORDER.indexOf(floor);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function num(v, fallback = 0) {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

/**
 * Collect the early-warning ("concern") signals that are genuinely present.
 * Each compound detector is internally day-gated on the backend, so their
 * presence already implies enough data — we still attach the report's coarse
 * confidence so copy can stay appropriately humble.
 */
function collectConcerns(report, progress) {
  const cp = report?.compoundPatterns || {};
  const im = report?.invokedMetrics || {};
  const bc = report?.baselineContext || {};
  const drift = report?.baselineMetrics?.drift || null;
  const concerns = [];

  if (cp.crashRisk) concerns.push({ key: "crashRisk", weight: 0.22 });
  if (cp.falseRecovery) concerns.push({ key: "falseRecovery", weight: 0.2 });
  if (cp.maskingAlert || cp.maskingLevel === "high") concerns.push({ key: "masking", weight: 0.14 });
  else if (cp.maskingLevel === "moderate") concerns.push({ key: "maskingMild", weight: 0.07 });

  const negDays = num(report?.negativeStreak?.days, 0);
  if (negDays >= 2) concerns.push({ key: "negativeStreak", weight: Math.min(0.08 * negDays, 0.2), days: negDays });

  if (bc.driftDirection === "declining" || drift?.direction === "declining") {
    concerns.push({ key: "driftDeclining", weight: 0.15 });
  }

  const vDrift = num(im.vacuumDrift, 0);
  if (vDrift <= -0.5) concerns.push({ key: "vacuumDrift", weight: Math.min(Math.abs(vDrift) * 0.25, 0.2) });

  const strengthening = progress?.patternShifts?.strengthening || [];
  if (strengthening.length) concerns.push({ key: "strengthening", weight: 0.1, items: strengthening });

  return concerns;
}

/** What's working FOR the person right now (eases pressure / positive lift). */
function collectStabilizers(report) {
  const drift = report?.baselineMetrics?.drift || null;
  const out = [];
  if (drift?.direction === "improving") out.push({ key: "driftImproving", weight: 0.15 });
  const posDays = num(report?.positiveStreak?.days, 0);
  if (posDays >= 2) out.push({ key: "positiveStreak", weight: Math.min(0.08 * posDays, 0.18), days: posDays });
  if (report?.volatilityLabel === "steady") out.push({ key: "lowVolatility", weight: 0.08 });
  if ((report?.regulators || []).length) out.push({ key: "regulators", weight: 0.06 });
  return out;
}

/**
 * Barometer pressure on 0..1. 0.5 is the neutral "holding" midpoint.
 * Higher = more downward pressure (worth attention); lower = lift/ease.
 * Displayed only as a marker inside Steady / Shifting / Building zones —
 * the raw value is never shown to the user.
 */
function computeBarometer(report, concerns, stabilizers) {
  const drift = report?.baselineMetrics?.drift || null;
  let pressure = 0.5;

  // Drift from personal baseline is the most honest single driver.
  if (drift && typeof drift.value === "number") {
    pressure -= clamp(drift.value, -1.2, 1.2) * 0.18; // calmer-than-baseline lowers pressure
  }

  // Volatility nudges the band toward "shifting".
  if (report?.volatilityLabel === "high variability") pressure += 0.1;
  else if (report?.volatilityLabel === "moderate swings") pressure += 0.05;
  else if (report?.volatilityLabel === "steady") pressure -= 0.04;

  for (const c of concerns) pressure += c.weight;
  for (const s of stabilizers) pressure -= s.weight;

  pressure = clamp01(pressure);

  let band;
  if (pressure < 0.4) band = "steady";
  else if (pressure < 0.62) band = "shifting";
  else band = "building";

  // Trend direction: prefer drift direction, else streaks.
  let direction = "holding";
  if (drift?.direction === "improving") direction = "easing";
  else if (drift?.direction === "declining") direction = "rising";
  else if (num(report?.negativeStreak?.days, 0) >= 2) direction = "rising";
  else if (num(report?.positiveStreak?.days, 0) >= 2) direction = "easing";

  return { pressure: Number(pressure.toFixed(3)), band, direction };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Friction zones (trigger → difficult emotion) — the trigger map proper. */
function buildFriction(report) {
  const weekly = report?.frictionZones || [];
  const longitudinal = report?.mirror?.frictionZones || [];
  const source = weekly.length ? weekly : longitudinal;
  const fromLongitudinal = !weekly.length && longitudinal.length > 0;
  return source.slice(0, 3).map((f) => ({
    trigger: f.trigger,
    emotion: f.emotion,
    count: num(f.count, 0),
    // ≥3 repeats reads as an established ("recurring") link; 2 is "emerging".
    strength: num(f.count, 0) >= 3 ? "recurring" : "emerging",
    span: fromLongitudinal ? "recent" : "thisWeek",
  }));
}

/** Regulators (trigger → steadying emotion) — what's helping. */
function buildRegulators(report) {
  const weekly = report?.regulators || [];
  const longitudinal = report?.mirror?.regulators || [];
  const source = weekly.length ? weekly : longitudinal;
  return source.slice(0, 2).map((r) => ({
    trigger: r.trigger,
    emotion: r.emotion,
    count: num(r.count, 0),
  }));
}

/**
 * First-run "seed" — the personal payoff before any pattern exists.
 * From the user's own (1–2) logs we surface the actual trigger/emotion they
 * recorded so the map has a real point on it from log one. We detect a *possible*
 * echo at two logs (same trigger or same emotion repeating) but never call it a
 * pattern — that honesty is enforced in copy and threshold elsewhere.
 */
function buildSeed(report) {
  const tf = report?.triggerFrequency || {};
  const ef = report?.emotionFrequency || {};
  const triggers = Object.entries(tf)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count: num(count, 0) }));
  const emotions = Object.entries(ef)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count: num(count, 0) }));

  const lead = {
    trigger: report?.topTrigger || triggers[0]?.key || null,
    emotion: report?.topEmotion || emotions[0]?.key || null,
  };
  // An "echo" is a coincidence worth a gentle look, NOT a pattern: the same
  // trigger or the same emotion showing up across the (only) two logs.
  const repeatedTrigger = triggers.find((tEntry) => tEntry.count >= 2)?.key || null;
  const repeatedEmotion = emotions.find((eEntry) => eEntry.count >= 2)?.key || null;

  return {
    lead,
    triggers,
    emotions,
    repeatedTrigger,
    repeatedEmotion,
    echo: !!(repeatedTrigger || repeatedEmotion),
  };
}

/** Emerging recurrences + carry-over signals worth a gentle watch. */
function buildWatch(report) {
  const out = [];
  for (const r of report?.recurrence || []) {
    if (r.label === "emerging") {
      out.push({ kind: "emergingPair", trigger: r.trigger, emotion: r.emotion, count: num(r.count, 0) });
    }
  }
  const contamination = report?.invokedMetrics?.contamination || [];
  for (const c of contamination.slice(0, 1)) {
    if (c?.sourceTrigger && c?.targetTrigger) {
      out.push({ kind: "carryOver", source: c.sourceTrigger, target: c.targetTrigger });
    }
  }
  return out.slice(0, 2);
}

/** What changed vs the prior window — localizable semantic items first. */
function buildChanges(report, progress) {
  const items = [];
  const d = report?.weeklyDeltas;
  if (d) {
    const trigs = Object.entries(d.triggerDeltas || {})
      .filter(([, v]) => v && v.delta)
      .sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta));
    if (trigs.length) {
      const [trigger, v] = trigs[0];
      items.push({ kind: "triggerDelta", trigger, delta: v.delta });
    }
    const emos = Object.entries(d.emotionDeltas || {})
      .filter(([, v]) => v && v.delta)
      .sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta));
    if (emos.length) {
      const [emotion, v] = emos[0];
      items.push({ kind: "emotionDelta", emotion, delta: v.delta });
    }
  }
  for (const p of progress?.patternShifts?.emerging || []) {
    if (p?.trigger && p?.emotion) {
      items.push({ kind: "newPattern", trigger: p.trigger, emotion: p.emotion });
    }
  }
  // Server-built, already-phrased highlights as a fallback (English-composed).
  if (!items.length) {
    for (const h of (report?.changeHighlights || []).slice(0, 2)) {
      items.push({ kind: "text", text: h });
    }
  }
  return items.slice(0, 3);
}

/**
 * Pick the single most relevant action to surface inline. Prefer a "try this"
 * regulator tied to the top friction trigger, then any awareness/experiment.
 */
function pickAction(report, friction) {
  const actions = report?.actions || [];
  if (!actions.length) return null;
  const topTrigger = friction[0]?.trigger;
  if (topTrigger) {
    const tied = actions.find(
      (a) => typeof a.id === "string" && a.id.toLowerCase().includes(String(topTrigger).toLowerCase())
    );
    if (tied) return tied;
  }
  const regulate = actions.find((a) => a.type === "regulate");
  return regulate || actions[0];
}

/**
 * Synthesize the full Trigger Map signal model.
 * @param {object|null} report   weekly report object (client-available)
 * @param {object|null} progress longitudinal progress object (nullable)
 * @returns {object} signal model (see file header)
 */
export function deriveSignalState(report, progress = null) {
  const dq = report?.dataQuality || {};
  const confidence = dq.confidence || "too_early";
  const totalMoments = num(report?.totalMoments, 0);
  const daysLogged = num(dq.daysLogged, 0);
  const lifetimeMoments = num(report?.lifetimeMoments, totalMoments);
  const isHistorical = lifetimeMoments >= 3;

  // Server-derived analysis (correlations / baseline / friction) is absent in the
  // offline-first local report. Without it we must NOT claim "steady" or surface a
  // pattern/concern read — we only have the shell. Detect that and degrade to a
  // "pending" forming state that upgrades in place when the server report lands.
  const analysisReady = !!(report?.baselineMetrics || report?.correlations || report?.frictionZones);

  const seed = buildSeed(report);
  const concerns = collectConcerns(report, progress);
  const stabilizers = collectStabilizers(report);
  const friction = buildFriction(report);
  const regulators = buildRegulators(report);
  const watch = buildWatch(report);
  const changes = buildChanges(report, progress);
  const barometer = computeBarometer(report, concerns, stabilizers);
  const action = pickAction(report, friction);

  // ── State resolution (priority order) ──
  // Value lands at the FIRST log: each early log is its own real state with
  // visible momentum, not one "insufficient data" shell. Three logs remains the
  // earliest threshold for an *observed pattern* (handled in the else branch).
  let state;
  let pending = false;
  if (confidence === "stale") {
    state = "dormant";
  } else if (!isHistorical) {
    // 0 → seeding (empty), 1 → reflection (first point), 2 → thread (possible echo).
    state = lifetimeMoments >= 2 ? "thread" : lifetimeMoments === 1 ? "reflection" : "seeding";
  } else if (!analysisReady) {
    // Offline shell: we have moments but the server hasn't returned its analysis yet.
    state = "forming";
    pending = true;
  } else {
    const hasConcern = concerns.length > 0;
    const enoughForConcern = confAtLeast(confidence, "emerging");
    const hasRecurringFriction = friction.some((f) => f.strength === "recurring");
    const hasFriction = friction.length > 0;
    const enoughForPattern = confAtLeast(confidence, "emerging");

    if (hasConcern && enoughForConcern && barometer.band !== "steady") {
      state = "building";
    } else if (hasRecurringFriction && enoughForPattern) {
      state = "pattern";
    } else if (!confAtLeast(confidence, "emerging")) {
      state = "forming";
    } else if (hasFriction && confAtLeast(confidence, "moderate")) {
      state = "pattern";
    } else {
      state = "steady";
    }
  }

  // The headline subject is the strongest friction link (if any).
  const lead = friction[0] || null;
  const topConcern = concerns.slice().sort((a, b) => b.weight - a.weight)[0] || null;

  const headline = buildHeadline(state, { lead, topConcern, barometer, confidence, seed });
  const divergence = buildDivergence(report);

  return {
    state,
    confidence,
    headline,
    seed,
    barometer: {
      ...barometer,
      confidence,
      enoughData: confAtLeast(confidence, "emerging") && analysisReady,
      concerns: concerns.map((c) => c.key),
      stabilizers: stabilizers.map((s) => s.key),
      topConcern: topConcern?.key || null,
      negDays: num(report?.negativeStreak?.days, 0),
      posDays: num(report?.positiveStreak?.days, 0),
      divergence,
    },
    connected: { friction, regulators },
    changes,
    watch,
    action,
    meta: {
      totalMoments,
      daysLogged,
      lifetimeMoments,
      isHistorical,
      pending,
      analysisReady,
      silenceDays: report?.silenceWindow?.daysSinceLastLog ?? null,
      hasProgress: !!progress,
    },
  };
}

/**
 * The "ground truth under the surface" series — the core payoff of the invoked
 * layer. Surface = reported daily score; ground = vacuum (trigger influence
 * removed). When ground sits notably below surface, the calm reading is being
 * propped up. Returns null unless the invoked layer is genuinely available.
 */
function buildDivergence(report) {
  const surface = report?.weeklyEmotionTrajectory || [];
  const vacuum = report?.invokedMetrics?.vacuumTrajectory || [];
  if (surface.length < 2 || vacuum.length < 2) return null;
  const vByDate = new Map(vacuum.map((v) => [v.date, v.vacuum]));
  const points = [];
  for (const s of surface) {
    if (!vByDate.has(s.date)) continue;
    const sv = s.score;
    const gv = vByDate.get(s.date);
    // Only plot days where both the surface score and the ground read are finite.
    if (typeof sv !== "number" || Number.isNaN(sv) || typeof gv !== "number" || Number.isNaN(gv)) continue;
    points.push({ date: s.date, surface: sv, ground: gv });
  }
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const gap = last.surface != null && last.ground != null ? Number((last.surface - last.ground).toFixed(2)) : 0;
  return {
    points,
    surface: points.map((p) => p.surface),
    ground: points.map((p) => p.ground),
    gap, // surface above ground = propped-up calm
    diverging: gap >= 0.4,
  };
}

/** Build the one-line headline as a semantic key + interpolation vars. */
function buildHeadline(state, { lead, topConcern, seed }) {
  switch (state) {
    case "reflection":
      return {
        key: "reflection",
        tone: "neutral",
        vars: { trigger: seed?.lead?.trigger || null, emotion: seed?.lead?.emotion || null },
      };
    case "thread":
      return {
        key: "thread",
        tone: "neutral",
        vars: {
          echo: !!seed?.echo,
          trigger: seed?.repeatedTrigger || seed?.lead?.trigger || null,
          emotion: seed?.repeatedEmotion || seed?.lead?.emotion || null,
        },
      };
    case "building":
      return { key: "building", tone: "warning", vars: { concern: topConcern?.key || null } };
    case "pattern":
      return {
        key: "pattern",
        tone: "attention",
        vars: lead ? { trigger: lead.trigger, emotion: lead.emotion } : {},
      };
    case "steady":
      return { key: "steady", tone: "calm", vars: {} };
    case "forming":
      return { key: "forming", tone: "neutral", vars: {} };
    case "dormant":
      return { key: "dormant", tone: "neutral", vars: {} };
    case "seeding":
    default:
      return { key: "seeding", tone: "neutral", vars: {} };
  }
}

export default deriveSignalState;
