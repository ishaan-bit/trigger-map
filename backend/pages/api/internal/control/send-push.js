import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';
import { pipeline, redisKey, flatArrayToObject } from '../../../../services/redisClient.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send push notifications via Expo Push API.
 * Accepts array of { to, title, body } messages (max 100 per batch).
 */
async function sendExpoPush(messages) {
  if (messages.length === 0) return [];

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.data || [];
}

export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireInternalAuth(req, res)) return;

  const { userIds, title, body } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'body is required' });
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds must be a non-empty array' });
  }

  try {
    // Fetch push tokens for all targeted users in one pipeline.
    // Tokens are stored as HASH: triggermap:push_tokens:<userId> → { deviceId: JSON{token, platform, updatedAt} }
    const tokenCommands = userIds.map(uid => ['HGETALL', redisKey('push_tokens', uid)]);
    const tokenResults = await pipeline(tokenCommands);

    const messages = [];
    const sent = [];
    const skipped = [];
    const deviceDetails = {};

    for (let i = 0; i < userIds.length; i++) {
      const uid = userIds[i];
      const raw = flatArrayToObject(tokenResults[i]);
      const deviceEntries = Object.entries(raw);

      if (deviceEntries.length === 0) {
        skipped.push(uid);
        continue;
      }

      const devices = [];
      for (const [deviceId, entryJson] of deviceEntries) {
        try {
          const entry = JSON.parse(entryJson);
          if (entry.token) {
            messages.push({
              to: entry.token,
              title: title.trim(),
              body: body.trim(),
              sound: 'default',
              data: { userId: uid },
            });
            devices.push({ deviceId: deviceId.slice(0, 8), platform: entry.platform });
          }
        } catch {
          // Malformed entry — skip this device
        }
      }

      if (devices.length > 0) {
        sent.push(uid);
        deviceDetails[uid] = devices;
      } else {
        skipped.push(uid);
      }
    }

    // Send via Expo Push API in batches of 100
    const results = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const batchResults = await sendExpoPush(batch);
      results.push(...batchResults);
    }

    const delivered = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error');

    console.log(`[send-push] title="${title.slice(0, 80)}" targeted=${userIds.length} users_with_tokens=${sent.length} messages=${messages.length} delivered=${delivered} errors=${errors.length}`);

    return res.status(200).json({
      ok: true,
      targeted: userIds.length,
      sent: sent.length,
      skipped: skipped.length,
      skippedIds: skipped.slice(0, 20),
      totalMessages: messages.length,
      delivered,
      errors: errors.length,
      errorDetails: errors.slice(0, 5).map(e => e.message),
      note: sent.length === 0
        ? 'No push tokens registered yet. Users must be logged in on a device to receive notifications.'
        : undefined,
    });
  } catch (err) {
    console.error('[send-push] error:', err);
    return res.status(500).json({ error: 'Failed to send push notifications' });
  }
}
