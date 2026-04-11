#!/usr/bin/env node
/**
 * FULL SCAN → REPAIR → END-TO-END AUDIT
 *
 * Phase 1: Scan ALL users for emotion mapping mismatches (stored vs coordinatesToLegacy)
 * Phase 2: Repair mismatched moments directly in Redis + fix aggregates
 * Phase 3: End-to-end audit — recompute every metric from raw moments, compare to API
 *
 * Usage:
 *   node scripts/scan-repair-audit.mjs                # Full run: scan + repair + audit
 *   node scripts/scan-repair-audit.mjs --scan-only    # Scan only — dry run, no repairs
 *   node scripts/scan-repair-audit.mjs --audit-only   # Skip repair, run audit only
 *
 * Requires: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
 */

import "dotenv/config";
import { redis, redisKey, lrangeJson, pipeline } from "../services/redisClient.js";
import { listOwnerIds, repairAggregateForEdit } from "../services/aggregationService.js";

// ── CLI flags ──
const args = process.argv.slice(2);
const SCAN_ONLY  = args.includes("--scan-only");
const AUDIT_ONLY = args.includes("--audit-only");
const BASE = "https://backend-five-nu-92.vercel.app";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS (must match shared/constants/emotions.js exactly)
// ═══════════════════════════════════════════════════════════════════

const EMOTION_SCORE = {
  frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5,
  overwhelmed: 1, heavy: 1, uneasy: 2, low: 2, restless: 2,
  alert: 3, flat: 2, disconnected: 1, content: 4, grateful: 5,
  peaceful: 5, excited: 5,
};

const ENERGY_MAP = {
  calm: "steady", neutral: "balanced", anxious: "tense",
  frustrated: "drained", energized: "uplifted",
  overwhelmed: "tense", heavy: "drained", uneasy: "tense",
  low: "drained", restless: "tense", alert: "tense", flat: "drained",
  disconnected: "drained", content: "steady", grateful: "uplifted",
  peaceful: "steady", excited: "uplifted",
};

const EMOTIONS = ["calm", "neutral", "anxious", "frustrated", "energized"];

// Fixed coordinatesToLegacy (matching the code fix)
function coordinatesToLegacy(v, a) {
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.25) return "neutral";
  if (v < -0.2) return a >= 0.7 ? "anxious" : "frustrated";
  if (v > 0.2)  return a >= 0   ? "energized" : "calm";
  // Ambiguous band: require meaningful positive valence (>0.1) for positive emotions
  if (v > 0.1) return a >= 0 ? "energized" : "calm";
  // Near-zero or negative: map by arousal direction
  if (a > 0) return "anxious";
  if (a < 0) return "frustrated";
  return "neutral";
}

function emotionAvgScore(emotionCounts) {
  let total = 0, weighted = 0;
  for (const [emo, count] of Object.entries(emotionCounts || {})) {
    const n = Number(count || 0);
    total += n;
    weighted += (EMOTION_SCORE[emo] || 3) * n;
  }
  return total > 0 ? weighted / total : null;
}

// scoreToneLabel: Used by progressEngine for weekly snapshots
function scoreToneLabel(score) {
  if (score == null) return null;
  if (score >= 4.2) return "great";
  if (score >= 3.5) return "good";
  if (score >= 2.8) return "mixed";
  if (score >= 2.0) return "uneasy";
  return "tough";
}

