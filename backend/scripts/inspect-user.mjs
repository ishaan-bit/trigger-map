/**
 * Local inspection script: fetches full report for a user via production API.
 */
import 'dotenv/config';

const base = 'https://backend-five-nu-92.vercel.app';
const uid = 'c80e8e53-2f96-4b5c-be94-a34ba49792b4';
const url = `${base}/api/weeklyReport?deviceId=${uid}`;
console.log('Fetching:', url);
const res = await fetch(url);
if (!res.ok) {
  console.error('HTTP', res.status, await res.text().catch(() => ''));
  process.exit(1);
}
const data = await res.json();
const r = data.data?.report || data.data || data;

console.log('=== SUMMARY ===');
console.log(r.aiInsight?.summary);
console.log('');
console.log('=== CONFIDENCE ===', r.aiInsight?.confidence);
console.log('=== MODEL ===', r.aiInsight?.model);
console.log('');
console.log('=== WHAT WORKING ===');
(r.aiInsight?.whatWorking || []).forEach(w => console.log('-', w.text));
console.log('');
console.log('=== WHERE TO FOCUS ===');
(r.aiInsight?.whereToFocus || []).forEach(w => console.log('-', w.text));
console.log('');
console.log('=== STATE OF MIND ===', r.aiInsight?.stateOfMind);
console.log('');
console.log('=== KEY REPORT DATA ===');
console.log('topTrigger:', r.topTrigger, '| topEmotion:', r.topEmotion);
console.log('volatility:', r.volatilityScore, r.volatilityLabel);
const bm = r.baselineMetrics || {};
console.log('baseline:', bm.baseline?.score?.toFixed?.(2), bm.baseline?.label, '| reliable:', bm.baseline?.reliable);
console.log('drift:', bm.drift?.value?.toFixed?.(2), bm.drift?.label, bm.drift?.direction);
console.log('stability:', bm.stability?.score?.toFixed?.(2), bm.stability?.label);
console.log('recovery:', JSON.stringify(bm.recoveryLatency));
console.log('stateOfMind:', bm.stateOfMind);
console.log('');
console.log('=== REGULATORS ===');
(r.regulators || []).forEach(x => console.log('-', x.trigger, '+', x.emotion, '('+x.count+'x)'));
console.log('=== FRICTION ZONES ===');
(r.frictionZones || []).forEach(x => console.log('-', x.trigger, '+', x.emotion, '('+x.count+'x)'));
console.log('=== TRAJECTORY ===');
console.log(r.trajectoryNote);
(r.weeklyEmotionTrajectory || []).forEach(d => console.log(d.date, d.score?.toFixed?.(2), d.dominantEmotion, d.tone));
console.log('=== RECURRENCE ===', JSON.stringify(r.recurrence));
console.log('=== BASELINE CONTEXT ===', JSON.stringify(r.baselineContext));
console.log('=== TRIGGER FREQ ===', JSON.stringify(r.triggerFrequency));
console.log('=== EMOTION FREQ ===', JSON.stringify(r.emotionFrequency));
console.log('=== DATA QUALITY ===', JSON.stringify(r.dataQuality));
console.log('');
console.log('=== LLM INSIGHT ===');
const llm = data.data?.llmInsight || data.data?.llmTeaser;
console.log(llm?.narrative || 'none stored');
