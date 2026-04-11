/**
 * FULL METRICS AUDIT v2
 * 
 * Fixes from v1: 
 * - effectCount compared against report.correlations (what buildDrivers actually uses), not raw moments
 * - Progress score uses tolerance (not integer rounding)
 * - Silent user window matching improved
 * - Friction sort tie-breaking is non-deterministic: check SET equality not ORDER
 * - whereToFocus uses 45-day data: compare against all moments
 * 
 * Categories:
 *   P0: Data integrity — aggregate vs raw moment counts (MUST match)
 *   P1: Emotion mapping — every moment's stored emotion must match coordinates
 *   P2: Cross-section consistency — drivers/loops/whatWorking can't contradict
 *   P3: Internal API consistency — derived metrics match their inputs
 */

const BASE = 'https://backend-five-nu-92.vercel.app';

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

function coordinatesToLegacy(v, a) {
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.25) return 'neutral';
  if (v < -0.2) return a >= 0.7 ? 'anxious' : 'frustrated';
  if (v > 0.2)  return a >= 0   ? 'energized' : 'calm';
  return a >= 0 ? 'anxious' : 'calm';
}

function emotionAvgScore(emotionCounts) {
  let total = 0, weighted = 0;
  for (const [emo, count] of Object.entries(emotionCounts)) {
    const n = Number(count);
    total += n;
    weighted += (EMOTION_SCORE[emo] || 3) * n;
  }
  return total > 0 ? weighted / total : null;
}

function scoreToneLabel(score) {
  if (score == null) return null;
  if (score >= 4.2) return 'great';
  if (score >= 3.5) return 'good';
  if (score >= 2.8) return 'mixed';
  if (score >= 2.0) return 'uneasy';
  return 'tough';
}

// ── Issue Tracking ─────────────────────────────────────────────────

const issuesByPriority = { P0: [], P1: [], P2: [], P3: [] };
let totalChecks = 0, passed = 0;

function flag(priority, userId, metric, expected, actual) {
  totalChecks++;
  issuesByPriority[priority].push({ userId: userId.slice(0, 8), metric, expected, actual });
}

function ok() { totalChecks++; passed++; }

function checkEq(priority, userId, metric, expected, actual, tolerance = 0) {
  totalChecks++;
  if (expected == null && actual == null) { passed++; return; }
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) <= tolerance) { passed++; return; }
  } else if (JSON.stringify(expected) === JSON.stringify(actual)) { passed++; return; }
  issuesByPriority[priority].push({ userId: userId.slice(0, 8), metric, expected, actual });
}

// ── Per-User Audit ─────────────────────────────────────────────────

