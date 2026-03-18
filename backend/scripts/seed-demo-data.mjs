#!/usr/bin/env node
/**
 * Seed curated demo moments for a specific user.
 * Usage:  node backend/scripts/seed-demo-data.mjs
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TARGET_EMAIL = "p21kumar@iima.ac.in";

if (!BASE_URL || !TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function redis(cmd) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  return data.result;
}

async function redisPipeline(cmds) {
  const res = await fetch(`${BASE_URL}/pipeline`, {
    method: "POST",
    headers,
    body: JSON.stringify(cmds),
  });
  const data = await res.json();
  return Array.isArray(data) ? data.map((e) => e.result) : [];
}

// ── Step 1: Resolve userId from email ──
const userId = await redis(["GET", `triggermap:userEmail:${TARGET_EMAIL}`]);
if (!userId) {
  console.error(`No user found for email ${TARGET_EMAIL}`);
  process.exit(1);
}
console.log(`Found user: ${userId} (${TARGET_EMAIL})`);

// ── Step 2: Curated moments that tell a sharp story ──
// Narrative: Work stress dominates mornings, exercise is a clear regulator,
// social time brings energy, alone/health moments on weekends bring calm.
// Pattern: work→frustrated/anxious in AM, exercise→calm/energized, social→energized
const MOMENTS = [
  // Tue Mar 11 — rough start, rescued by evening exercise
  { date: "2026-03-11T08:30:00", trigger: "work",     emotion: "frustrated", note: "Back-to-back meetings before I could even think" },
  { date: "2026-03-11T18:45:00", trigger: "exercise",  emotion: "calm",       note: "30-min run after work, head finally quiet" },

  // Wed Mar 12 — social energy, then money worry
  { date: "2026-03-12T12:15:00", trigger: "social",    emotion: "energized",  note: "Great lunch conversation with a friend" },
  { date: "2026-03-12T21:00:00", trigger: "money",     emotion: "anxious",    note: "Saw credit card bill, felt the weight" },

  // Thu Mar 13 — work frustration deepens
  { date: "2026-03-13T09:00:00", trigger: "work",     emotion: "frustrated", note: "Deadline moved up, no time to prepare" },
  { date: "2026-03-13T17:30:00", trigger: "exercise",  emotion: "energized",  note: "Gym session with a friend, felt alive" },

  // Fri Mar 14 — pressure peaks then releases
  { date: "2026-03-14T10:00:00", trigger: "work",     emotion: "anxious",    note: "Presentation in front of leadership, hands were shaking" },
  { date: "2026-03-14T20:00:00", trigger: "social",    emotion: "energized",  note: "Friday dinner with friends, laughed for the first time all week" },

  // Sat Mar 15 — weekend reset
  { date: "2026-03-15T10:30:00", trigger: "alone",    emotion: "calm",       note: "Morning coffee on the balcony, no phone" },
  { date: "2026-03-15T16:00:00", trigger: "health",   emotion: "calm",       note: "Cooked a proper meal for the first time in days" },

  // Mon Mar 17 — pattern repeats
  { date: "2026-03-17T08:15:00", trigger: "work",     emotion: "frustrated", note: "Monday inbox already overwhelming" },

  // Tue Mar 18 — exercise breaks the cycle again
  { date: "2026-03-18T07:00:00", trigger: "exercise",  emotion: "calm",       note: "Early morning walk before the day started" },
];

const AGGREGATE_TTL = 60 * 60 * 24 * 45;

function bucketForHour(hour) {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function dateStr(iso) {
  return iso.slice(0, 10);
}

// ── Step 3: Build pipeline commands ──
const cmds = [];

// Add to owners set
cmds.push(["SADD", `triggermap:owners`, userId]);

for (const m of MOMENTS) {
  const moment = {
    id: randomUUID(),
    ownerId: userId,
    trigger: m.trigger,
    emotion: m.emotion,
    note: m.note,
    timestamp: new Date(m.date).toISOString(),
    isAnonymous: false,
  };

  const date = dateStr(m.date);
  const dailyKey = `triggermap:daily:${userId}:${date}`;
  const timeBucket = bucketForHour(new Date(m.date).getHours());
  const pairKey = `${m.trigger}|${m.emotion}`;

  // Store moment in list
  cmds.push(["RPUSH", `triggermap:moments:${userId}`, JSON.stringify(moment)]);

  // Update daily aggregate
  cmds.push(["HINCRBY", dailyKey, "total", "1"]);
  cmds.push(["HINCRBY", dailyKey, `trigger:${m.trigger}`, "1"]);
  cmds.push(["HINCRBY", dailyKey, `emotion:${m.emotion}`, "1"]);
  cmds.push(["HINCRBY", dailyKey, `pair:${pairKey}`, "1"]);
  cmds.push(["HINCRBY", dailyKey, `time:${timeBucket}`, "1"]);
  cmds.push(["HSET", dailyKey, "date", date]);
  cmds.push(["EXPIRE", dailyKey, String(AGGREGATE_TTL)]);

  // Increment global counter
  cmds.push(["INCR", `triggermap:counter:moments_logged`]);
}

console.log(`Seeding ${MOMENTS.length} moments across ${new Set(MOMENTS.map(m => dateStr(m.date))).size} days...`);

// Execute in batches of 50 (Upstash pipeline limit)
const BATCH_SIZE = 50;
for (let i = 0; i < cmds.length; i += BATCH_SIZE) {
  const batch = cmds.slice(i, i + BATCH_SIZE);
  await redisPipeline(batch);
}

console.log(`✓ Seeded ${MOMENTS.length} curated moments for ${TARGET_EMAIL}`);
console.log("\nData story:");
console.log("  • Work → frustrated/anxious (4 moments, all mornings)");
console.log("  • Exercise → calm/energized (3 moments, clear regulator)");
console.log("  • Social → energized (2 moments)");
console.log("  • Alone/Health → calm (weekend reset)");
console.log("  • Money → anxious (1 moment)");
console.log("\nReady for AI insight generation.");
