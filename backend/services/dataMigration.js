// ─────────────────────────────────────────────────────────────────────────────
// Account (userId) → device (deviceId) data recovery.
//
// When sign-in was removed, every user became anonymous (keyed by deviceId).
// Users who had been SIGNED IN had their data stored on the backend under their
// account `userId`; the new device-keyed app reads under `deviceId`, so that
// data was stranded (not deleted). The device→account link from when they signed
// in (`deviceUser:{deviceId}` → userId) lets us copy it back to the deviceId.
//
// migrateOwnerData() is a NON-DESTRUCTIVE COPY (it never deletes the source) and
// MERGE-AWARE / IDEMPOTENT (safe to re-run): moments are union-merged by id and
// aggregates rebuilt; every other per-owner key is copied only when the target
// doesn't already have it (so newer device-side data is never clobbered).
// ─────────────────────────────────────────────────────────────────────────────

import { redis, pipeline, redisKey, flatArrayToObject } from "./redisClient.js";
import { getTimeline, getMomentsKey } from "./momentService.js";
import { replaceDailyAggregates, getOwnerIndexKey } from "./aggregationService.js";
import { buildAggregatesFromRawMoments } from "../jobs/llmInsightSource.js";
import { getUserIdForDevice, validateSession, linkDeviceToUser } from "./authService.js";

// STRING keys: copy source → target only if the target has no value yet.
const STRING_KEYS = [
  "llm_insight",          // premium LLM narrative (expensive — preserve)
  "action_prefs",         // liked/disliked actions
  "mode_profile",         // movement/nourishment preferences
  "notification_prefs",   // (usually already set device-side; copy-if-absent is a no-op)
  "first_ai_claimed",     // preserve "already claimed" state
];

// LIST keys: copy source list → target only if the target list is empty.
const LIST_KEYS = [
  "llm_insight_history",
  "action_feedback",
  "mode_history",
  "mode_feedback",
];

const MODES = ["move", "fuel", "perspective"]; // mode_output:{ownerId}:{mode}

const isActiveStatus = (s) => s === "active" || s === "grace_period";

/**
 * Copy ALL of `fromOwnerId`'s per-owner data to `toOwnerId`, non-destructively.
 * Returns a summary; `ok` is false only when the critical (moments) copy failed,
 * so callers know whether to mark the device permanently recovered. Idempotent.
 */
