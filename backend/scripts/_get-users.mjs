// Get all user IDs from Redis directly
import 'dotenv/config';
import { redis, redisKey } from '../services/redisClient.js';

const ownerIds = await redis(['SMEMBERS', redisKey('owners')]);
console.log('Total users:', ownerIds.length);
for (const id of ownerIds) {
  console.log(id);
}
