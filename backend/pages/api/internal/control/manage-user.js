import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';
import { redis, redisKey, pipeline, hgetallObject, flatArrayToObject } from '../../../../services/redisClient.js';
import { hashPassword } from '../../../../services/authService.js';
import { listOwnerIds } from '../../../../services/aggregationService.js';

const ALLOWED_ACTIONS = ['create-user', 'reset-password', 'delete-account', 'clear-data', 'set-subscription'];

export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireInternalAuth(req, res)) return;

  const { action, ownerId, email, password, name, subscription } = req.body || {};

  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  try {
    // ── Create User (email/password) ──
    if (action === 'create-user') {
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const existing = await redis(['GET', redisKey('userEmail', normalizedEmail)]);
      if (existing) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }

      const { randomUUID } = await import('node:crypto');
      const userId = randomUUID();
      const passwordHash = await hashPassword(password);
      const createdAt = new Date().toISOString();

      await pipeline([
        [
          'HSET', redisKey('user', userId),
          'id', userId,
          'email', normalizedEmail,
          'name', name || normalizedEmail.split('@')[0],
          'passwordHash', passwordHash,
          'provider', 'email',
          'createdAt', createdAt,
        ],
        ['SET', redisKey('userEmail', normalizedEmail), userId],
        ['SADD', redisKey('owners'), userId],
      ]);

      return res.status(201).json({
        ok: true,
        action,
        user: { id: userId, email: normalizedEmail, name: name || normalizedEmail.split('@')[0], provider: 'email', createdAt },
      });
    }

    // All other actions require ownerId
    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId is required' });
    }

    const userRecord = await hgetallObject(redisKey('user', ownerId));
    if (!userRecord || !userRecord.id) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ── Reset Password ──
    if (action === 'reset-password') {
      if (!password) {
        return res.status(400).json({ error: 'password required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (userRecord.provider !== 'email') {
        return res.status(400).json({ error: 'Password reset only applies to email users' });
      }

      const passwordHash = await hashPassword(password);
      await redis(['HSET', redisKey('user', ownerId), 'passwordHash', passwordHash]);

      return res.status(200).json({ ok: true, action, ownerId });
    }

    // ── Set Subscription (upgrade/downgrade) ──
    if (action === 'set-subscription') {
      if (!subscription || !['active', 'none', 'expired', 'cancelled', 'grace_period'].includes(subscription)) {
        return res.status(400).json({ error: 'subscription must be one of: active, none, expired, cancelled, grace_period' });
      }

      if (subscription === 'none') {
        await redis(['DEL', redisKey('subscription', ownerId)]);
      } else {
        await pipeline([
          [
            'HSET', redisKey('subscription', ownerId),
            'status', subscription,
            'subscriptionId', 'ops-manual',
            'purchaseToken', '',
            'expiresAt', subscription === 'active' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : '',
            'updatedAt', new Date().toISOString(),
          ],
          ['EXPIRE', redisKey('subscription', ownerId), String(60 * 60 * 24 * 365)],
        ]);
      }

      return res.status(200).json({ ok: true, action, ownerId, subscription });
    }

    // ── Clear Data (keep account, remove moments/reports/insights) ──
    if (action === 'clear-data') {
      const deleted = await clearUserData(ownerId);
      return res.status(200).json({ ok: true, action, ownerId, keysDeleted: deleted });
    }

    // ── Delete Account (remove everything) ──
    if (action === 'delete-account') {
      const deleted = await clearUserData(ownerId);

      // Remove user record, email lookup, google lookup, subscription, session data
      const delCmds = [
        ['DEL', redisKey('user', ownerId)],
        ['DEL', redisKey('subscription', ownerId)],
        ['DEL', redisKey('first_ai_claimed', ownerId)],
        ['SREM', redisKey('owners'), ownerId],
      ];

      if (userRecord.email) {
        delCmds.push(['DEL', redisKey('userEmail', userRecord.email.toLowerCase())]);
      }
      if (userRecord.googleSub) {
        delCmds.push(['DEL', redisKey('userGoogle', userRecord.googleSub)]);
      }

      await pipeline(delCmds);

      return res.status(200).json({ ok: true, action, ownerId, keysDeleted: deleted + delCmds.length });
    }

    return res.status(400).json({ error: `Unhandled action: ${action}` });
  } catch (err) {
    console.error(`manage-user error [${action}]:`, err);
    return res.status(500).json({ error: 'User management failed', message: err.message });
  }
}

/**
 * Delete all data keys for a user (moments, reports, insights, daily aggregates).
 * Returns the number of keys deleted.
 */
async function clearUserData(ownerId) {
  // Scan for daily aggregate keys: triggermap:daily:{ownerId}:*
  const dailyPattern = redisKey('daily', ownerId, '*');
  const dailyKeys = await redis(['KEYS', dailyPattern]);

  const keysToDelete = [
    redisKey('moments', ownerId),
    redisKey('weekly_report', ownerId),
    redisKey('llm_insight', ownerId),
    redisKey('llm_free_pass', ownerId),
  ];

  if (Array.isArray(dailyKeys)) {
    keysToDelete.push(...dailyKeys);
  }

  if (keysToDelete.length === 0) return 0;

  const delCmds = keysToDelete.map((k) => ['DEL', k]);
  await pipeline(delCmds);

  return keysToDelete.length;
}
