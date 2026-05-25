export const MODE_FEEDBACK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function isRuleBasedModeOutput(output) {
  if (!output) return false;
  if (output.source === "llm" || output.source === "ai") return false;
  return output.source === "rule" || output.source === "rule_based" || output.model === "rule-based";
}

export function latestModeFeedback(feedbackEntries = [], { now = Date.now(), windowMs = MODE_FEEDBACK_WINDOW_MS } = {}) {
  const cutoff = now - windowMs;
  const latest = new Map();

  for (const entry of feedbackEntries) {
    if (!entry?.mode || !entry?.itemId || !entry?.response) continue;
    const timestamp = Number(entry.timestamp || 0);
    if (timestamp && timestamp < cutoff) continue;

    const key = `${entry.mode}:${entry.itemId}`;
    const previous = latest.get(key);
    if (!previous || timestamp >= Number(previous.timestamp || 0)) {
      latest.set(key, { ...entry, timestamp });
    }
  }

  return latest;
}

export function feedbackPreferenceIds(feedbackEntries = [], mode, options = {}) {
  const latest = latestModeFeedback(feedbackEntries, options);
  const liked = new Set();
  const disliked = new Set();

  for (const entry of latest.values()) {
    if (entry.mode !== mode || !entry.itemId) continue;
    if (entry.response === "helpful") {
      liked.add(entry.itemId);
      disliked.delete(entry.itemId);
    } else if (entry.response === "not_helpful") {
      disliked.add(entry.itemId);
      liked.delete(entry.itemId);
    }
  }

  return { liked: [...liked], disliked: [...disliked] };
}

export function buildModeFeedbackMap(results = {}, feedbackEntries = [], modes = ["move", "fuel", "perspective"]) {
  const latest = latestModeFeedback(feedbackEntries);
  const feedbackMap = {};

  for (const mode of modes) {
    const currentIds = new Set((results[mode]?.items || []).map((item) => item?.id).filter(Boolean));
    const generatedAt = results[mode]?.generatedAt ? new Date(results[mode].generatedAt).getTime() : 0;

    for (const entry of latest.values()) {
      if (entry.mode !== mode) continue;

      if (mode === "move" || mode === "fuel") {
        feedbackMap[entry.itemId] = entry.response;
        continue;
      }

      if (generatedAt && entry.timestamp >= generatedAt && currentIds.has(entry.itemId)) {
        feedbackMap[entry.itemId] = entry.response;
      }
    }
  }

  return feedbackMap;
}

export function buildModeFeedbackByMode(results = {}, feedbackEntries = [], modes = ["move", "fuel", "perspective"]) {
  const byMode = {};
  for (const mode of modes) {
    byMode[mode] = buildModeFeedbackMap(results, feedbackEntries, [mode]);
  }
  return byMode;
}

export function applyModeFeedbackToResults(results = {}, feedbackEntries = [], modes = ["move", "fuel"]) {
  const latest = latestModeFeedback(feedbackEntries);
  const next = { ...results };

  for (const mode of modes) {
    if (mode !== "move" && mode !== "fuel") continue;
    const output = next[mode];
    if (!output || !Array.isArray(output.items)) continue;

    const items = output.items.filter((item) => {
      const feedback = latest.get(`${mode}:${item?.id}`);
      return feedback?.response !== "not_helpful";
    });
    next[mode] = { ...output, items };
  }

  return next;
}
