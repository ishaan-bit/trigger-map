const TRIGGER_SUGGESTIONS = {
  work: "Consider setting boundaries around work hours to protect your downtime.",
  social: "Social energy varies — try balancing group time with quiet recovery.",
  money: "Financial stress often eases with even a small budgeting step each week.",
  family: "Family dynamics can be complex. Naming what you feel is already progress.",
  exercise: "Movement affects mood. Notice whether exercise lifts or drains you.",
  health: "Health concerns carry emotional weight — be patient with yourself.",
  sleep: "Sleep and mood are tightly linked. A consistent wind-down routine may help.",
  partner: "Relationship triggers often reveal unspoken needs worth exploring.",
  other: "Unnamed triggers still matter. Try journaling to find more specific patterns.",
};

const EMOTION_INSIGHTS = {
  calm: "Calm moments are your anchors — notice what conditions create them.",
  neutral: "Neutral isn't empty. It may mean things are steady, or feelings are muted.",
  anxious: "Anxiety often points to uncertainty. Identifying the source can reduce its grip.",
  frustrated: "Frustration usually signals a blocked need. What were you hoping for?",
  energized: "High energy is a resource. Channel it before it fades.",
};

export function buildInsightPrompt({ triggerData, emotionData, volatility, stableDay }) {
  return { triggerData, emotionData, volatility, stableDay };
}

export async function generateInsight(input) {
  const { triggerData, emotionData, volatility, stableDay } = input;

  const topTrigger = parseTopEntry(triggerData);
  const topEmotion = parseTopEntry(emotionData);

  const summaryParts = [];
  if (topTrigger && topEmotion) {
    summaryParts.push(
      `Your week was most shaped by "${topTrigger}" triggers, and you often felt ${topEmotion}.`
    );
  }
  if (volatility && !volatility.includes("Not enough")) {
    summaryParts.push(`Emotional volatility: ${volatility}.`);
  }
  if (stableDay && !stableDay.includes("Not enough")) {
    summaryParts.push(`Your most balanced day was ${stableDay}.`);
  }

  const summary = summaryParts.join(" ") || "Keep logging — patterns will emerge with more data.";

  const suggestion =
    TRIGGER_SUGGESTIONS[topTrigger] ||
    EMOTION_INSIGHTS[topEmotion] ||
    "Try logging at least once a day to build a clearer picture of your patterns.";

  return {
    summary,
    suggestion,
    model: "rule-based-v1",
    raw: `${summary}\n\n${suggestion}`,
  };
}

function parseTopEntry(text) {
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    if (typeof obj === "object" && obj !== null) {
      const sorted = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      return sorted[0]?.[0]?.toLowerCase() || null;
    }
  } catch {
    // not JSON, try plain text
  }
  const match = String(text).match(/^[\s-]*(\w+)/m);
  return match ? match[1].toLowerCase() : null;
}