export async function migrateOwnerData(fromOwnerId, toOwnerId) {
  if (!fromOwnerId || !toOwnerId || fromOwnerId === toOwnerId) {
    return { ok: false, reason: "noop", from: fromOwnerId, to: toOwnerId };
  }

  const summary = { ok: true, from: fromOwnerId, to: toOwnerId, moments: 0, copied: [] };

  // ── 1. Moments — union-merge by id, write atomically, rebuild aggregates ───
  // (Source moments are NOT deleted — this is a copy, unlike migrateMoments.)
  try {
    const [sourceMoments, targetMoments] = await Promise.all([
      getTimeline(fromOwnerId),
      getTimeline(toOwnerId),
    ]);
    if (sourceMoments.length) {
      const map = new Map();
      for (const m of sourceMoments) map.set(m.id, { ...m, ownerId: toOwnerId });
      // Device-side moments win on the (unexpected) id collision — they are newer.
      for (const m of targetMoments) map.set(m.id, { ...m, ownerId: toOwnerId });
      const merged = [...map.values()].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      // Build into a temp key and RENAME onto the live key so concurrent readers
      // never observe an empty/partial timeline during the rewrite.
      const targetKey = getMomentsKey(toOwnerId);
      const tmpKey = `${targetKey}:migrating`;
      await redis(["DEL", tmpKey]);
      await redis(["RPUSH", tmpKey, ...merged.map((m) => JSON.stringify(m))]);
      await redis(["RENAME", tmpKey, targetKey]);

      // Progress / weekly-report / baseline engines read daily aggregate hashes,
      // so rebuild them from the full merged timeline.
      try {
        const rebuilt = buildAggregatesFromRawMoments(merged);
        await replaceDailyAggregates(toOwnerId, rebuilt);
      } catch (err) {
        console.error("[migrateOwnerData] aggregate rebuild failed:", err?.message || err);
      }

      summary.moments = merged.length;
    }
  } catch (err) {
    // Critical failure — leave summary.ok false so the caller doesn't mark the
    // device permanently recovered (a later read/launch retries).
    console.error("[migrateOwnerData] moments failed:", err?.message || err);
    summary.ok = false;
  }

  // ── 2. STRING keys — copy if target empty ──────────────────────────────────
  for (const name of STRING_KEYS) {
    try {
      const [srcVal, tgtVal] = await pipeline([
        ["GET", redisKey(name, fromOwnerId)],
        ["GET", redisKey(name, toOwnerId)],
      ]);
      if (srcVal != null && srcVal !== "" && (tgtVal == null || tgtVal === "")) {
        await redis(["SET", redisKey(name, toOwnerId), srcVal]);
        summary.copied.push(name);
      }
    } catch (err) {
      console.error(`[migrateOwnerData] copy ${name} failed:`, err?.message || err);
    }
  }

  // ── 3. mode_output (compound :{mode}) — copy if target empty ───────────────
  for (const mode of MODES) {
    try {
      const [srcVal, tgtVal] = await pipeline([
        ["GET", redisKey("mode_output", fromOwnerId, mode)],
        ["GET", redisKey("mode_output", toOwnerId, mode)],
      ]);
      if (srcVal != null && srcVal !== "" && (tgtVal == null || tgtVal === "")) {
        await redis(["SET", redisKey("mode_output", toOwnerId, mode), srcVal]);
        summary.copied.push(`mode_output:${mode}`);
      }
    } catch (err) {
      console.error(`[migrateOwnerData] copy mode_output:${mode} failed:`, err?.message || err);
    }
  }

  // ── 4. LIST keys — copy if target list empty ───────────────────────────────
  for (const name of LIST_KEYS) {
    try {
      const [srcLen, tgtLen] = await pipeline([
        ["LLEN", redisKey(name, fromOwnerId)],
        ["LLEN", redisKey(name, toOwnerId)],
      ]);
      if (Number(srcLen) > 0 && Number(tgtLen) === 0) {
        const items = await redis(["LRANGE", redisKey(name, fromOwnerId), "0", "-1"]);
        if (Array.isArray(items) && items.length) {
          await redis(["RPUSH", redisKey(name, toOwnerId), ...items]);
          summary.copied.push(name);
        }
      }
    } catch (err) {
      console.error(`[migrateOwnerData] copy ${name} failed:`, err?.message || err);
    }
  }

  // ── 5. Subscription (HASH) — replace when source is active and target isn't ─
  // Critical: paying users must keep premium. DEL first so the result is exactly
  // the source hash (no leftover device-side fields → no "Frankenstein" sub).
  try {
    const [srcArr, tgtArr] = await pipeline([
      ["HGETALL", redisKey("subscription", fromOwnerId)],
      ["HGETALL", redisKey("subscription", toOwnerId)],
    ]);
    const src = flatArrayToObject(srcArr);
    const tgt = flatArrayToObject(tgtArr);
    if (isActiveStatus(src.status) && !isActiveStatus(tgt.status)) {
      const fields = [];
      for (const [k, v] of Object.entries(src)) fields.push(k, v);
      if (fields.length) {
        await redis(["DEL", redisKey("subscription", toOwnerId)]);
        await redis(["HSET", redisKey("subscription", toOwnerId), ...fields]);
        summary.copied.push("subscription");
      }
    }
  } catch (err) {
    console.error("[migrateOwnerData] copy subscription failed:", err?.message || err);
  }

  // ── 6. Owner index — ensure the device is discoverable by cron jobs even for
  // a moment-less recovery (e.g. subscription/profile-only). ──────────────────
  try {
    await redis(["SADD", getOwnerIndexKey(), toOwnerId]);
  } catch (err) {
    console.error("[migrateOwnerData] owners SADD failed:", err?.message || err);
  }

  // NOTE: push_tokens are intentionally NOT migrated — the device re-registers a
  // fresh token on every launch. daily aggregates are rebuilt (step 1), not copied.
  // weekly_report / llm_free_pass are regenerable caches. user/session/email/
  // device-link keys are identity-layer and must not be copied.

  return summary;
}

