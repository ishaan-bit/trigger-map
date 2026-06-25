import { coordinatesToLegacy } from "@triggermap/shared/constants/emotions";

const MIN_MOMENTS = 5;

/** Resolve a moment's legacy emotion key, falling back to coordinates so a
 *  missing `emotion` never surfaces as "undefined" in copy. */
function momentEmotion(m) {
  if (m.emotion) return m.emotion;
  if (typeof m.valence === "number" && typeof m.arousal === "number") {
    return coordinatesToLegacy(m.valence, m.arousal);
  }
  return "neutral";
}

/** Translate an emotion key, guarding against the t() missing-key passthrough. */
function emotionDisplay(key, t) {
  if (!t) return key;
  const v = t("emotions." + key);
  return v && v !== "emotions." + key ? v : key;
}

/**
 * Generate client-side micro-insight strings from a list of moments.
 * Returns an array of plain-text observation strings (max ~3).
 */
export function generateMicroInsights(moments, t) {
  if (!moments || moments.length < MIN_MOMENTS) {
    return [];
  }

  const insights = [];

  // Count trigger→emotion pairs
  const triggerCounts = {};
  const triggerEmotionCounts = {};
  const emotionCounts = {};

  for (const m of moments) {
    const emo = momentEmotion(m);
    triggerCounts[m.trigger] = (triggerCounts[m.trigger] || 0) + 1;
    emotionCounts[emo] = (emotionCounts[emo] || 0) + 1;

    const pairKey = `${m.trigger}→${emo}`;
    triggerEmotionCounts[pairKey] = (triggerEmotionCounts[pairKey] || 0) + 1;
  }

  // Find most frequent trigger→emotion pair
  let topPair = null;
  let topPairCount = 0;
  for (const [key, count] of Object.entries(triggerEmotionCounts)) {
    if (count > topPairCount) {
      topPairCount = count;
      topPair = key;
    }
  }

  if (topPair && topPairCount >= 2) {
    const [trigger, emotion] = topPair.split("→");
    const triggerName = t ? (t("triggers." + trigger) || trigger) : trigger;
    const emotionName = emotionDisplay(emotion, t);
    if (t) {
      insights.push(t("microInsight.triggerEmotion", { trigger: triggerName, emotion: emotionName, count: topPairCount }));
    } else {
      insights.push(`When ${trigger} comes up, you often end up feeling ${emotion}. That pattern showed ${topPairCount} times recently.`);
    }
  }

  // Find dominant emotion
  const sortedEmotions = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a);
  if (sortedEmotions.length >= 2) {
    const [topEmotion, topCount] = sortedEmotions[0];
    const pct = Math.round((topCount / moments.length) * 100);
    if (pct >= 40) {
      const emotionName = emotionDisplay(topEmotion, t);
      if (t) {
        insights.push(t("microInsight.dominantEmotion", { emotion: emotionName, pct }));
      } else {
        insights.push(`You've been feeling ${topEmotion} about ${pct}% of the time. It's your dominant state lately.`);
      }
    }
  }

  // Find if any trigger is escalating (more in recent half than first half)
  const mid = Math.floor(moments.length / 2);
  const olderHalf = moments.slice(mid); // older (timeline is reverse-chron)
  const newerHalf = moments.slice(0, mid);

  const olderTriggers = {};
  const newerTriggers = {};
  for (const m of olderHalf) olderTriggers[m.trigger] = (olderTriggers[m.trigger] || 0) + 1;
  for (const m of newerHalf) newerTriggers[m.trigger] = (newerTriggers[m.trigger] || 0) + 1;

  for (const trigger of Object.keys(newerTriggers)) {
    const newer = newerTriggers[trigger] || 0;
    const older = olderTriggers[trigger] || 0;
    if (newer >= 3 && newer > older * 2) {
      const triggerName = t ? (t("triggers." + trigger) || trigger) : trigger;
      if (t) {
        insights.push(t("microInsight.escalating", { trigger: triggerName }));
      } else {
        insights.push(`${trigger} has been showing up more often recently. Something may have shifted.`);
      }
      break;
    }
  }

  return insights.slice(0, 3);
}
