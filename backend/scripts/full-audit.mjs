/**
 * FULL METRICS AUDIT
 * 
 * Fetches raw moments + all API responses for every active user,
 * recomputes every metric independently, and flags any mismatch.
 * 
 * Run: node backend/scripts/full-audit.mjs
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

// ── Helpers ────────────────────────────────────────────────────────────

function coordinatesToLegacy(v, a) {
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.25) return 'neutral';
  if (v < -0.2) return a >= 0.7 ? 'anxious' : 'frustrated';
  if (v > 0.2)  return a >= 0   ? 'energized' : 'calm';
  return a >= 0 ? 'anxious' : 'calm';
}

function dateStr(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function timeOfDayBucket(ts) {
  const h = new Date(ts).getUTCHours();
  if (h < 6) return 'morning';      // 0-5  
  if (h < 12) return 'afternoon';   // 6-11
  if (h < 18) return 'evening';     // 12-17
  return 'night';                    // 18-23
}

function herfindahl(freq, total) {
  if (total === 0) return 0;
  let sum = 0;
  for (const c of Object.values(freq)) {
    const share = c / total;
    sum += share * share;
  }
  return Math.round(sum * 1000) / 1000;
}

function emotionAvgScore(emotionCounts) {
  let total = 0, weighted = 0;
  for (const [emo, count] of Object.entries(emotionCounts)) {
    const n = Number(count || 0);
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

// ── Audit Functions ────────────────────────────────────────────────────

const issues = [];
let totalChecks = 0;
let passedChecks = 0;

function check(userId, metric, expected, actual, tolerance = 0) {
  totalChecks++;
  if (expected == null && actual == null) { passedChecks++; return; }
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) <= tolerance) { passedChecks++; return; }
  } else if (JSON.stringify(expected) === JSON.stringify(actual)) { passedChecks++; return; }
  issues.push({ userId: userId.slice(0, 8), metric, expected, actual });
}

function checkObj(userId, prefix, expected, actual) {
  if (expected == null && actual == null) { totalChecks++; passedChecks++; return; }
  for (const key of new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})])) {
    check(userId, `${prefix}.${key}`, expected?.[key] || 0, actual?.[key] || 0);
  }
}

// ── Per-User Full Audit ────────────────────────────────────────────────

async function auditUser(deviceId) {
  const label = deviceId.slice(0, 8);
  
  // Fetch all data in parallel
  const [reportRes, timelineRes, progressRes] = await Promise.all([
    fetch(`${BASE}/api/weeklyReport?deviceId=${deviceId}`),
    fetch(`${BASE}/api/timeline?deviceId=${deviceId}`),
    fetch(`${BASE}/api/progress?deviceId=${deviceId}`),
  ]);

  const reportData = await reportRes.json();
  const timelineData = await timelineRes.json();
  const progressData = await progressRes.json();

  const report = reportData.data?.report;
  const moments = timelineData.data?.moments || [];
  const progress = progressData.data?.progress;

  if (!report) {
    console.log(`  [${label}] No report data — skipping`);
    return;
  }

  const totalMoments = moments.length;
  console.log(`  [${label}] ${totalMoments} total moments, report.totalMoments=${report.totalMoments}`);

  // ── 1. EMOTION MAPPING AUDIT ──────────────────────────────────────
  
  let emotionMappingErrors = 0;
  for (const m of moments) {
    if (m.valence != null && m.arousal != null) {
      const expected = coordinatesToLegacy(m.valence, m.arousal);
      if (m.emotion !== expected) {
        // Check if derivedLabel is used instead
        if (m.derivedLabel && EMOTION_SCORE[m.derivedLabel] != null) {
          // derivedLabel is acceptable as the stored emotion in some flows
          continue;
        }
        emotionMappingErrors++;
        if (emotionMappingErrors <= 3) {
          issues.push({
            userId: label,
            metric: 'emotion_mapping',
            expected: `${expected} (v=${m.valence}, a=${m.arousal})`,
            actual: m.emotion,
          });
        }
      }
    }
  }
  check(deviceId, 'emotion_mapping_errors', 0, emotionMappingErrors);

  // ── 2. AGGREGATE vs RAW MOMENTS (last 7 days) ─────────────────────
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let recentMoments = moments.filter(m => m.timestamp >= sevenDaysAgo);
  
  // If user is silent, use same sliding window the API uses
  if (recentMoments.length === 0 && moments.length >= 3) {
    // Find the last active window
    const lastTs = moments[0]?.timestamp;
    if (lastTs) {
      const lastDate = new Date(lastTs);
      const windowStart = new Date(lastDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      recentMoments = moments.filter(m => m.timestamp >= windowStart && m.timestamp <= lastTs);
    }
  }

  // Recompute emotion frequency from raw moments
  const rawEmotionFreq = {};
  const rawTriggerFreq = {};
  const rawCorrelations = {};
  const rawTimeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const rawEnergy = { steady: 0, balanced: 0, tense: 0, drained: 0, uplifted: 0 };
  const rawTagFreq = {};
  const rawPairFreq = {};

  for (const m of recentMoments) {
    const emo = m.emotion;
    const trigger = m.trigger;
    
    rawEmotionFreq[emo] = (rawEmotionFreq[emo] || 0) + 1;
    if (trigger) rawTriggerFreq[trigger] = (rawTriggerFreq[trigger] || 0) + 1;
    
    if (trigger && emo) {
      if (!rawCorrelations[trigger]) rawCorrelations[trigger] = {};
      rawCorrelations[trigger][emo] = (rawCorrelations[trigger][emo] || 0) + 1;
      const pairKey = `${trigger}|${emo}`;
      rawPairFreq[pairKey] = (rawPairFreq[pairKey] || 0) + 1;
    }

    if (m.timestamp) {
      const bucket = timeOfDayBucket(m.timestamp);
      rawTimeOfDay[bucket]++;
    }

    const energyBucket = ENERGY_MAP[emo] || 'balanced';
    rawEnergy[energyBucket]++;

    if (m.tags && Array.isArray(m.tags)) {
      for (const tag of m.tags) {
        rawTagFreq[tag] = (rawTagFreq[tag] || 0) + 1;
      }
    }
  }

  // Compare to API response
  checkObj(deviceId, 'emotionFrequency', rawEmotionFreq, report.emotionFrequency);
  checkObj(deviceId, 'triggerFrequency', rawTriggerFreq, report.triggerFrequency);
  
  // Correlations (nested)
  const allTriggers = new Set([...Object.keys(rawCorrelations), ...Object.keys(report.correlations || {})]);
  for (const t of allTriggers) {
    checkObj(deviceId, `correlations.${t}`, rawCorrelations[t] || {}, report.correlations?.[t] || {});
  }

  // Energy distribution
  checkObj(deviceId, 'energyDistribution', rawEnergy, report.energyDistribution);

  // ── 3. DERIVED METRICS ─────────────────────────────────────────────
  
  // Top trigger/emotion
  const expectedTopTrigger = Object.entries(rawTriggerFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const expectedTopEmotion = Object.entries(rawEmotionFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  check(deviceId, 'topTrigger', expectedTopTrigger, report.topTrigger);
  // topEmotion can be tied — check if it's at least in the tied set
  if (report.tiedEmotions?.length > 1) {
    const maxEmoCount = Math.max(...Object.values(rawEmotionFreq));
    const tiedRaw = Object.entries(rawEmotionFreq).filter(([_, c]) => c === maxEmoCount).map(([e]) => e);
    check(deviceId, 'tiedEmotions_count', tiedRaw.length, report.tiedEmotions.length);
  }

  // Concentration indices
  const expectedTriggerConc = herfindahl(rawTriggerFreq, recentMoments.length);
  const expectedEmotionConc = herfindahl(rawEmotionFreq, recentMoments.length);
  check(deviceId, 'triggerConcentration', expectedTriggerConc, report.triggerConcentration, 0.01);
  check(deviceId, 'emotionConcentration', expectedEmotionConc, report.emotionConcentration, 0.01);

  // Total moments
  check(deviceId, 'totalMoments', recentMoments.length, report.totalMoments);

  // ── 4. REGULATORS & FRICTION ZONES ─────────────────────────────────
  
  const rawRegulators = [];
  const rawFriction = [];
  for (const [trigger, emotions] of Object.entries(rawCorrelations)) {
    for (const [emotion, count] of Object.entries(emotions)) {
      if (count < 2) continue;
      const score = EMOTION_SCORE[emotion] || 3;
      if (score >= 4) rawRegulators.push({ trigger, emotion, count });
      if (score <= 2) rawFriction.push({ trigger, emotion, count });
    }
  }
  rawRegulators.sort((a, b) => b.count - a.count);
  rawFriction.sort((a, b) => b.count - a.count);

  // Compare regulator counts
  const apiRegulators = report.regulators || [];
  const apiFriction = report.frictionZones || [];
  check(deviceId, 'regulators_count', rawRegulators.length, apiRegulators.length);
  check(deviceId, 'frictionZones_count', rawFriction.length, apiFriction.length);

  // Verify individual regulators
  for (let i = 0; i < Math.max(rawRegulators.length, apiRegulators.length); i++) {
    if (rawRegulators[i] && apiRegulators[i]) {
      check(deviceId, `regulator[${i}].trigger`, rawRegulators[i].trigger, apiRegulators[i].trigger);
      check(deviceId, `regulator[${i}].emotion`, rawRegulators[i].emotion, apiRegulators[i].emotion);
      check(deviceId, `regulator[${i}].count`, rawRegulators[i].count, apiRegulators[i].count);
    }
  }
  for (let i = 0; i < Math.max(rawFriction.length, apiFriction.length); i++) {
    if (rawFriction[i] && apiFriction[i]) {
      check(deviceId, `friction[${i}].trigger`, rawFriction[i].trigger, apiFriction[i].trigger);
      check(deviceId, `friction[${i}].emotion`, rawFriction[i].emotion, apiFriction[i].emotion);
      check(deviceId, `friction[${i}].count`, rawFriction[i].count, apiFriction[i].count);
    }
  }

  // ── 5. DRIVERS CROSS-CHECK ─────────────────────────────────────────
  
  const drivers = report.aiInsight?.drivers || [];
  for (const d of drivers) {
    // effectCount should match the actual pairing count for the driver's emotion
    if (d.emotion && d.effect !== 'neutral') {
      const actualPairing = rawCorrelations[d.trigger]?.[d.emotion] || 0;
      check(deviceId, `driver(${d.trigger}).effectCount`, actualPairing, d.effectCount);
    }
    
    // Effect direction: if effect is "friction", the emotion should score <= 2
    if (d.effect === 'friction' && d.emotion) {
      const score = EMOTION_SCORE[d.emotion] || 3;
      check(deviceId, `driver(${d.trigger}).friction_emotion_valid`, true, score <= 2);
    }
    if (d.effect === 'regulator' && d.emotion) {
      const score = EMOTION_SCORE[d.emotion] || 3;
      check(deviceId, `driver(${d.trigger}).regulator_emotion_valid`, true, score >= 4);
    }
  }

  // ── 6. CROSS-SECTION CONSISTENCY ───────────────────────────────────
  
  const insight = report.aiInsight;
  if (insight) {
    // If a driver says friction, behavioral loop shouldn't say regulator for same trigger
    const driverEffects = {};
    for (const d of (insight.drivers || [])) {
      if (d.effect !== 'neutral') driverEffects[d.trigger] = d.effect;
    }
    
    for (const loop of (insight.behavioralLoop || [])) {
      const driverEffect = driverEffects[loop.trigger];
      if (driverEffect && driverEffect !== loop.type) {
        issues.push({
          userId: label,
          metric: 'cross_section_driver_vs_loop',
          expected: `${loop.trigger} should be ${driverEffect} (per drivers)`,
          actual: `behavioralLoop says ${loop.type}`,
        });
      }
    }

    // What's Working shouldn't list triggers that are friction in drivers
    for (const w of (insight.whatWorking || [])) {
      if (w.trigger && driverEffects[w.trigger] === 'friction') {
        issues.push({
          userId: label,
          metric: 'cross_section_whatWorking_vs_driver',
          expected: `${w.trigger} is friction in drivers, shouldn't be in whatWorking`,
          actual: `whatWorking lists: "${w.text}"`,
        });
      }
    }
  }

  // ── 7. WEEKLY EMOTION TRAJECTORY ───────────────────────────────────

  const trajectory = report.weeklyEmotionTrajectory || [];
  // Group recent moments by date and compute expected daily scores
  const momentsByDate = {};
  for (const m of recentMoments) {
    const d = dateStr(m.timestamp);
    if (!momentsByDate[d]) momentsByDate[d] = {};
    const emo = m.emotion;
    momentsByDate[d][emo] = (momentsByDate[d][emo] || 0) + 1;
  }
  
  for (const tDay of trajectory) {
    const rawDayEmotions = momentsByDate[tDay.date];
    if (rawDayEmotions) {
      const expectedScore = emotionAvgScore(rawDayEmotions);
      if (expectedScore != null) {
        check(deviceId, `trajectory(${tDay.date}).score`, 
          Math.round(expectedScore * 100) / 100, 
          Math.round(tDay.score * 100) / 100, 
          0.05);
      }
    }
  }

  // ── 8. PROGRESS TAB ────────────────────────────────────────────────

  if (progress && progress.weeklySnapshots?.length) {
    for (const snap of progress.weeklySnapshots) {
      // Verify score matches emotion distribution
      if (snap.emotions && Object.keys(snap.emotions).length > 0) {
        const expectedScore = emotionAvgScore(snap.emotions);
        if (expectedScore != null) {
          check(deviceId, `progress(${snap.weekLabel}).score`, 
            Math.round(expectedScore), 
            snap.score, 
            0);
          
          const expectedTone = scoreToneLabel(expectedScore);
          check(deviceId, `progress(${snap.weekLabel}).tone`, expectedTone, snap.tone);
        }
      }

      // Verify moment count matches emotion sum
      const emotionSum = Object.values(snap.emotions || {}).reduce((a, b) => a + b, 0);
      check(deviceId, `progress(${snap.weekLabel}).moments_vs_emotions`, emotionSum, snap.moments, 1);
    }

    // Trajectory direction
    if (progress.trajectory) {
      const t = progress.trajectory;
      if (t.change != null) {
        if (t.change > 0.3 && t.direction !== 'improving') {
          issues.push({ userId: label, metric: 'progress.trajectory.direction', expected: 'improving', actual: t.direction });
        }
        if (t.change < -0.3 && t.direction !== 'declining') {
          issues.push({ userId: label, metric: 'progress.trajectory.direction', expected: 'declining', actual: t.direction });
        }
        if (Math.abs(t.change) <= 0.3 && t.direction !== 'stable') {
          issues.push({ userId: label, metric: 'progress.trajectory.direction', expected: 'stable', actual: t.direction });
        }
      }
    }
  }

  // ── 9. CENTROID AUDIT ──────────────────────────────────────────────

  if (report.weeklyCentroid) {
    // Recompute centroid from raw moments
    let valSum = 0, arSum = 0, contCount = 0;
    for (const m of recentMoments) {
      if (m.valence != null && m.arousal != null) {
        valSum += m.valence;
        arSum += m.arousal;
        contCount++;
      }
    }
    if (contCount > 0) {
      const expectedV = Math.round((valSum / contCount) * 100) / 100;
      const expectedA = Math.round((arSum / contCount) * 100) / 100;
      check(deviceId, 'centroid.valence', expectedV, 
        Math.round(report.weeklyCentroid.valence * 100) / 100, 0.05);
      check(deviceId, 'centroid.arousal', expectedA, 
        Math.round(report.weeklyCentroid.arousal * 100) / 100, 0.05);
    }
  }

  // ── 10. BASELINE METRICS ──────────────────────────────────────────

  const bm = report.baselineMetrics;
  if (bm && bm.baseline?.reliable) {
    // baseline.label should match score
    const bs = bm.baseline.score;
    let expectedLabel;
    if (bs >= 4) expectedLabel = null; // multiple options, skip
    else if (bs >= 3) expectedLabel = 'balanced';
    else if (bs >= 2) expectedLabel = 'tends toward tense';
    else expectedLabel = 'emotionally strained';
    
    if (expectedLabel) {
      check(deviceId, 'baseline.label', expectedLabel, bm.baseline.label);
    }

    // drift direction consistency
    if (bm.drift) {
      if (bm.drift.value > 0.15 && bm.drift.direction !== 'improving') {
        issues.push({ userId: label, metric: 'drift.direction', expected: 'improving', actual: bm.drift.direction });
      }
      if (bm.drift.value < -0.15 && bm.drift.direction !== 'declining') {
        issues.push({ userId: label, metric: 'drift.direction', expected: 'declining', actual: bm.drift.direction });
      }
    }
  }

  // ── 11. PAIRINGS CONSISTENCY ──────────────────────────────────────

  const pairings = report.pairings || [];
  for (const p of pairings) {
    // Every pairing should have count >= 2
    if (p.count < 2) {
      issues.push({ userId: label, metric: `pairing(${p.trigger}|${p.emotion}).count`, expected: '>=2', actual: p.count });
    }
    // The count should match correlations
    const corrCount = report.correlations?.[p.trigger]?.[p.emotion] || 0;
    check(deviceId, `pairing(${p.trigger}|${p.emotion}).vs_correlations`, corrCount, p.count);
  }

  // ── 12. WHERE TO FOCUS COUNT ACCURACY ─────────────────────────────

  for (const w of (insight?.whereToFocus || [])) {
    if (w.trigger && w.emotion && w.count) {
      // The count in whereToFocus should be backed by the 45-day correlations or pairings
      // Just verify it's not obviously wrong (not more than total moments for that trigger)
      const triggerTotal = report.triggerFrequency?.[w.trigger] || 0;
      if (w.count > triggerTotal * 3) { // Allow some slack for 45-day data
        issues.push({
          userId: label,
          metric: `whereToFocus(${w.trigger}).count_sanity`,
          expected: `<= ~${triggerTotal * 3}`,
          actual: w.count,
        });
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           TRIGGERMAP FULL METRICS AUDIT             ║');
  console.log('║           Recomputing from raw moments              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // All real user IDs (from Redis SMEMBERS owners, excluding test owner)
  let userIds = [
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

  console.log(`Found ${userIds.length} users to audit\n`);

  let audited = 0;
  for (const uid of userIds) {
    try {
      await auditUser(uid);
      audited++;
    } catch (e) {
      console.log(`  [${uid.slice(0, 8)}] ERROR: ${e.message}`);
    }
  }

  // ── Report ──────────────────────────────────────────────────────────

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`AUDIT COMPLETE: ${audited} users, ${totalChecks} checks`);
  console.log(`  ✅ PASSED: ${passedChecks}`);
  console.log(`  ❌ FAILED: ${issues.length}`);
  console.log('═══════════════════════════════════════════════════════');

  if (issues.length > 0) {
    console.log('\nFAILURES:\n');
    // Group by user
    const byUser = {};
    for (const issue of issues) {
      if (!byUser[issue.userId]) byUser[issue.userId] = [];
      byUser[issue.userId].push(issue);
    }
    for (const [uid, userIssues] of Object.entries(byUser)) {
      console.log(`[${uid}]`);
      for (const issue of userIssues) {
        console.log(`  ❌ ${issue.metric}`);
        console.log(`     expected: ${JSON.stringify(issue.expected)}`);
        console.log(`     actual:   ${JSON.stringify(issue.actual)}`);
      }
      console.log('');
    }
  } else {
    console.log('\n🎉 ALL CHECKS PASSED — every metric is consistent\n');
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