/**
 * Recover a device's stranded account data, once.
 *
 * Concurrency/crash safety: a short-TTL lock (`recovering:{deviceId}`) prevents
 * duplicate concurrent migrations and self-heals after a crash (the permanent
 * `recovered:{deviceId}` marker is set ONLY after the moments copy succeeds, so a
 * killed migration retries instead of being silently skipped forever).
 *
 * Authorization: the source account is derived server-side — never from a
 * client-supplied userId. It prefers the device→account link; a token is trusted
 * only when it matches that link (or when no link exists yet — the legacy gap —
 * in which case the link is healed). A caller therefore can't copy an unrelated
 * account onto someone else's deviceId, and token callers bypass the `recovered`
 * marker so a prematurely-set marker can never permanently block a real recovery.
 */
export async function recoverDeviceIfNeeded(deviceId, token) {
  if (!deviceId) return { ok: false, reason: "no-device" };

  const doneKey = redisKey("recovered", deviceId);
  const hasToken = Boolean(token);

  // Lazy (token-less) callers take a fast path once the device is marked done.
  // Token callers always re-attempt (the client's one-shot bootstrap), so a
  // prematurely/maliciously-set marker can't permanently block a token-proven recovery.
  if (!hasToken) {
    const done = await redis(["GET", doneKey]);
    if (done) return { ok: true, skipped: true };
  }

  const lockKey = redisKey("recovering", deviceId);
  const lock = await redis(["SET", lockKey, "1", "NX", "EX", "120"]);
  if (!lock) return { ok: true, inProgress: true };

  try {
    const linkedUserId = await getUserIdForDevice(deviceId);
    let userId = linkedUserId || null;

    if (hasToken) {
      const tokenUser = await validateSession(token).catch(() => null);
      const tokenUserId = tokenUser?.id || null;
      if (tokenUserId) {
        // No link yet (legacy gap) → trust the token and heal the link below.
        // Link present → only trust a token that matches it; otherwise ignore the
        // token and recover the device's actual linked account (anti-pollution).
        userId = !linkedUserId ? tokenUserId : linkedUserId;
      }
    }

    if (userId && userId !== deviceId) {
      const result = await migrateOwnerData(userId, deviceId);
      // Heal a missing device→account link so token-less retries work next time.
      if (!linkedUserId) await linkDeviceToUser(deviceId, userId).catch(() => {});
      // Mark permanently done only when the critical (moments) copy succeeded.
      if (result.ok) await redis(["SET", doneKey, "1"]).catch(() => {});
      return { ok: result.ok, recovered: true, userId, ...result };
    }

    // Nothing to recover. Mark done so anonymous devices take the fast path; token
    // callers ignore this marker, so a real account is never blocked by it.
    await redis(["SET", doneKey, "1"]).catch(() => {});
    return { ok: true, recovered: false, reason: "no-linked-account" };
  } catch (err) {
    console.error("[recoverDeviceIfNeeded] failed:", err?.message || err);
    return { ok: false, error: err?.message };
  } finally {
    await redis(["DEL", lockKey]).catch(() => {});
  }
}

/**
 * Bulk recovery: copy every authenticated user's data onto each device they ever
 * signed in on. Honors the `recovered:{deviceId}` marker so re-running never
 * resurrects moments the user has since deleted on the device. Idempotent.
 */
export async function backfillAuthToDevices({ limit } = {}) {
  const authIds = (await redis(["SMEMBERS", redisKey("owners:auth")])) || [];
  const summary = { users: authIds.length, usersWithDevices: 0, devices: 0, skipped: 0, migrated: [], errors: [] };

  for (const userId of authIds) {
    const deviceIds = (await redis(["SMEMBERS", redisKey("userDevices", userId)])) || [];
    if (!deviceIds.length) continue;
    summary.usersWithDevices++;

    for (const deviceId of deviceIds) {
      if (!deviceId || deviceId === userId) continue;

      // Skip devices already recovered so a re-run can't undo later deletions/edits.
      const already = await redis(["GET", redisKey("recovered", deviceId)]);
      if (already) { summary.skipped++; continue; }

      try {
        const r = await migrateOwnerData(userId, deviceId);
        summary.devices++;
        summary.migrated.push({ userId, deviceId, moments: r.moments, copied: r.copied, ok: r.ok });
        if (r.ok) await redis(["SET", redisKey("recovered", deviceId), "1"]).catch(() => {});
      } catch (err) {
        summary.errors.push({ userId, deviceId, error: err?.message || String(err) });
      }
      if (limit && summary.devices >= limit) return summary;
    }
  }

  return summary;
}
