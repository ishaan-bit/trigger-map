const MIN_MOMENTS = 5;

/**
 * Generate client-side micro-insight strings from a list of moments.
 * Returns an array of plain-text observation strings (max 3).
 */
export function generateMicroInsights(moments) {
  if (!moments || moments.length < MIN_MOMENTS) return [];

  const insights = [];
  const triggerCounts = {};
  const triggerEmotionCounts = {};
  const emotionCounts = {};

  for (const m of moments) {
    triggerCounts[m.trigger] = (triggerCounts[m.trigger] || 0) + 1;
    emotionCounts[m.emotion] = (emotionCounts[m.emotion] || 0) + 1;
    const pairKey = `${m.trigger}\u2192${m.emotion}`;
    triggerEmotionCounts[pairKey] = (triggerEmotionCounts[pairKey] || 0) + 1;
  }

  // Most frequent trigger→emotion pair
  let topPair = null;
  let topPairCount = 0;
  for (const [key, count] of Object.entries(triggerEmotionCounts)) {
    if (count > topPairCount) {
      topPairCount = count;
      topPair = key;
    }
  }
  if (topPair && topPairCount >= 2) {
    const [trigger, emotion] = topPair.split("\u2192");
    insights.push(`When ${trigger} comes up, you often end up feeling ${emotion}. That pattern showed ${topPairCount} times recently.`);
  }

  // Dominant emotion
  const sortedEmotions = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a);
  if (sortedEmotions.length >= 2) {
    const [topEmotion, topCount] = sortedEmotions[0];
    const pct = Math.round((topCount / moments.length) * 100);
    if (pct >= 40) {
      insights.push(`You\u2019ve been feeling ${topEmotion} about ${pct}% of the time. It\u2019s your dominant state lately.`);
    }
  }

  // Escalating trigger
  const mid = Math.floor(moments.length / 2);
  const olderHalf = moments.slice(mid);
  const newerHalf = moments.slice(0, mid);
  const olderTriggers = {};
  const newerTriggers = {};
  for (const m of olderHalf) olderTriggers[m.trigger] = (olderTriggers[m.trigger] || 0) + 1;
  for (const m of newerHalf) newerTriggers[m.trigger] = (newerTriggers[m.trigger] || 0) + 1;

  for (const trigger of Object.keys(newerTriggers)) {
    const newer = newerTriggers[trigger] || 0;
    const older = olderTriggers[trigger] || 0;
    if (newer >= 3 && newer > older * 2) {
      insights.push(`${trigger} has been showing up more often recently. Something may have shifted.`);
      break;
    }
  }

  return insights.slice(0, 3);
}
