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
const DEFAULT_MODEL = "phi3";
const REWRITE_TIMEOUT_MS = 30000;

/**
 * Call local Ollama to rewrite a text block.
 * Returns { text, changed, error } so callers can track failures.
 */
async function llmRewrite(text, { firstName, apiUrl, model } = {}) {
  if (!text || typeof text !== "string" || text.length < 10) {
    return { text, changed: false, error: "input-too-short" };
  }

  const nameInstruction = firstName
    ? ` If natural, address the reader as "${firstName}" once.`
    : "";

  const messages = [
    {
      role: "system",
      content:
        "You are a concise, warm copy editor for a wellness app. " +
        "Rewrite the text to sound natural and human. Keep meaning, numbers, and length similar. " +
        "IMPORTANT: Always use second person (you, your, yours). Never use first person (I, me, my, mine). " +
        "The text is addressed TO the user, not spoken BY the user. " +
        "Use clear grammar and correct spelling. Do not add new information or insights. " +
        "Do not use markdown, bullet points, numbered lists, em dashes, or bold formatting. " +
        "Output only the rewritten text, nothing else.",
    },
    {
      role: "user",
      content: `Rewrite this text addressed to the reader in second person (you/your), keeping it clear and natural (max 2 sentences). Example: "Work took the front seat for you this week."${nameInstruction}\n\n${text}`,
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

    if (!res.ok) {
      return { text, changed: false, error: `ollama-http-${res.status}` };
    }
    const data = await res.json();
    const output = data.choices?.[0]?.message?.content?.trim();
    if (!output || output.length < 10) {
      return { text, changed: false, error: "empty-or-short-response" };
    }

    // Basic quality check: reject if too short/long vs original
    if (output.length < text.length * 0.3 || output.length > text.length * 2.5) {
      return { text, changed: false, error: "length-mismatch" };
    }

    // Reject if the model echoed the prompt
    if (/rewrite|copy editor|wellness app/i.test(output)) {
      return { text, changed: false, error: "prompt-echo" };
    }

    // Reject if the model switched to first person (should be second person: you/your)
    if (/\b(for me|to me|my week|my mood|my baseline|I felt|I had|I was|took the front seat for me)\b/i.test(output)) {
      return { text, changed: false, error: "first-person-detected" };
    }

    return { text: output, changed: true, error: null };
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : `fetch-error: ${err.message}`;
    return { text, changed: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

export async function runRewriteSummaries({ force = false, ownerIds, model } = {}) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const llmModel = model || process.env.LLM_MODEL || DEFAULT_MODEL;

  // ── Ollama health check ──────────────────────────────────────────────
  try {
    const healthRes = await fetch(`${apiUrl.replace(/\/v1$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      const msg = `Ollama not reachable at ${apiUrl} (HTTP ${healthRes.status})`;
      console.error(`[rewriteSummaries] ${msg}`);
      return { rewritten: 0, skipped: 0, unchanged: 0, model: llmModel, error: msg, results: [] };
    }
    const tagData = await healthRes.json();
    const available = (tagData.models || []).map((m) => m.name?.split(":")[0]);
    if (available.length && !available.includes(llmModel)) {
      console.warn(`[rewriteSummaries] Warning: model "${llmModel}" not found in Ollama. Available: ${available.join(", ")}`);
    }
  } catch (err) {
    const msg = `Ollama not reachable at ${apiUrl} (${err.message})`;
    console.error(`[rewriteSummaries] ${msg}`);
    return { rewritten: 0, skipped: 0, unchanged: 0, model: llmModel, error: msg, results: [] };
  }

  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
      ? envIds.split(",").filter(Boolean)
      : await listOwnerIds();

  console.log(`[rewriteSummaries] Starting for ${owners.length} users (model=${llmModel}, force=${force})`);

  let rewritten = 0;
  let skipped = 0;
  let unchanged = 0;
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
      const summaryResult = await llmRewrite(stored.summary, { firstName, apiUrl, model: llmModel });

      if (!summaryResult.changed) {
        results.push({ ownerId, skipped: true, reason: `rewrite-failed: ${summaryResult.error}` });
        unchanged++;
        console.log(`  Unchanged for ${ownerId.slice(0, 8)} (${summaryResult.error})`);
        continue;
      }

      // Store updated report with rewrite metadata
      const updated = {
        ...stored,
        summary: summaryResult.text,
        rewrittenBy: llmModel,
        rewrittenAt: new Date().toISOString(),
      };

      await storeWeeklyInsight(ownerId, updated);
      rewritten++;
      results.push({ ownerId, generated: true, model: llmModel });
      console.log(`  Done (${summaryResult.text.slice(0, 60)}...)`);
    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  Failed for ${ownerId.slice(0, 8)}: ${error.message}`);
    }
  }

  console.log(`[rewriteSummaries] Done — ${rewritten} rewritten, ${skipped} skipped, ${unchanged} unchanged (LLM failures)`);
  return { rewritten, skipped, unchanged, model: llmModel, results };
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
