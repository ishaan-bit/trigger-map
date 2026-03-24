/**
 * LLM Action Generation Job
 * ──────────────────────────
 * Uses a local Ollama model to generate personalized actions based on
 * HiTL feedback. Enhances liked actions, replaces skipped ones.
 *
 * Run:  node backend/jobs/generateLlmActions.js
 *       node backend/jobs/generateLlmActions.js --force
 *
 * Env:  LLM_MODEL, LLM_OWNER_IDS, LLM_API_URL
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { getUserById } from "../services/authService.js";
import { getActionFeedback, getActionPrefs, storeActionPrefs } from "../services/reportStore.js";
import { extractFirstName } from "../utils/phrasingLayer.js";
import { lintText } from "../utils/textGrammar.js";

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "phi3";
const REQUEST_TIMEOUT_MS = 60_000;

function parseCliFlags(argv) {
  const flags = { force: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--force") flags.force = true;
  }
  return flags;
}

function buildActionSignals(report, feedback, prefs, firstName) {
  const lines = [];

  if (firstName) lines.push(`User's first name: ${firstName}.`);
  lines.push(`Moments this week: ${report.totalMoments}, days logged: ${report.dataQuality?.daysLogged || 0}.`);

  if (report.topTrigger) lines.push(`Top trigger: ${report.topTrigger}.`);
  if (report.topEmotion) lines.push(`Top emotion: ${report.topEmotion}.`);

  if (report.regulators?.length) {
    const regs = report.regulators.slice(0, 3).map(r => `${r.trigger} + ${r.emotion} (${r.count}x)`);
    lines.push(`Positive patterns (regulators): ${regs.join("; ")}.`);
  }

  if (report.frictionZones?.length) {
    const fz = report.frictionZones.slice(0, 3).map(f => `${f.trigger} + ${f.emotion} (${f.count}x)`);
    lines.push(`Friction zones: ${fz.join("; ")}.`);
  }

  const bm = report.baselineMetrics;
  if (bm?.drift) lines.push(`Drift: ${bm.drift.label} (${bm.drift.direction}).`);
  if (bm?.stateOfMind) lines.push(`State of mind: ${bm.stateOfMind}.`);
  if (bm?.stability) lines.push(`Stability: ${bm.stability.label}.`);

  if (report.volatilityLabel) lines.push(`Volatility: ${report.volatilityLabel}.`);

  // Feedback signals
  const tried = feedback.filter(f => f.response === "tried");
  const skipped = feedback.filter(f => f.response === "skipped");

  if (tried.length) {
    lines.push(`\nActions the user TRIED (liked — enhance these approaches):`);
    for (const t of tried) lines.push(`  - ${t.actionId}`);
  }
  if (skipped.length) {
    lines.push(`\nActions the user SKIPPED (disliked — change approach):`);
    for (const s of skipped) lines.push(`  - ${s.actionId}`);
  }

  if (prefs?.likedTriggers?.length) {
    lines.push(`\nTriggers the user has positively engaged with: ${prefs.likedTriggers.join(", ")}.`);
  }

  // Include previous LLM actions so the model avoids repeating them
  if (prefs?.llmActions?.length) {
    lines.push(`\nPreviously generated actions (DO NOT repeat these - generate completely different ones):`);
    for (const a of prefs.llmActions) {
      lines.push(`  - ${a.title}`);
    }
  }

  return lines.join("\n");
}

function buildPrompt(signals) {
  return `You are a behavioral action designer for an emotional tracking app. Based on the user's emotional data and their feedback on previous actions, generate exactly 3 personalized actions.

RULES:
- Each action must be concrete and doable within one week.
- For triggers/patterns the user TRIED (liked): create enhanced versions — deepen, build on what worked, add specificity.
- For triggers/patterns the user SKIPPED (disliked): take a completely different approach — change the angle, context, or strategy. Do not repeat the same idea.
- Never repeat an action the user already tried or skipped. Be fresh and specific.
- If previously generated actions are listed below, you MUST NOT repeat or rephrase any of them. Generate completely different actions with new angles.
- Types: "regulate" (suggest a positive behavior), "awareness" (notice a pattern), "experiment" (try something new).
- Tone: warm, direct, grounded. No therapy-speak. No em dashes. No markdown.
- Use plain English. No bullet points or special formatting in the output.

DATA:
---
${signals}
---

Respond with EXACTLY 3 actions in this JSON format (no other text before or after):
[
  {
    "id": "llm-unique-id-here",
    "type": "regulate",
    "title": "Short action title (under 10 words)",
    "reason": "One sentence explaining why this action matters for the user.",
    "trigger": "the-trigger-or-null",
    "emotion": "the-emotion-or-null"
  }
]

Output ONLY the JSON array. No explanations, no markdown code fences.`;
}

function parseActions(raw) {
  // Strip markdown code fences if present
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // Try to extract JSON array from surrounding prose
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) text = arrayMatch[0];

  // Fix common phi3 quirks
  // 1. Trailing commas before ] or }
  text = text.replace(/,\s*([\]\}])/g, "$1");
  // 2. Trailing semicolons
  text = text.replace(/\];?\s*$/, "]");
  // 3. Corrupted id fields: "id02"] → "id": "llm-auto-2"  (phi3 merges id with digits)
  text = text.replace(/"id(\d+)"\s*\]?\s*,?/g, '"id": "llm-auto-$1",');
  // 4. Corrupted id with parenthesis: "id0123456789") → "id": "llm-auto"
  text = text.replace(/"id[\d]+"\)\s*:?/g, '"id": "llm-auto",');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Last resort: extract individual complete objects via regex
    const objMatches = [...text.matchAll(/\{[^{}]*"type"\s*:\s*"[^"]+?"[^{}]*"title"\s*:\s*"[^"]+?"[^{}]*\}/g)];
    if (objMatches.length === 0) throw new Error("Could not extract any action objects from LLM output");
    parsed = objMatches.map(m => {
      try { return JSON.parse(m[0]); } catch { return null; }
    }).filter(Boolean);
    if (parsed.length === 0) throw new Error("No parseable action objects in LLM output");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LLM returned empty or non-array response");
  }

  return parsed.slice(0, 4).map(a => ({
    id: String(a.id || `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    type: ["regulate", "awareness", "experiment"].includes(a.type) ? a.type : "awareness",
    title: lintText(String(a.title || "").slice(0, 100)),
    reason: lintText(String(a.reason || "").slice(0, 300)),
    trigger: a.trigger || null,
    emotion: a.emotion || null,
  }));
}

/**
 * Compute updated likedTriggers from feedback history.
 * Triggers from "tried" actions get added; triggers from all-skipped entries
 * of the same trigger get removed.
 */
