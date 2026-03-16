import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

/**
 * Confidence-aware rule-based insight generator.
 *
 * Consumes the structured output from the rebuilt patternEngine
 * and generates grounded, honest observations — never faking
 * certainty when data is thin.
 */

const MICRO_EXPERIMENTS = {
  work: [
    "Close your laptop at a fixed time one evening this week and notice the shift.",
    "Give a task you have been avoiding just 10 focused minutes.",
    "Before your next meeting, take three slow breaths and set one intention.",
  ],
  social: [
    "Decline one invite this week and track how your energy responds.",
    "After your next social outing, write one word for how you feel.",
    "Reach out to someone you have not spoken to in a while.",
  ],
  money: [
    "Rate three purchases from this week on a felt-good scale.",
    "Apply a 24-hour wait before your next non-essential purchase.",
    "Review one subscription you are unsure about for 5 minutes.",
  ],
  family: [
    "Name one emotion out loud during a family conversation this week.",
    "Before a gathering, pick one boundary you want to keep.",
    "Write a short note to a family member, even if you do not send it.",
  ],
  exercise: [
    "Log your mood before and after your next workout and compare.",
    "Swap one intense session for a 20-minute walk this week.",
    "Try a stretch routine at a time of day you normally skip.",
  ],
  health: [
    "Track one health habit for three days and note your mood alongside.",
    "Replace 10 minutes of screen time with quiet before bed tonight.",
    "Take one small step toward a health concern you have postponed.",
  ],
  sleep: [
    "Put your phone down 30 minutes before bed for three nights.",
    "Wake at the same time for five days regardless of bedtime.",
    "Each morning, rate how rested you feel in one sentence.",
  ],
  partner: [
    "Ask your partner one open-ended question and just listen.",
    "When you feel a reaction mid-conversation, pause before responding.",
    "Write down one thing you appreciate about your partner today.",
  ],
  other: [
    "Spend 5 minutes writing freely about whatever is on your mind.",
    "Label your emotion the next time something unexpected happens.",
    "Describe one moment today as if telling a close friend.",
  ],
};

function pickExperiment(trigger) {
  const pool = MICRO_EXPERIMENTS[trigger] || MICRO_EXPERIMENTS.other;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildTooEarlySummary() {
  return "Still early days. A few more moments will give us enough to spot real patterns.";
}

function buildLowSummary(report) {
  const n = report.dataQuality.totalMoments;
  const frag = report.topTrigger
    ? `"${report.topTrigger}" appeared the most so far`
    : "no single trigger stands out yet";
  return `${n} moments logged — ${frag}. Keep going; patterns sharpen with a few more days.`;
}

function buildEmergingSummary(report) {
  const parts = [];
  const triggerEntries = Object.entries(report.triggerFrequency || {}).sort(([, a], [, b]) => b - a);
  const topCount = triggerEntries[0]?.[1] || 0;
  if (report.topTrigger && topCount >= 3) {
    parts.push(`"${report.topTrigger}" came up the most (${topCount} times).`);
  } else if (report.topTrigger) {
    parts.push(`"${report.topTrigger}" appeared more than other triggers, though still early.`);
  } else if (report.tiedTriggers?.length) {
    parts.push(`${report.tiedTriggers.join(", ")} appeared equally this week.`);
  }
  if (report.topEmotion) {
    parts.push(`Most common feeling: ${report.topEmotion}.`);
  } else if (report.tiedEmotions?.length) {
    parts.push(`Emotions were mixed: ${report.tiedEmotions.join(", ")}.`);
  }
  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`${r.trigger} paired with ${r.emotion} ${r.count} times, a possible stabilizer.`);
  }
  return parts.join(" ");
}

function buildModerateSummary(report) {
  const parts = [];
  const triggerEntries = Object.entries(report.triggerFrequency || {}).sort(([, a], [, b]) => b - a);
  const topCount = triggerEntries[0]?.[1] || 0;
  if (report.topTrigger && topCount >= 3) {
    parts.push(`"${report.topTrigger}" stood out this week (${topCount} times).`);
  } else if (report.topTrigger) {
    parts.push(`"${report.topTrigger}" appeared slightly more than others.`);
  } else {
    parts.push(`No single trigger dominated. ${report.tiedTriggers.join(", ")} were equally present.`);
  }
  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    parts.push(`${f.trigger} + ${f.emotion} repeated ${f.count} times — worth watching.`);
  }
  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`${r.trigger} kept linking to ${r.emotion}, which might be a regulator.`);
  }
  if (report.trajectoryNote) {
    parts.push(report.trajectoryNote);
  }
  return parts.join(" ");
}

function buildStrongSummary(report) {
  const parts = [];
  if (report.topTrigger) {
    parts.push(`"${report.topTrigger}" was the clearest theme this week.`);
  } else {
    parts.push(`No single trigger led — your attention was split across ${report.tiedTriggers.join(", ")}.`);
  }
  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    parts.push(`Friction zone: ${f.trigger} + ${f.emotion} (${f.count}x).`);
  }
  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`Regulator: ${r.trigger} + ${r.emotion} (${r.count}x).`);
  }
  if (report.volatilityScore !== null) {
    parts.push(report.volatilityScore < 0.5 ? "Emotionally steady overall." : "Noticeable emotional swings this week.");
  }
  if (report.trajectoryNote) {
    parts.push(report.trajectoryNote);
  }
  return parts.join(" ");
}

export async function generateInsight(report) {
  const confidence = report.dataQuality?.confidence || "too_early";

  let summary;
  switch (confidence) {
    case "too_early":
      summary = buildTooEarlySummary();
      break;
    case "low":
      summary = buildLowSummary(report);
      break;
    case "emerging":
      summary = buildEmergingSummary(report);
      break;
    case "moderate":
      summary = buildModerateSummary(report);
      break;
    default:
      summary = buildStrongSummary(report);
  }

  const trigger = report.topTrigger || report.tiedTriggers?.[0] || "other";
  const microExperiment = confidence !== "too_early" ? pickExperiment(trigger) : null;

  return {
    summary,
    microExperiment,
    confidence,
    model: "rule-based-v2",
    generatedAt: new Date().toISOString(),
  };
}
