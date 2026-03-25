const MIN_MOMENTS = 5;

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
    triggerCounts[m.trigger] = (triggerCounts[m.trigger] || 0) + 1;
    emotionCounts[m.emotion] = (emotionCounts[m.emotion] || 0) + 1;

    const pairKey = `${m.trigger}→${m.emotion}`;
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
    const emotionName = t ? (t("emotions." + emotion) || emotion) : emotion;
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
      const emotionName = t ? (t("emotions." + topEmotion) || topEmotion) : topEmotion;
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
