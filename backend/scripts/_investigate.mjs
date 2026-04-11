/**
 * Investigate P0: 270a5bb6 has more moments in aggregates than in timeline
 * Investigate P1: 2 moments with wrong emotion labels
 */

const BASE = 'https://backend-five-nu-92.vercel.app';

// ── P0: 270a5bb6 aggregate vs raw mismatch ────────────────────────

console.log('═══ P0: 270a5bb6 aggregate vs raw moment investigation ═══\n');

const DEVICE = '270a5bb6-9cdc-4a65-8a63-09f79d1bccaa';
const [reportRes, timelineRes] = await Promise.all([
  fetch(`${BASE}/api/weeklyReport?deviceId=${DEVICE}`),
  fetch(`${BASE}/api/timeline?deviceId=${DEVICE}`),
]);

const report = (await reportRes.json()).data?.report;
const moments = (await timelineRes.json()).data?.moments || [];

// The report uses 7-day or sliding window. Check what window is active.
console.log('report.totalMoments:', report.totalMoments);
console.log('timeline total:', moments.length);
console.log('report.dataQuality:', JSON.stringify(report.dataQuality));
console.log('');

// Show all moments with dates
console.log('All moments in timeline:');
for (const m of moments) {
  console.log(`  ${m.timestamp?.slice(0, 10)} ${m.trigger} → ${m.emotion} (v=${m.valence}, a=${m.arousal})`);
}
console.log('');

// Figure out the sliding window
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const recent7d = moments.filter(m => m.timestamp >= sevenDaysAgo);
console.log('Moments in last 7 days:', recent7d.length);

if (recent7d.length === 0) {
  console.log('User is SILENT — API uses sliding window');
  const sorted = [...moments].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const lastTs = sorted[sorted.length - 1]?.timestamp;
  console.log('Last moment:', lastTs?.slice(0, 10));
  
  // API sliding window: most recent 7 active days from allAggregates
  // My audit uses last 7 calendar days from last moment — but API uses different logic
  // Let me check what dates the API's aggregates would cover
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const momentsIn45d = moments.filter(m => m.timestamp >= fortyFiveDaysAgo);
  console.log('Moments in last 45 days:', momentsIn45d.length);
  
  // Group by date
  const byDate = {};
  for (const m of moments) {
    const d = m.timestamp?.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(m);
  }
  console.log('\nMoments grouped by date:');
  for (const [date, ms] of Object.entries(byDate).sort()) {
    console.log(`  ${date}: ${ms.length} moments — ${ms.map(m => m.trigger + '→' + m.emotion).join(', ')}`);
  }
}

console.log('\nReport emotionFrequency:', JSON.stringify(report.emotionFrequency));
console.log('Report triggerFrequency:', JSON.stringify(report.triggerFrequency));
console.log('Report correlations:', JSON.stringify(report.correlations, null, 2));

// Compare: count from raw vs aggregate
const rawEmotions = {};
const rawTriggers = {};
for (const m of moments) {
  rawEmotions[m.emotion] = (rawEmotions[m.emotion] || 0) + 1;
  if (m.trigger) rawTriggers[m.trigger] = (rawTriggers[m.trigger] || 0) + 1;
}
console.log('\nRaw ALL-TIME emotionFrequency:', JSON.stringify(rawEmotions));
console.log('Raw ALL-TIME triggerFrequency:', JSON.stringify(rawTriggers));

// ── P1: Emotion mapping errors ────────────────────────────────────

console.log('\n═══ P1: Emotion mapping errors ═══\n');

function coordinatesToLegacy(v, a) {
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.25) return 'neutral';
  if (v < -0.2) return a >= 0.7 ? 'anxious' : 'frustrated';
  if (v > 0.2) return a >= 0 ? 'energized' : 'calm';
  return a >= 0 ? 'anxious' : 'calm';
}

// a1510617: v=0.04, a=1 
const test1 = coordinatesToLegacy(0.04, 1);
console.log('a1510617: v=0.04, a=1 → coordinatesToLegacy =', test1);
console.log('  v=0.04 is NOT < -0.2 and NOT > 0.2 → falls to final else: a>=0 → anxious');
console.log('  Stored as: energized — likely logged before coordinatesToLegacy fix');

// b27269a5: v=-0.1, a=0.61
const test2 = coordinatesToLegacy(-0.1, 0.61);
console.log('\nb27269a5: v=-0.1, a=0.61 → coordinatesToLegacy =', test2);
console.log('  v=-0.1 is NOT < -0.2 → falls to final else: a>=0 → anxious');
console.log('  Stored as: energized — likely logged before coordinatesToLegacy fix');

// Fetch these users and show the specific moments
for (const uid of ['a1510617-6c89-4055-94a2-b275edc48ca3', 'b27269a5-0ae8-4d30-9a30-86d275c25629']) {
  const tRes = await fetch(`${BASE}/api/timeline?deviceId=${uid}`);
  const tData = await tRes.json();
  const ms = tData.data?.moments || [];
  const mismatched = ms.filter(m => {
    if (m.valence == null || m.arousal == null) return false;
    const exp = coordinatesToLegacy(m.valence, m.arousal);
    return m.emotion !== exp;
  });
  console.log(`\n[${uid.slice(0, 8)}] ${mismatched.length} mismatched moment(s):`);
  for (const m of mismatched) {
    const exp = coordinatesToLegacy(m.valence, m.arousal);
    console.log(`  ${m.timestamp?.slice(0, 10)} ${m.trigger} v=${m.valence} a=${m.arousal} stored=${m.emotion} expected=${exp}`);
    console.log(`    id: ${m.id || m.momentId || 'unknown'}`);
  }
}
