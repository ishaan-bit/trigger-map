#!/usr/bin/env node
/**
 * Wipes ALL triggermap:* keys from Upstash Redis.
 * Usage:  node backend/scripts/wipe-all-data.mjs
 *         node backend/scripts/wipe-all-data.mjs --yes   (skip confirmation)
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE_URL || !TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function redis(command) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function pipeline(commands) {
  const res = await fetch(`${BASE_URL}/pipeline`, {
    method: "POST",
    headers,
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Pipeline ${res.status}: ${await res.text()}`);
  return (await res.json()).map((e) => e.result);
}

async function scanAll(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const result = await redis(["SCAN", cursor, "MATCH", pattern, "COUNT", "200"]);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== "0");
  return keys;
}

async function confirm(message) {
  if (process.argv.includes("--yes")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function main() {
  console.log("Scanning for triggermap:* keys...\n");
  const keys = await scanAll("triggermap:*");

  if (keys.length === 0) {
    console.log("No keys found. Database is already clean.");
    return;
  }

  // Group keys by category for summary
  const categories = {};
  for (const key of keys) {
    const category = key.split(":").slice(0, 2).join(":");
    categories[category] = (categories[category] || 0) + 1;
  }

  console.log(`Found ${keys.length} key(s):\n`);
  for (const [cat, count] of Object.entries(categories).sort()) {
    console.log(`  ${cat}:*  → ${count}`);
  }
  console.log();

  const ok = await confirm("Delete ALL keys above? This cannot be undone. (y/N) ");
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  // Delete in batches of 50 via pipeline
  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await pipeline(batch.map((k) => ["DEL", k]));
    deleted += batch.length;
    process.stdout.write(`\rDeleted ${deleted}/${keys.length}`);
  }

  console.log("\n\nDone. All triggermap data wiped.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