// trajectoryTone: Used by patternEngine for daily trajectory entries
function trajectoryTone(score) {
  if (score == null) return null;
  if (score >= 4) return "positive";
  if (score >= 2.5) return "mixed";
  return "negative";
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 1: SCAN ALL USERS FOR EMOTION MISMATCHES
// ═══════════════════════════════════════════════════════════════════

async function scanAllUsers() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║           PHASE 1: EMOTION MAPPING SCAN            ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const ownerIds = await listOwnerIds();
  console.log(`Found ${ownerIds.length} users\n`);

  const allMismatches = [];

  for (const ownerId of ownerIds) {
    const label = ownerId.slice(0, 8);
    const moments = await lrangeJson(redisKey("moments", ownerId));

    if (!moments.length) {
      console.log(`  [${label}] 0 moments — skip`);
      continue;
    }

    const mismatches = [];
    for (const m of moments) {
      if (typeof m.valence !== "number" || typeof m.arousal !== "number") continue;
      const expected = coordinatesToLegacy(m.valence, m.arousal);
      if (m.emotion !== expected) {
        mismatches.push({
          ownerId,
          id: m.id,
          date: m.timestamp?.slice(0, 10),
          trigger: m.trigger,
          v: m.valence,
          a: m.arousal,
          stored: m.emotion,
          expected,
          moment: m,
        });
      }
    }

    if (mismatches.length === 0) {
      console.log(`  [${label}] ${moments.length} moments — all correct ✓`);
    } else {
      console.log(`  [${label}] ${moments.length} moments — ${mismatches.length} MISMATCHES:`);
      for (const mm of mismatches) {
        console.log(`    ❌ ${mm.date} ${mm.trigger} v=${mm.v} a=${mm.a}: stored=${mm.stored} expected=${mm.expected}`);
      }
      allMismatches.push(...mismatches);
    }
  }

  console.log(`\n── SCAN SUMMARY ──`);
  console.log(`Total mismatches: ${allMismatches.length}`);
  if (allMismatches.length > 0) {
    const byStored = {};
    for (const mm of allMismatches) {
      const key = `${mm.stored}→${mm.expected}`;
      byStored[key] = (byStored[key] || 0) + 1;
    }
    console.log("Mismatch breakdown:");
    for (const [key, count] of Object.entries(byStored).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }
  }

  return allMismatches;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: REPAIR MISMATCHED MOMENTS
// ═══════════════════════════════════════════════════════════════════

async function repairMismatches(mismatches) {
  if (mismatches.length === 0) {
    console.log("\n✅ No mismatches to repair.\n");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          PHASE 2: REPAIRING MISMATCHES             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Group by ownerId for batch efficiency
  const byOwner = {};
  for (const mm of mismatches) {
    if (!byOwner[mm.ownerId]) byOwner[mm.ownerId] = [];
    byOwner[mm.ownerId].push(mm);
  }

  let repaired = 0;
  let failed = 0;

  for (const [ownerId, ownerMismatches] of Object.entries(byOwner)) {
    const label = ownerId.slice(0, 8);
    console.log(`  [${label}] Repairing ${ownerMismatches.length} moments...`);

    // Read all moments for this user
    const key = redisKey("moments", ownerId);
    const moments = await lrangeJson(key);

    let momentsChanged = false;

    for (const mm of ownerMismatches) {
      const idx = moments.findIndex((m) => m.id === mm.id);
      if (idx === -1) {
        console.log(`    ⚠ Moment ${mm.id.slice(0, 8)} not found — skip`);
        failed++;
        continue;
      }

      const original = { ...moments[idx] };
      const updated = { ...moments[idx], emotion: mm.expected, emotion_legacy: mm.expected, editedAt: new Date().toISOString() };
      moments[idx] = updated;
      momentsChanged = true;

      // Fix aggregates: decrement old emotion, increment new
      await repairAggregateForEdit(original, updated);
      repaired++;

      console.log(`    ✓ ${mm.id.slice(0, 8)} (${mm.date} ${mm.trigger}): ${mm.stored} → ${mm.expected}`);
    }

    // Write back the full moment list
    if (momentsChanged) {
      await redis(["DEL", key]);
      if (moments.length) {
        await redis(["RPUSH", key, ...moments.map((m) => JSON.stringify(m))]);
      }
    }
  }

  console.log(`\n── REPAIR SUMMARY ──`);
  console.log(`  Repaired: ${repaired}`);
  console.log(`  Failed:   ${failed}`);
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 3: END-TO-END AUDIT — EVERY TAB, EVERY METRIC
// ═══════════════════════════════════════════════════════════════════

const issues = { P0: [], P1: [], P2: [], P3: [] };
let totalChecks = 0;
let passed = 0;

function flag(priority, userId, metric, expected, actual) {
  totalChecks++;
  issues[priority].push({ userId: userId.slice(0, 8), metric, expected, actual });
}

function ok() { totalChecks++; passed++; }

function checkEq(priority, userId, metric, expected, actual, tolerance = 0) {
  totalChecks++;
  if (expected == null && actual == null) { passed++; return; }
  if (typeof expected === "number" && typeof actual === "number") {
    if (Math.abs(expected - actual) <= tolerance) { passed++; return; }
  } else if (JSON.stringify(expected) === JSON.stringify(actual)) { passed++; return; }
  issues[priority].push({ userId: userId.slice(0, 8), metric, expected, actual });
}

function checkSetEq(priority, userId, metric, expectedSet, actualSet) {
  totalChecks++;
  const missing = [...expectedSet].filter((x) => !actualSet.has(x));
  const extra = [...actualSet].filter((x) => !expectedSet.has(x));
  if (missing.length === 0 && extra.length === 0) { passed++; return; }
  issues[priority].push({
    userId: userId.slice(0, 8),
    metric,
    expected: missing.length ? `missing: ${missing.join(", ")}` : "OK",
    actual: extra.length ? `extra: ${extra.join(", ")}` : "OK",
  });
}

async function auditUser(deviceId) {
  const label = deviceId.slice(0, 8);

  // Fetch all three API tabs in parallel
  const [reportRes, timelineRes, progressRes] = await Promise.all([
    fetch(`${BASE}/api/weeklyReport?deviceId=${deviceId}`),
    fetch(`${BASE}/api/timeline?deviceId=${deviceId}`),
    fetch(`${BASE}/api/progress?deviceId=${deviceId}`),
  ]);

  const reportData = await reportRes.json();
  const timelineData = await timelineRes.json();
  const progressData = await progressRes.json();

  const report = reportData.data?.report;
  const allMoments = timelineData.data?.moments || [];
  const progress = progressData.data?.progress;

  if (!report || report.totalMoments === 0) {
    console.log(`  [${label}] No report — skip`);
    return { skipped: true };
  }

  console.log(`  [${label}] timeline=${allMoments.length}, report.total=${report.totalMoments}, mirror.total=${report.mirror?.totalMoments || "N/A"}`);

  // ── Determine effective 7-day window (matching API's silence logic) ──
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
  let recentMoments = allMoments.filter((m) => m.timestamp >= sevenDaysAgo);
  let isSilent = false;

  if (recentMoments.length === 0 && allMoments.length >= 3) {
    isSilent = true;
    // API uses "last 7 active days" sliding window
    const dates = [...new Set(allMoments.map((m) => m.timestamp.slice(0, 10)))].sort();
    const activeDates = dates.slice(-7);
    const windowStart = activeDates[0];
    recentMoments = allMoments.filter((m) => m.timestamp.slice(0, 10) >= windowStart);
    console.log(`    Silent user: window=[${windowStart}..${activeDates.at(-1)}], moments=${recentMoments.length}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // P1: EMOTION MAPPING — every moment must map correctly
  // ═══════════════════════════════════════════════════════════════
  for (const m of allMoments) {
    if (typeof m.valence !== "number" || typeof m.arousal !== "number") continue;
    const expected = coordinatesToLegacy(m.valence, m.arousal);
    if (m.emotion !== expected) {
      flag("P1", deviceId, `emotion_mismatch(${m.id.slice(0, 8)})`,
        `${expected} (v=${m.valence}, a=${m.arousal})`, m.emotion);
    } else ok();
  }

  // ═══════════════════════════════════════════════════════════════
  // P0: RAW MOMENTS vs API REPORT — data integrity
  // ═══════════════════════════════════════════════════════════════
  const rawEmotionFreq = {};
  const rawTriggerFreq = {};
  const rawCorrelations = {};
  const rawEnergy = { steady: 0, balanced: 0, tense: 0, drained: 0, uplifted: 0 };
  let rawValSum = 0, rawArSum = 0, rawContCount = 0;

  for (const m of recentMoments) {
    const emo = m.emotion;
    const trigger = m.trigger;
    rawEmotionFreq[emo] = (rawEmotionFreq[emo] || 0) + 1;
    if (trigger) rawTriggerFreq[trigger] = (rawTriggerFreq[trigger] || 0) + 1;
    if (trigger && emo) {
      if (!rawCorrelations[trigger]) rawCorrelations[trigger] = {};
      rawCorrelations[trigger][emo] = (rawCorrelations[trigger][emo] || 0) + 1;
    }
    rawEnergy[ENERGY_MAP[emo] || "balanced"]++;
    if (typeof m.valence === "number" && typeof m.arousal === "number") {
      rawValSum += m.valence;
      rawArSum += m.arousal;
      rawContCount++;
    }
  }

  // P0: Total moments
  checkEq("P0", deviceId, "totalMoments", recentMoments.length, report.totalMoments);

  // P0: Emotion frequencies (set-based — ignore key order)
  const allEmos = new Set([...Object.keys(rawEmotionFreq), ...Object.keys(report.emotionFrequency || {})]);
  for (const emo of allEmos) {
    checkEq("P0", deviceId, `emotionFreq.${emo}`, rawEmotionFreq[emo] || 0, report.emotionFrequency?.[emo] || 0);
  }

  // P0: Trigger frequencies
  const allTrigs = new Set([...Object.keys(rawTriggerFreq), ...Object.keys(report.triggerFrequency || {})]);
  for (const trig of allTrigs) {
    checkEq("P0", deviceId, `triggerFreq.${trig}`, rawTriggerFreq[trig] || 0, report.triggerFrequency?.[trig] || 0);
  }

  // P0: Correlations
  const allCorrTrigs = new Set([...Object.keys(rawCorrelations), ...Object.keys(report.correlations || {})]);
  for (const trig of allCorrTrigs) {
    const rawE = rawCorrelations[trig] || {};
    const apiE = report.correlations?.[trig] || {};
    for (const e of new Set([...Object.keys(rawE), ...Object.keys(apiE)])) {
      checkEq("P0", deviceId, `corr.${trig}.${e}`, rawE[e] || 0, apiE[e] || 0);
    }
  }

  // P0: Energy distribution
  for (const bucket of ["steady", "balanced", "tense", "drained", "uplifted"]) {
    checkEq("P0", deviceId, `energy.${bucket}`, rawEnergy[bucket] || 0, report.energyDistribution?.[bucket] || 0);
  }

  // P0: Average score from emotion distribution
  const expectedAvgScore = emotionAvgScore(report.emotionFrequency);
  const rawAvgScore = emotionAvgScore(rawEmotionFreq);
  if (expectedAvgScore != null && rawAvgScore != null) {
    checkEq("P0", deviceId, "avgScore(raw_vs_api)", rawAvgScore, expectedAvgScore, 0.01);
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: CENTROID — recompute from raw moments
  // ═══════════════════════════════════════════════════════════════
  if (report.weeklyCentroid && rawContCount > 0) {
    const expValence = Math.round((rawValSum / rawContCount) * 100) / 100;
    const expArousal = Math.round((rawArSum / rawContCount) * 100) / 100;
    checkEq("P3", deviceId, "centroid.valence", expValence,
      Math.round(report.weeklyCentroid.valence * 100) / 100, 0.1);
    checkEq("P3", deviceId, "centroid.arousal", expArousal,
      Math.round(report.weeklyCentroid.arousal * 100) / 100, 0.1);
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: REGULATORS & FRICTION — from report.correlations
  // ═══════════════════════════════════════════════════════════════
  const apiCorr = report.correlations || {};
  const expectedRegs = [];
  const expectedFric = [];
  for (const [trigger, emotions] of Object.entries(apiCorr)) {
    for (const [emotion, count] of Object.entries(emotions)) {
      if (count < 2) continue;
      const score = EMOTION_SCORE[emotion] || 3;
      if (score >= 4) expectedRegs.push({ trigger, emotion, count });
      if (score <= 2) expectedFric.push({ trigger, emotion, count });
    }
  }
  expectedRegs.sort((a, b) => b.count - a.count);
  expectedFric.sort((a, b) => b.count - a.count);

  const apiRegs = report.regulators || [];
  const apiFric = report.frictionZones || [];

  // Set-based comparison (ignore order for same-count items)
  const regSetExp = new Set(expectedRegs.map((r) => `${r.trigger}|${r.emotion}|${r.count}`));
  const regSetApi = new Set(apiRegs.map((r) => `${r.trigger}|${r.emotion}|${r.count}`));
  checkSetEq("P3", deviceId, "regulators", regSetExp, regSetApi);

  const fricSetExp = new Set(expectedFric.map((f) => `${f.trigger}|${f.emotion}|${f.count}`));
  const fricSetApi = new Set(apiFric.map((f) => `${f.trigger}|${f.emotion}|${f.count}`));
  checkSetEq("P3", deviceId, "frictionZones", fricSetExp, fricSetApi);

  // ═══════════════════════════════════════════════════════════════
  // P3: DRIVERS — use mirror data (45-day) like buildDrivers does
  // ═══════════════════════════════════════════════════════════════
  const mirror = report.mirror || {};
  const mirrorCorr = mirror.correlations || {};
  const mirrorTrigFreq = mirror.triggerFrequency || {};
  const drivers = report.aiInsight?.drivers || [];

  for (const d of drivers) {
    // count should match mirror's triggerFrequency (45-day)
    if (d.trigger) {
      const mirrorCount = mirrorTrigFreq[d.trigger] || 0;
      checkEq("P3", deviceId, `driver(${d.trigger}).count`, mirrorCount, d.count);
    }

    // effectCount should match the dominant correlation count from mirror
    if (d.emotion && d.effect !== "neutral") {
      const corrCount = mirrorCorr[d.trigger]?.[d.emotion] || 0;
      checkEq("P3", deviceId, `driver(${d.trigger}).effectCount`, corrCount, d.effectCount);

      // Effect label validation
      const score = EMOTION_SCORE[d.emotion] || 3;
      if (d.effect === "friction") {
        checkEq("P3", deviceId, `driver(${d.trigger}).friction_valid`, true, score <= 2);
      }
      if (d.effect === "regulator") {
        checkEq("P3", deviceId, `driver(${d.trigger}).reg_valid`, true, score >= 4);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: BEHAVIORAL LOOP — from mirror correlations
  // ═══════════════════════════════════════════════════════════════
  const loops = report.aiInsight?.behavioralLoop || [];
  for (const loop of loops) {
    if (loop.trigger && loop.emotion) {
      const corrCount = mirrorCorr[loop.trigger]?.[loop.emotion] || 0;
      checkEq("P3", deviceId, `loop(${loop.trigger}).count`, corrCount, loop.count);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P2: CROSS-SECTION CONSISTENCY — no contradictions
  // ═══════════════════════════════════════════════════════════════
  const insight = report.aiInsight;
  if (insight) {
    const driverEffects = {};
    for (const d of (insight.drivers || [])) {
      if (d.effect !== "neutral") driverEffects[d.trigger] = d.effect;
    }

    // Behavioral loop must agree with drivers on effect type
    for (const loop of (insight.behavioralLoop || [])) {
      const de = driverEffects[loop.trigger];
      if (de && de !== loop.type) {
        flag("P2", deviceId, "driver_vs_loop",
          `${loop.trigger}: driver=${de}`, `loop=${loop.type}`);
      } else ok();
    }

    // What's Working shouldn't list friction triggers
    for (const w of (insight.whatWorking || [])) {
      if (w.trigger && driverEffects[w.trigger] === "friction") {
        flag("P2", deviceId, "whatWorking_has_friction",
          `${w.trigger} is friction`, `in whatWorking`);
      } else if (w.trigger) ok();
    }

    // Where to Focus emotions should be negative (score ≤ 2)
    for (const w of (insight.whereToFocus || [])) {
      if (w.emotion) {
        const score = EMOTION_SCORE[w.emotion] || 3;
        if (score > 2) {
          flag("P2", deviceId, "whereToFocus_positive", `${w.emotion} score=${score}`, "should be ≤2");
        } else ok();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: PROGRESS TAB — scores, tones, trajectories
  // ═══════════════════════════════════════════════════════════════
  if (progress?.weeklySnapshots?.length) {
    for (const snap of progress.weeklySnapshots) {
      if (snap.emotions && Object.keys(snap.emotions).length > 0) {
        const expectedScore = emotionAvgScore(snap.emotions);
        if (expectedScore != null && snap.score != null) {
          checkEq("P3", deviceId, `progress(${snap.weekLabel}).score`,
            Math.round(expectedScore * 100) / 100, snap.score, 0.15);

          const expectedTone = scoreToneLabel(snap.score);
          checkEq("P3", deviceId, `progress(${snap.weekLabel}).tone`, expectedTone, snap.tone);
        }
      }

      // Moment count should match emotion total
      const emotionSum = Object.values(snap.emotions || {}).reduce((a, b) => a + b, 0);
      checkEq("P3", deviceId, `progress(${snap.weekLabel}).moments`, emotionSum, snap.moments, 1);
    }

    // Trajectory direction consistency
    if (progress.trajectory?.change != null) {
      const t = progress.trajectory;
      if (t.change > 0.5 && t.direction === "declining") {
        flag("P3", deviceId, "trajectory.direction", "improving (change>0.5)", t.direction);
      } else if (t.change < -0.5 && t.direction === "improving") {
        flag("P3", deviceId, "trajectory.direction", "declining (change<-0.5)", t.direction);
      } else ok();
    }

    // Pattern shifts: check that referenced triggers exist in the data
    if (progress.patternShifts?.length) {
      for (const ps of progress.patternShifts) {
        if (ps.trigger) {
          // Should exist in at least one weekly snapshot
          const foundInAnyWeek = progress.weeklySnapshots.some((snap) => {
            const pairs = snap.pairs || {};
            return Object.keys(pairs).some((k) => k.startsWith(ps.trigger + "|"));
          });
          const foundInMirror = mirrorTrigFreq[ps.trigger] > 0;
          if (foundInAnyWeek || foundInMirror) ok();
          else flag("P3", deviceId, `patternShift(${ps.trigger})`, "exists in data", "not found");
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: BASELINE METRICS — labels match values
  // ═══════════════════════════════════════════════════════════════
  const bm = report.baselineMetrics;
  if (bm?.baseline?.reliable) {
    const bs = bm.baseline.score;

    // Baseline label consistency
    if (bs < 2 && bm.baseline.label !== "emotionally strained") {
      flag("P3", deviceId, "baseline.label", "emotionally strained", bm.baseline.label);
    } else if (bs >= 2 && bs < 3 && bm.baseline.label !== "tends toward tense") {
      flag("P3", deviceId, "baseline.label", "tends toward tense", bm.baseline.label);
    } else if (bs >= 3 && bs < 4 && bm.baseline.label !== "balanced") {
      flag("P3", deviceId, "baseline.label", "balanced", bm.baseline.label);
    } else ok();

    // Drift direction vs value
    if (bm.drift) {
      if (bm.drift.value > 0.15 && bm.drift.direction !== "improving") {
        flag("P3", deviceId, "drift.direction_vs_value", "improving (drift>0.15)", bm.drift.direction);
      } else if (bm.drift.value < -0.15 && bm.drift.direction !== "declining") {
        flag("P3", deviceId, "drift.direction_vs_value", "declining (drift<-0.15)", bm.drift.direction);
      } else if (Math.abs(bm.drift.value) <= 0.15 && bm.drift.direction !== "stable") {
        flag("P3", deviceId, "drift.direction_vs_value", "stable (|drift|≤0.15)", bm.drift.direction);
      } else ok();

      // Drift label consistency (graduated labels)
      const dv = bm.drift.value;
      let expectedLabel;
      if (dv > 0.8) expectedLabel = "significantly improving";
      else if (dv > 0.4) expectedLabel = "improving";
      else if (dv > 0.15) expectedLabel = "slightly improving";
      else if (dv >= -0.15) expectedLabel = "stable";
      else if (dv >= -0.4) expectedLabel = "slightly declining";
      else if (dv >= -0.8) expectedLabel = "declining";
      else expectedLabel = "significantly declining";
      checkEq("P3", deviceId, "drift.label", expectedLabel, bm.drift.label);
    }

    // Stability label vs score
    if (bm.stability) {
      const ss = bm.stability.score;
      let expectedStabLabel;
      if (ss >= 0.8) expectedStabLabel = "very steady";
      else if (ss >= 0.6) expectedStabLabel = "mostly steady";
      else if (ss >= 0.4) expectedStabLabel = "moderate fluctuation";
      else if (ss >= 0.2) expectedStabLabel = "frequent shifts";
      else expectedStabLabel = "highly variable";
      checkEq("P3", deviceId, "stability.label", expectedStabLabel, bm.stability.label);
    }

    // Recovery latency label vs days
    if (bm.recoveryLatency) {
      const rd = bm.recoveryLatency.days;
      let expectedRecLabel;
      if (rd <= 1) expectedRecLabel = "bounce back quickly";
      else if (rd <= 2) expectedRecLabel = "recover within a couple of days";
      else if (rd <= 4) expectedRecLabel = "take a few days to settle";
      else expectedRecLabel = "take longer to return to baseline";
      checkEq("P3", deviceId, "recovery.label", expectedRecLabel, bm.recoveryLatency.label);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: MIRROR DATA — 45-day aggregates integrity
  // ═══════════════════════════════════════════════════════════════
  if (mirror.totalMoments != null) {
    // Mirror total should equal all moments count (within 45-day TTL)
    const mirrorExpected = allMoments.length;
    // Allow some tolerance — moments older than 45 days may have expired from aggregates
    if (mirror.totalMoments > mirrorExpected + 1) {
      flag("P3", deviceId, "mirror.totalMoments",
        `≤${mirrorExpected}`, mirror.totalMoments);
    } else ok();
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: WEEKLY EMOTION TRAJECTORY — scores match emotion distribution
  // ═══════════════════════════════════════════════════════════════
  if (report.weeklyEmotionTrajectory?.length) {
    for (const dayEntry of report.weeklyEmotionTrajectory) {
      if (dayEntry.score != null) {
        const expectedTone = trajectoryTone(dayEntry.score);
        checkEq("P3", deviceId,
          `trajectory(${dayEntry.date}).tone`, expectedTone, dayEntry.tone);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: VOLATILITY LABEL
  // ═══════════════════════════════════════════════════════════════
  if (report.volatilityScore != null) {
    let expectedVLabel;
    const vs = report.volatilityScore;
    if (vs < 0.3) expectedVLabel = "steady";
    else if (vs < 0.8) expectedVLabel = "mild shifts";
    else if (vs < 1.5) expectedVLabel = "moderate swings";
    else expectedVLabel = "high variability";
    checkEq("P3", deviceId, "volatility.label", expectedVLabel, report.volatilityLabel);
  }

  // ═══════════════════════════════════════════════════════════════
  // P3: DATA QUALITY / CONFIDENCE
  // ═══════════════════════════════════════════════════════════════
  if (report.dataQuality) {
    const dq = report.dataQuality;
    const tm = report.totalMoments;
    const dl = dq.daysLogged;

    let expectedConf;
    if (isSilent) expectedConf = "stale";
    else if (tm < 3) expectedConf = "too_early";
    else if (tm < 5 || dl < 2) expectedConf = "low";
    else if (tm < 8 || dl < 3) expectedConf = "emerging";
    else if (tm < 15 || dl < 5) expectedConf = "moderate";
    else expectedConf = "strong";
    checkEq("P3", deviceId, "confidence", expectedConf, dq.confidence);
  }

  return { skipped: false };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const userIds = await listOwnerIds();
  // Filter out test archetype runner
  const realUsers = userIds.filter((id) => !id.includes("00000000"));

  // ── Phase 1 + 2: Scan & Repair ──
  if (!AUDIT_ONLY) {
    const mismatches = await scanAllUsers();

    if (!SCAN_ONLY && mismatches.length > 0) {
      await repairMismatches(mismatches);

      // Wait a moment for eventual consistency
      console.log("\nWaiting 3s for aggregate propagation...");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (SCAN_ONLY) {
    console.log("\n--scan-only mode: skipping audit.\n");
    return;
  }

  // ── Phase 3: Full End-to-End Audit ──
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       PHASE 3: END-TO-END METRICS AUDIT            ║");
  console.log("║   P0=data integrity  P1=emotion  P2=consistency    ║");
  console.log("║   P3=internal logic (drivers use 45d mirror)       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log(`Auditing ${realUsers.length} users...\n`);

  let audited = 0;
  for (const uid of realUsers) {
    try {
      const result = await auditUser(uid);
      if (!result?.skipped) audited++;
    } catch (e) {
      console.log(`  [${uid.slice(0, 8)}] ERROR: ${e.message}`);
    }
  }

  // ── Report ──
  const totalIssues = Object.values(issues).reduce((a, b) => a + b.length, 0);

  console.log("\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`AUDIT COMPLETE: ${audited} users, ${totalChecks} checks`);
  console.log(`  ✅ PASSED: ${passed}`);
  console.log(`  ❌ FAILED: ${totalIssues}`);
  console.log("───────────────────────────────────────────────────────");
  console.log(`  P0 (data integrity):  ${issues.P0.length}`);
  console.log(`  P1 (emotion mapping): ${issues.P1.length}`);
  console.log(`  P2 (cross-section):   ${issues.P2.length}`);
  console.log(`  P3 (internal logic):  ${issues.P3.length}`);
  console.log("═══════════════════════════════════════════════════════");

  for (const [priority, pIssues] of Object.entries(issues)) {
    if (pIssues.length === 0) continue;
    console.log(`\n── ${priority} FAILURES ──\n`);
    const byUser = {};
    for (const i of pIssues) {
      if (!byUser[i.userId]) byUser[i.userId] = [];
      byUser[i.userId].push(i);
    }
    for (const [uid, userIssues] of Object.entries(byUser)) {
      console.log(`[${uid}]`);
      for (const i of userIssues) {
        console.log(`  ❌ ${i.metric}`);
        console.log(`     expected: ${JSON.stringify(i.expected)}`);
        console.log(`     actual:   ${JSON.stringify(i.actual)}`);
      }
    }
  }

  if (totalIssues === 0) {
    console.log("\n🎉 ALL CHECKS PASSED — EVERY TAB, EVERY METRIC\n");
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
