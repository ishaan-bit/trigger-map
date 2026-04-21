// One-time backfill: populate triggermap:owners:auth from existing user hashes.
// Identifies authenticated owners as those whose user hash contains an "email" field.
// Safe to re-run — SADD is idempotent.
import 'dotenv/config';
import { pipeline, redis, redisKey } from '../services/redisClient.js';

const ownerIds = await redis(['SMEMBERS', redisKey('owners')]);
console.log(`Found ${ownerIds.length} total owners`);

if (ownerIds.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

// Fetch just the email field for each owner in a single pipeline
const cmds = ownerIds.map((id) => ['HGET', redisKey('user', id), 'email']);
const emails = await pipeline(cmds);

const authIds = ownerIds.filter((_, i) => !!emails[i]);
const anonIds = ownerIds.filter((_, i) => !emails[i]);

console.log(`Authenticated (have email): ${authIds.length}`);
console.log(`Anonymous (no email):       ${anonIds.length}`);

if (authIds.length === 0) {
  console.log('No authenticated owners to backfill.');
  process.exit(0);
}

// SADD all authenticated IDs into owners:auth in a single pipeline
await pipeline(authIds.map((id) => ['SADD', redisKey('owners:auth'), id]));
console.log(`✓ Backfilled ${authIds.length} authenticated owners into triggermap:owners:auth`);
