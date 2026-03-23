/**
 * LLM Summary Rewrite job.
 *
 * Fetches stored weekly reports, rewrites the summary and action reasons
 * using a local Ollama model, and stores the polished versions back to Redis.
 *
 * Run manually:
 *   node backend/jobs/rewriteSummaries.js
 *   node backend/jobs/rewriteSummaries.js --force
 *
 * Environment:
 *   LLM_API_URL   — Ollama base URL (default: http://localhost:11434/v1)
 *   LLM_MODEL     — Model to use (default: mistral)
 *   LLM_OWNER_IDS — Comma-separated owner IDs to target (optional)
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { listOwnerIds } from "../services/aggregationService.js";
import { getStoredWeeklyInsight, storeWeeklyInsight } from "../services/reportStore.js";
import { getUserById } from "../services/authService.js";
import { extractFirstName } from "../utils/phrasingLayer.js";

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "mistral";
const REWRITE_TIMEOUT_MS = 15000;

/**
 * Call local Ollama to rewrite a text block.
 * Returns original text on any failure.
 */
async function llmRewrite(text, { firstName, apiUrl, model } = {}) {
  if (!text || typeof text !== "string" || text.length < 10) return text;

  const nameInstruction = firstName
    ? ` If natural, address the reader as "${firstName}" once.`
    : "";

  const messages = [
    {
      role: "system",
      content:
        "You are a concise, warm copy editor for a wellness app. " +
        "Rewrite the text to sound natural and human. Keep meaning, numbers, and length similar. " +
        "Use clear grammar and correct spelling. Do not add new information or insights. " +
        "Do not use markdown, bullet points, numbered lists, em dashes, or bold formatting. " +
        "Output only the rewritten text, nothing else.",
    },
    {
      role: "user",
      content: `Rewrite this text to be clearer and more natural (max 2 sentences).${nameInstruction}\n\n${text}`,
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REWRITE_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    if (!res.ok) return text;
    const data = await res.json();
    const output = data.choices?.[0]?.message?.content?.trim();
    if (!output || output.length < 10) return text;

    // Basic quality check: reject if too short/long vs original
    if (output.length < text.length * 0.3 || output.length > text.length * 2.5) return text;

    // Reject if the model echoed the prompt
    if (/rewrite|copy editor|wellness app/i.test(output)) return text;

    return output;
  } catch {
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function runRewriteSummaries({ force = false, ownerIds, model } = {}) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const llmModel = model || process.env.LLM_MODEL || DEFAULT_MODEL;

  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
      ? envIds.split(",").filter(Boolean)
      : await listOwnerIds();

  console.log(`[rewriteSummaries] Starting for ${owners.length} users (model=${llmModel}, force=${force})`);

  let rewritten = 0;
  let skipped = 0;
  const results = [];

  for (const ownerId of owners) {
    try {
      const stored = await getStoredWeeklyInsight(ownerId);
      if (!stored || !stored.summary) {
        results.push({ ownerId, skipped: true, reason: "no-stored-report" });
        skipped++;
        continue;
      }

      // Skip if already rewritten (unless forced)
      if (stored.rewrittenBy && !force) {
        results.push({ ownerId, skipped: true, reason: "already-rewritten" });
        skipped++;
        continue;
      }

      // Get first name for personalization
      const user = await getUserById(ownerId).catch(() => null);
      const firstName = extractFirstName(user?.name);

      console.log(`  Rewriting for ${ownerId.slice(0, 8)}...`);

      // Rewrite summary
      const newSummary = await llmRewrite(stored.summary, { firstName, apiUrl, model: llmModel });

      // Store updated report with rewrite metadata
      const updated = {
        ...stored,
        summary: newSummary,
        rewrittenBy: llmModel,
        rewrittenAt: new Date().toISOString(),
      };

      await storeWeeklyInsight(ownerId, updated);
      rewritten++;
      results.push({ ownerId, generated: true, model: llmModel });
      console.log(`  Done (${newSummary.slice(0, 60)}...)`);
    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  Failed for ${ownerId.slice(0, 8)}: ${error.message}`);
    }
  }

  console.log(`[rewriteSummaries] Done — ${rewritten} rewritten, ${skipped} skipped`);
  return { rewritten, skipped, model: llmModel, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const force = process.argv.includes("--force");
  runRewriteSummaries({ force })
    .then((output) => {
      console.log(JSON.stringify({ ok: true, ...output }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