async function auditUser(deviceId) {
  const label = deviceId.slice(0, 8);

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
    console.log(`  [${label}] No/empty report (${allMoments.length} total moments) — skip`);
    return { skipped: true };
  }

  console.log(`  [${label}] timeline=${allMoments.length}, report.totalMoments=${report.totalMoments}`);

  // Determine the effective window the API used
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let recentMoments = allMoments.filter(m => m.timestamp >= sevenDaysAgo);
  let isSilent = false;

  if (recentMoments.length === 0 && allMoments.length >= 3) {
    isSilent = true;
    // Match the API's sliding window: find last active 7-day span
    const sorted = [...allMoments].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const lastTs = sorted[sorted.length - 1]?.timestamp;
    if (lastTs) {
      const windowStart = new Date(new Date(lastTs).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      recentMoments = allMoments.filter(m => m.timestamp >= windowStart);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P1: EMOTION MAPPING — every moment must map correctly
  // ═══════════════════════════════════════════════════════════════════

  let emotionErrors = [];
  for (const m of allMoments) {
    if (m.valence != null && m.arousal != null) {
      const expected = coordinatesToLegacy(m.valence, m.arousal);
      if (m.emotion !== expected) {
        emotionErrors.push({
          date: m.timestamp?.slice(0, 10),
          v: m.valence, a: m.arousal,
          stored: m.emotion, expected,
          trigger: m.trigger,
        });
      }
    }
  }
  if (emotionErrors.length === 0) ok();
  else {
    for (const e of emotionErrors.slice(0, 5)) {
      flag('P1', deviceId, 'emotion_mapping',
        `${e.expected} (v=${e.v}, a=${e.a})`,
        `${e.stored} [${e.date} ${e.trigger}]`);
    }
    if (emotionErrors.length > 5) {
      flag('P1', deviceId, 'emotion_mapping_overflow', `${emotionErrors.length} total errors`, '(truncated)');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P0: AGGREGATE vs RAW MOMENTS — data integrity
  // ═══════════════════════════════════════════════════════════════════

  // Recompute from timeline moments matching the report window
  const rawEmotionFreq = {};
  const rawTriggerFreq = {};
  const rawCorrelations = {};
  const rawEnergy = { steady: 0, balanced: 0, tense: 0, drained: 0, uplifted: 0 };

  for (const m of recentMoments) {
    const emo = m.emotion;
    const trigger = m.trigger;
    rawEmotionFreq[emo] = (rawEmotionFreq[emo] || 0) + 1;
    if (trigger) rawTriggerFreq[trigger] = (rawTriggerFreq[trigger] || 0) + 1;
    if (trigger && emo) {
      if (!rawCorrelations[trigger]) rawCorrelations[trigger] = {};
      rawCorrelations[trigger][emo] = (rawCorrelations[trigger][emo] || 0) + 1;
    }
    const energyBucket = ENERGY_MAP[emo] || 'balanced';
    rawEnergy[energyBucket]++;
  }

  // Total moments must match
  checkEq('P0', deviceId, 'totalMoments', recentMoments.length, report.totalMoments, 0);

  // Emotion frequencies
  const allEmotions = new Set([...Object.keys(rawEmotionFreq), ...Object.keys(report.emotionFrequency || {})]);
  for (const emo of allEmotions) {
    checkEq('P0', deviceId, `emotionFreq.${emo}`, rawEmotionFreq[emo] || 0, report.emotionFrequency?.[emo] || 0);
  }

  // Trigger frequencies
  const allTrigs = new Set([...Object.keys(rawTriggerFreq), ...Object.keys(report.triggerFrequency || {})]);
  for (const t of allTrigs) {
    checkEq('P0', deviceId, `triggerFreq.${t}`, rawTriggerFreq[t] || 0, report.triggerFrequency?.[t] || 0);
  }

  // Correlations
  const allCorrTrigs = new Set([...Object.keys(rawCorrelations), ...Object.keys(report.correlations || {})]);
  for (const t of allCorrTrigs) {
    const rawE = rawCorrelations[t] || {};
    const apiE = report.correlations?.[t] || {};
    for (const e of new Set([...Object.keys(rawE), ...Object.keys(apiE)])) {
      checkEq('P0', deviceId, `corr.${t}.${e}`, rawE[e] || 0, apiE[e] || 0);
    }
  }

  // Energy distribution
  for (const bucket of ['steady', 'balanced', 'tense', 'drained', 'uplifted']) {
    checkEq('P0', deviceId, `energy.${bucket}`, rawEnergy[bucket] || 0, report.energyDistribution?.[bucket] || 0);
  }

  // ═══════════════════════════════════════════════════════════════════
  // P3: REGULATORS & FRICTION — must match report.correlations
  // ═══════════════════════════════════════════════════════════════════

  // Build expected regulators/friction from report.correlations (not raw moments)
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

  const apiRegulators = report.regulators || [];
  const apiFriction = report.frictionZones || [];

  checkEq('P3', deviceId, 'regulators_count', expectedRegs.length, apiRegulators.length);
  checkEq('P3', deviceId, 'friction_count', expectedFric.length, apiFriction.length);

  // Check SET equality (ignore order for same-count items)
  const regSet = new Set(expectedRegs.map(r => `${r.trigger}|${r.emotion}|${r.count}`));
  const apiRegSet = new Set(apiRegulators.map(r => `${r.trigger}|${r.emotion}|${r.count}`));
  for (const r of regSet) {
    if (!apiRegSet.has(r)) flag('P3', deviceId, 'regulator_missing', r, 'not in API');
    else ok();
  }
  for (const r of apiRegSet) {
    if (!regSet.has(r)) flag('P3', deviceId, 'regulator_extra', 'not expected', r);
    else ok();
  }

  const fricSet = new Set(expectedFric.map(f => `${f.trigger}|${f.emotion}|${f.count}`));
  const apiFricSet = new Set(apiFriction.map(f => `${f.trigger}|${f.emotion}|${f.count}`));
  for (const f of fricSet) {
    if (!apiFricSet.has(f)) flag('P3', deviceId, 'friction_missing', f, 'not in API');
    else ok();
  }
  for (const f of apiFricSet) {
    if (!fricSet.has(f)) flag('P3', deviceId, 'friction_extra', 'not expected', f);
    else ok();
  }

  // ═══════════════════════════════════════════════════════════════════
  // P3: DRIVERS — effectCount must match report.correlations
  // ═══════════════════════════════════════════════════════════════════

  const drivers = report.aiInsight?.drivers || [];
  for (const d of drivers) {
    if (d.emotion && d.effect !== 'neutral') {
      // effectCount should match the correlation count from the report's own correlations
      const corrCount = apiCorr[d.trigger]?.[d.emotion] || 0;
      checkEq('P3', deviceId, `driver(${d.trigger}).effectCount_vs_corr`, corrCount, d.effectCount);

      // Effect validation: friction emotion should score ≤2, regulator ≥4
      const score = EMOTION_SCORE[d.emotion] || 3;
      if (d.effect === 'friction') {
        checkEq('P3', deviceId, `driver(${d.trigger}).friction_valid`, true, score <= 2);
      }
      if (d.effect === 'regulator') {
        checkEq('P3', deviceId, `driver(${d.trigger}).regulator_valid`, true, score >= 4);
      }
    }

    // count (total trigger frequency) should match report.triggerFrequency
    if (d.trigger) {
      const expectedTotalFreq = report.triggerFrequency?.[d.trigger] || 0;
      checkEq('P3', deviceId, `driver(${d.trigger}).count_vs_trigFreq`, expectedTotalFreq, d.count);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P2: CROSS-SECTION CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════

  const insight = report.aiInsight;
  if (insight) {
    // Build driver effect map
    const driverEffects = {};
    for (const d of (insight.drivers || [])) {
      if (d.effect !== 'neutral') driverEffects[d.trigger] = d.effect;
    }

    // Behavioral loop must agree with drivers on effect type
    for (const loop of (insight.behavioralLoop || [])) {
      const driverEffect = driverEffects[loop.trigger];
      if (driverEffect && driverEffect !== loop.type) {
        flag('P2', deviceId, 'driver_vs_loop',
          `${loop.trigger}: driver says ${driverEffect}`,
          `loop says ${loop.type}`);
      } else ok();
    }

    // What's Working shouldn't list friction triggers
    for (const w of (insight.whatWorking || [])) {
      if (w.trigger && driverEffects[w.trigger] === 'friction') {
        flag('P2', deviceId, 'whatWorking_has_friction',
          `${w.trigger} is friction in drivers`,
          `listed in whatWorking: "${w.text.slice(0, 60)}"`);
      } else if (w.trigger) ok();
    }

    // Where to Focus emotions should be negative (score ≤ 2)
    for (const w of (insight.whereToFocus || [])) {
      if (w.emotion) {
        const score = EMOTION_SCORE[w.emotion] || 3;
        if (score > 2) {
          flag('P2', deviceId, 'whereToFocus_positive_emotion',
            `${w.emotion} (score=${score}) should be ≤2`,
            `listed as focus: "${w.text.slice(0, 60)}"`);
        } else ok();
      }
    }

    // Behavioral loop count should match correlation count
    for (const loop of (insight.behavioralLoop || [])) {
      if (loop.trigger && loop.emotion) {
        const corrCount = apiCorr[loop.trigger]?.[loop.emotion] || 0;
        checkEq('P3', deviceId, `loop(${loop.trigger}).count_vs_corr`, corrCount, loop.count);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P3: PROGRESS TAB — score must match emotion distribution
  // ═══════════════════════════════════════════════════════════════════

  if (progress && progress.weeklySnapshots?.length) {
    for (const snap of progress.weeklySnapshots) {
      if (snap.emotions && Object.keys(snap.emotions).length > 0) {
        const expectedScore = emotionAvgScore(snap.emotions);
        if (expectedScore != null && snap.score != null) {
          // Score should be close to the emotion-weighted average (within ±0.1)
          checkEq('P3', deviceId, `progress(${snap.weekLabel}).score`,
            Math.round(expectedScore * 100) / 100,
            snap.score,
            0.1);

          // Tone should match the score range
          const expectedTone = scoreToneLabel(snap.score);
          checkEq('P3', deviceId, `progress(${snap.weekLabel}).tone`, expectedTone, snap.tone);
        }
      }

      // Moment count should roughly match emotion total (within ±1 due to potential edge-of-window)
      const emotionSum = Object.values(snap.emotions || {}).reduce((a, b) => a + b, 0);
      checkEq('P3', deviceId, `progress(${snap.weekLabel}).moments`, emotionSum, snap.moments, 1);
    }

    // Trajectory direction consistency
    if (progress.trajectory?.change != null) {
      const t = progress.trajectory;
      let expectedDir;
      if (t.change > 0.3) expectedDir = 'improving';
      else if (t.change < -0.3) expectedDir = 'declining';
      else expectedDir = 'stable';
      checkEq('P3', deviceId, 'trajectory.direction', expectedDir, t.direction);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P3: CENTROID — recompute from raw moments
  // ═══════════════════════════════════════════════════════════════════

  if (report.weeklyCentroid) {
    let valSum = 0, arSum = 0, contCount = 0;
    for (const m of recentMoments) {
      if (m.valence != null && m.arousal != null) {
        valSum += m.valence;
        arSum += m.arousal;
        contCount++;
      }
    }
    if (contCount > 0) {
      checkEq('P3', deviceId, 'centroid.valence',
        Math.round((valSum / contCount) * 100) / 100,
        Math.round(report.weeklyCentroid.valence * 100) / 100, 0.05);
      checkEq('P3', deviceId, 'centroid.arousal',
        Math.round((arSum / contCount) * 100) / 100,
        Math.round(report.weeklyCentroid.arousal * 100) / 100, 0.05);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // P3: BASELINE LABEL CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════

  const bm = report.baselineMetrics;
  if (bm?.baseline?.reliable) {
    const bs = bm.baseline.score;
    if (bs < 2 && bm.baseline.label !== 'emotionally strained') {
      flag('P3', deviceId, 'baseline.label', 'emotionally strained', bm.baseline.label);
    } else if (bs >= 2 && bs < 3 && bm.baseline.label !== 'tends toward tense') {
      flag('P3', deviceId, 'baseline.label', 'tends toward tense', bm.baseline.label);
    } else if (bs >= 3 && bs < 4 && bm.baseline.label !== 'balanced') {
      flag('P3', deviceId, 'baseline.label', 'balanced', bm.baseline.label);
    } else ok();

    // Drift direction
    if (bm.drift) {
      if (bm.drift.value > 0.15 && bm.drift.direction !== 'improving') {
        flag('P3', deviceId, 'drift.direction', 'improving', bm.drift.direction);
      } else if (bm.drift.value < -0.15 && bm.drift.direction !== 'declining') {
        flag('P3', deviceId, 'drift.direction', 'declining', bm.drift.direction);
      } else if (Math.abs(bm.drift.value) <= 0.15 && bm.drift.direction !== 'stable') {
        flag('P3', deviceId, 'drift.direction', 'stable', bm.drift.direction);
      } else ok();
    }
  }

  return { skipped: false };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        TRIGGERMAP FULL METRICS AUDIT v2             ║');
  console.log('║   P0=data integrity  P1=emotion  P2=consistency    ║');
  console.log('║   P3=internal logic                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const userIds = [
    '52b5c665-f3bc-4dfe-80f7-902575cb22a0',
    'a1510617-6c89-4055-94a2-b275edc48ca3',
    'c80e8e53-2f96-4b5c-be94-a34ba49792b4',
    '270a5bb6-9cdc-4a65-8a63-09f79d1bccaa',
    '6150aff2-5f50-473d-9963-76b1b238fe2d',
    '6bd86941-02ae-4ac5-97a0-fa37eda942f4',
    '6e82e572-9efa-4523-8066-eae2fd142a32',
    '80852aff-46a9-4bf1-9333-019d9e0c8a6e',
    '8ca9de86-62dc-43c7-889c-852666869f2f',
    'ba906bcb-740b-42ea-923a-2d8b11f8d455',
    'd2f6f8c1-3708-4ed7-b289-155b94e8f19e',
    '0eb264e9-da37-40b0-9788-4ae0e3a36989',
    '299c8778-a137-426b-97fa-62994a4f6c21',
    '3e7309cf-a096-47e8-a011-98d11622b5d2',
    'b27269a5-0ae8-4d30-9a30-86d275c25629',
    'f2827691-d84f-4684-b7c2-354ce5af6fb1',
    '4e9e1210-817a-404e-9dfa-4dfe17f02e9a',
    '8c118c2c-0926-4c6e-9ba2-0b5f53ffc054',
  ];

  console.log(`Auditing ${userIds.length} users...\n`);

  let audited = 0;
  for (const uid of userIds) {
    try {
      const result = await auditUser(uid);
      if (!result?.skipped) audited++;
    } catch (e) {
      console.log(`  [${uid.slice(0, 8)}] ERROR: ${e.message}`);
    }
  }

  // ── Report ──────────────────────────────────────────────────────────

  const totalIssues = Object.values(issuesByPriority).reduce((a, b) => a + b.length, 0);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`AUDIT COMPLETE: ${audited} users audited, ${totalChecks} checks`);
  console.log(`  ✅ PASSED: ${passed}`);
  console.log(`  ❌ FAILED: ${totalIssues}`);
  console.log('───────────────────────────────────────────────────────');
  console.log(`  P0 (data integrity):  ${issuesByPriority.P0.length}`);
  console.log(`  P1 (emotion mapping): ${issuesByPriority.P1.length}`);
  console.log(`  P2 (cross-section):   ${issuesByPriority.P2.length}`);
  console.log(`  P3 (internal logic):  ${issuesByPriority.P3.length}`);
  console.log('═══════════════════════════════════════════════════════');

  for (const [priority, issues] of Object.entries(issuesByPriority)) {
    if (issues.length === 0) continue;
    console.log(`\n── ${priority} FAILURES ──\n`);
    const byUser = {};
    for (const i of issues) {
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
    console.log('\n🎉 ALL CHECKS PASSED\n');
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
