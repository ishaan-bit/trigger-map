/**
 * P0 verification: Check if 270a5bb6's aggregate counts match
 * when using the correct "7 active days" sliding window
 */

const BASE = 'https://backend-five-nu-92.vercel.app';
const DEVICE = '270a5bb6-9cdc-4a65-8a63-09f79d1bccaa';

const tRes = await fetch(`${BASE}/api/timeline?deviceId=${DEVICE}`);
const moments = (await tRes.json()).data?.moments || [];

// API uses: getWeeklyAggregates(ownerId, 45) → filter active days → take last 7
// "active days" = dates with total > 0
const byDate = {};
for (const m of moments) {
  const d = m.timestamp?.slice(0, 10);
  if (!byDate[d]) byDate[d] = [];
  byDate[d].push(m);
}
const activeDates = Object.keys(byDate).sort();
const last7ActiveDates = activeDates.slice(-7);
console.log('Active dates:', activeDates);
console.log('Last 7 active dates:', last7ActiveDates);

// Recount using this window
const windowMoments = moments.filter(m => {
  const d = m.timestamp?.slice(0, 10);
  return last7ActiveDates.includes(d);
});

const emotionFreq = {};
const triggerFreq = {};
for (const m of windowMoments) {
  emotionFreq[m.emotion] = (emotionFreq[m.emotion] || 0) + 1;
  if (m.trigger) triggerFreq[m.trigger] = (triggerFreq[m.trigger] || 0) + 1;
}

console.log('\nWindow moments:', windowMoments.length);
console.log('emotionFreq:', JSON.stringify(emotionFreq));
console.log('triggerFreq:', JSON.stringify(triggerFreq));

// Compare to API
const rRes = await fetch(`${BASE}/api/weeklyReport?deviceId=${DEVICE}`);
const report = (await rRes.json()).data?.report;
console.log('\nAPI totalMoments:', report.totalMoments);
console.log('API emotionFreq:', JSON.stringify(report.emotionFrequency));
console.log('API triggerFreq:', JSON.stringify(report.triggerFrequency));

// Check match
const emotionMatch = JSON.stringify(emotionFreq) === JSON.stringify(report.emotionFrequency);
const triggerMatch = JSON.stringify(triggerFreq) === JSON.stringify(report.triggerFrequency);
console.log('\nEmotion match:', emotionMatch);
console.log('Trigger match:', triggerMatch);
console.log('Total match:', windowMoments.length === report.totalMoments);
