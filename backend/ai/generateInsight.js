const TRIGGER_SUGGESTIONS = {
  work: "Consider setting boundaries around work hours to protect your downtime.",
  social: "Social energy varies. Try balancing group time with quiet recovery.",
  money: "Financial stress often eases with even a small budgeting step each week.",
  family: "Family dynamics can be complex. Naming what you feel is already progress.",
  exercise: "Movement affects mood. Notice whether exercise lifts or drains you.",
  health: "Health concerns carry emotional weight, so be patient with yourself.",
  sleep: "Sleep and mood are tightly linked. A consistent wind-down routine may help.",
  partner: "Relationship triggers often reveal unspoken needs worth exploring.",
  other: "Unnamed triggers still matter. Try journaling to find more specific patterns.",
};

const EMOTION_INSIGHTS = {
  calm: "Calm moments are your anchors. Notice what conditions create them.",
  neutral: "Neutral isn't empty. It may mean things are steady, or feelings are muted.",
  anxious: "Anxiety often points to uncertainty. Identifying the source can reduce its grip.",
  frustrated: "Frustration usually signals a blocked need. What were you hoping for?",
  energized: "High energy is a resource. Channel it before it fades.",
};

const MICRO_EXPERIMENTS = {
  work: [
    "This week, try closing your laptop at a set time each evening and notice how it feels.",
    "Pick one work task you've been avoiding and give it just 10 minutes today.",
    "Before your next meeting, take three slow breaths and set one intention.",
  ],
  social: [
    "This week, try saying no to one social invite and see how your energy shifts.",
    "Reach out to someone you haven't spoken to in a while with a short, honest message.",
    "After your next social event, jot down one word for how you feel.",
  ],
  money: [
    "Write down three things you spent money on this week and rate how each made you feel.",
    "Set a 24-hour waiting rule before your next non-essential purchase.",
    "Spend five minutes reviewing one subscription you're unsure about.",
  ],
  family: [
    "This week, try naming one emotion out loud during a family conversation.",
    "Write a short note to a family member, even if you don't send it.",
    "Before a family gathering, decide on one boundary you want to keep.",
  ],
  exercise: [
    "Log your mood right before and right after your next workout and compare.",
    "Try replacing one intense session with a 20-minute walk this week.",
    "Pick a time of day you don't usually exercise and try a short stretch routine.",
  ],
  health: [
    "Track one health habit (water, sleep, or meals) for three days and note your mood alongside it.",
    "Replace screen time with 10 minutes of quiet before bed tonight.",
    "Write down one health concern you've been putting off and take one small step toward it.",
  ],
  sleep: [
    "Set a phone-down time 30 minutes before bed for three nights and notice any difference.",
    "Try waking up at the same time for five days, regardless of when you fall asleep.",
    "Keep a one-sentence sleep journal each morning: how rested do you feel?",
  ],
  partner: [
    "This week, try asking your partner one open-ended question and just listen.",
    "Notice when you feel a reaction during a conversation and pause before responding.",
    "Write down one thing you appreciate about your partner, even on a hard day.",
  ],
  other: [
    "Spend five minutes this week writing freely about whatever is on your mind.",
    "Try labeling your emotion the next time something unexpected happens.",
    "Pick one moment today and describe it to yourself as if telling a friend.",
  ],
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
      `This week, "${topTrigger}" came up most often, and when it did, you tended to feel ${topEmotion}.`
    );
  }
  if (volatility && !volatility.includes("Not enough")) {
    summaryParts.push(`Emotional flow: ${volatility}.`);
  }
  if (stableDay && !stableDay.includes("Not enough")) {
    summaryParts.push(`${stableDay} felt the most balanced.`);
  }

  const summary = summaryParts.join(" ") || "Keep logging; patterns will emerge with more data.";

  const suggestion =
    TRIGGER_SUGGESTIONS[topTrigger] ||
    EMOTION_INSIGHTS[topEmotion] ||
    "Try logging at least once a day to build a clearer picture of your patterns.";

  const experiments = MICRO_EXPERIMENTS[topTrigger] || MICRO_EXPERIMENTS.other;
  const microExperiment = experiments[Math.floor(Math.random() * experiments.length)];

  return {
    summary,
    suggestion,
    microExperiment,
    model: "rule-based-v1",
    raw: `${summary}\n\n${suggestion}`,
  };
}

function parseTopEntry(text) {
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    if (typeof obj === "object" && obj !== null) {
      const sorted = Object.entries(obj).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      );
      return sorted[0]?.[0]?.toLowerCase() || null;
    }
  } catch {
    // not JSON, try plain text
  }
  const match = String(text).match(/^[\s-]*(\w+)/m);
  return match ? match[1].toLowerCase() : null;
}