function computeLikedTriggers(feedback) {
  const triedTriggers = new Set();
  const skippedTriggers = new Set();
  for (const entry of feedback) {
    // Extract trigger from actionId (e.g. "reg-work-exercise" → "work")
    const parts = (entry.actionId || "").split("-");
    const trigger = parts.length >= 2 ? parts[1] : null;
    if (!trigger) continue;
    if (entry.response === "tried") triedTriggers.add(trigger);
    if (entry.response === "skipped") skippedTriggers.add(trigger);
  }
  // Keep triggers that were tried at least once
  return [...triedTriggers];
}

async function generateForOwner(ownerId, { model, apiUrl, force }) {
  const user = await getUserById(ownerId).catch(() => null);
  const firstName = extractFirstName(user?.name);

  const [aggregates, allAggregates, feedback, prefs] = await Promise.all([
    getWeeklyAggregates(ownerId),
    getWeeklyAggregates(ownerId, 45),
    getActionFeedback(ownerId),
    getActionPrefs(ownerId),
  ]);

  if (!feedback.length && !force) {
    return { skipped: true, reason: "no-feedback" };
  }

  const previousAggregates = allAggregates.length >= 14 ? allAggregates.slice(-14, -7) : null;
  const report = generateWeeklyReport({ aggregates, allAggregates, previousAggregates });

  if (report.totalMoments < 3) {
    return { skipped: true, reason: "insufficient-data" };
  }

  const signals = buildActionSignals(report, feedback, prefs, firstName);
  const prompt = buildPrompt(signals);

  const MAX_ATTEMPTS = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a concise behavioral action designer. Output only valid JSON arrays. No prose, no markdown, no explanations." },
            { role: "user", content: prompt },
          ],
          temperature: 0.65,
          max_tokens: 600,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM API returned ${response.status}: ${text}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("LLM returned empty response");

      try {
        var actions = parseActions(content);
      } catch (parseErr) {
        console.log(`    Raw LLM output (attempt ${attempt}): ${content.slice(0, 500)}`);
        throw parseErr;
      }
      const likedTriggers = computeLikedTriggers(feedback);

      const newPrefs = {
        likedTriggers,
        dislikedApproaches: feedback.filter(f => f.response === "skipped").map(f => f.actionId),
        llmActions: actions,
        llmGeneratedAt: new Date().toISOString(),
        llmModel: model,
      };

      await storeActionPrefs(ownerId, newPrefs);

      if (attempt > 1) console.log(`    Succeeded on attempt ${attempt}`);
      return { ok: true, actionCount: actions.length, model, likedTriggers };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        console.log(`    Attempt ${attempt} failed (${err.message}), retrying...`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

export async function runGenerateLlmActions({ force = false, ownerIds, model } = {}) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const llmModel = model || process.env.LLM_MODEL || DEFAULT_MODEL;

  // Ollama health check
  try {
    const healthRes = await fetch(`${apiUrl.replace(/\/v1$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      const msg = `Ollama not reachable at ${apiUrl} (HTTP ${healthRes.status})`;
      console.error(`[generateLlmActions] ${msg}`);
      return { generated: 0, skipped: 0, model: llmModel, error: msg, results: [] };
    }
  } catch (err) {
    const msg = `Ollama not reachable at ${apiUrl} (${err.message})`;
    console.error(`[generateLlmActions] ${msg}`);
    return { generated: 0, skipped: 0, model: llmModel, error: msg, results: [] };
  }

  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
      ? envIds.split(",").filter(Boolean)
      : await listOwnerIds();

  console.log(`[generateLlmActions] Starting for ${owners.length} users (model=${llmModel}, force=${force})`);

  let generated = 0;
  let skipped = 0;
  const results = [];

  for (const ownerId of owners) {
    try {
      console.log(`  Processing ${ownerId.slice(0, 8)}...`);
      const result = await generateForOwner(ownerId, { model: llmModel, apiUrl, force });

      if (result.skipped) {
        console.log(`  Skipped ${ownerId.slice(0, 8)} (${result.reason})`);
        skipped++;
        results.push({ ownerId, skipped: true, reason: result.reason });
      } else {
        console.log(`  Generated ${result.actionCount} actions for ${ownerId.slice(0, 8)}`);
        generated++;
        results.push({ ownerId, ok: true, actionCount: result.actionCount });
      }
    } catch (err) {
      console.error(`  Error for ${ownerId.slice(0, 8)}: ${err.message}`);
      results.push({ ownerId, error: err.message });
    }
  }

  console.log(`[generateLlmActions] Done: ${generated} generated, ${skipped} skipped`);
  return { generated, skipped, model: llmModel, results };
}

// CLI entry point
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const flags = parseCliFlags(process.argv);
  runGenerateLlmActions(flags)
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.error ? 1 : 0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
