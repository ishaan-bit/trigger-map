import 'dotenv/config';
import { redis, redisKey } from '../services/redisClient.js';

const owners = await redis(['SMEMBERS', redisKey('owners')]);
console.log('Total owners:', owners?.length);

for (const oid of (owners || []).slice(0, 15)) {
  const profile = await redis(['GET', redisKey('mode_profile', oid)]);
  const feedback = await redis(['LRANGE', redisKey('mode_feedback', oid), '0', '-1']);
  const moveOut = await redis(['GET', redisKey('mode_output', oid, 'move')]);
  const fuelOut = await redis(['GET', redisKey('mode_output', oid, 'fuel')]);
  const actionPrefs = await redis(['GET', redisKey('action_prefs', oid)]);
  const actionFb = await redis(['LRANGE', redisKey('action_feedback', oid), '0', '-1']);
  const userHash = await redis(['HGETALL', redisKey('user', oid)]);
  const emailIdx = userHash ? userHash.indexOf('email') : -1;
  const email = emailIdx >= 0 ? userHash[emailIdx + 1] : '';

  let p = null;
  try { p = JSON.parse(profile); } catch {}
  const fbCount = Array.isArray(feedback) ? feedback.length : 0;
  const actionFbCount = Array.isArray(actionFb) ? actionFb.length : 0;

  let moveItems = [];
  let moveGen = null;
  try {
    const m = JSON.parse(moveOut);
    moveItems = m?.items?.map(i => i.id) || [];
    moveGen = m?.generatedAt;
  } catch {}

  let fuelItems = [];
  let fuelGen = null;
  try {
    const f = JSON.parse(fuelOut);
    fuelItems = f?.items?.map(i => i.id) || [];
    fuelGen = f?.generatedAt;
  } catch {}

  let actionsGen = null;
  try { actionsGen = JSON.parse(actionPrefs)?.llmGeneratedAt; } catch {}

  // Parse feedback entries to show details
  const fbDetails = [];
  if (Array.isArray(feedback)) {
    for (const entry of feedback.slice(-10)) {
      try {
        const fb = JSON.parse(entry);
        fbDetails.push(`${fb.mode}/${fb.itemId}=${fb.response} @${new Date(fb.timestamp).toISOString()}`);
      } catch {}
    }
  }

  // Check: are any disliked items in current output?
  const dislikedMove = p?.dislikedMovements || [];
  const dislikedFuel = p?.dislikedNourishments || [];
  const moveViolations = moveItems.filter(id => dislikedMove.includes(id));
  const fuelViolations = fuelItems.filter(id => dislikedFuel.includes(id));

  console.log('---');
  console.log(`${oid.slice(0, 8)} | ${email}`);
  console.log(`  Profile: liked_move=${JSON.stringify(p?.likedMovements || [])} disliked_move=${JSON.stringify(dislikedMove)}`);
  console.log(`  Profile: liked_fuel=${JSON.stringify(p?.likedNourishments || [])} disliked_fuel=${JSON.stringify(dislikedFuel)}`);
  console.log(`  Feedback entries: ${fbCount} | Action fb: ${actionFbCount}`);
  console.log(`  Move output items: ${JSON.stringify(moveItems)} (gen: ${moveGen})`);
  console.log(`  Fuel output items: ${JSON.stringify(fuelItems)} (gen: ${fuelGen})`);
  console.log(`  Actions gen: ${actionsGen}`);
  if (moveViolations.length) console.log(`  *** MOVE VIOLATION: disliked items in output: ${JSON.stringify(moveViolations)}`);
  if (fuelViolations.length) console.log(`  *** FUEL VIOLATION: disliked items in output: ${JSON.stringify(fuelViolations)}`);
  if (fbDetails.length) {
    console.log(`  Recent feedback:`);
    fbDetails.forEach(d => console.log(`    ${d}`));
  }
}
