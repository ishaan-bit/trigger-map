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
  family: [
    "Name one emotion out loud during a family conversation this week.",
    "Before a gathering, pick one boundary you want to keep.",
    "Write a short note to a family member, even if you do not send it.",
  ],
  partner: [
    "Ask your partner one open-ended question and just listen.",
    "When you feel a reaction mid-conversation, pause before responding.",
    "Write down one thing you appreciate about your partner today.",
  ],
  social: [
    "Decline one invite this week and track how your energy responds.",
    "After your next social outing, write one word for how you feel.",
    "Reach out to someone you have not spoken to in a while.",
  ],
  alone: [
    "Block 30 minutes of solo time this week with no screens.",
    "During your next stretch of alone time, label the emotion you feel halfway through.",
    "Notice whether solitude charges or drains you at different times of day.",
  ],
  exercise: [
    "Log your mood before and after your next workout and compare.",
    "Swap one intense session for a 20-minute walk this week.",
    "Try a stretch routine at a time of day you normally skip.",
  ],
  travel: [
    "On your next trip, note one moment when the environment shifted your mood.",
    "Before traveling, write down what you hope to feel by the end.",
    "After arriving somewhere new, spend five minutes watching your surroundings silently.",
  ],
  health: [
    "Track one health habit for three days and note your mood alongside.",
    "Replace 10 minutes of screen time with quiet before bed tonight.",
    "Take one small step toward a health concern you have postponed.",
  ],
  money: [
    "Rate three purchases from this week on a felt-good scale.",
    "Apply a 24-hour wait before your next non-essential purchase.",
    "Review one subscription you are unsure about for 5 minutes.",
  ],
};

function pickExperiment(trigger) {
  const pool = MICRO_EXPERIMENTS[trigger] || MICRO_EXPERIMENTS.work;
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Continuity language helpers (v81) ---

function recurrenceNote(trigger, emotion, recurrence) {
  if (!recurrence?.length) return null;
  const match = recurrence.find(r => r.trigger === trigger && r.emotion === emotion);
  if (!match) return null;
  return match.label === "recurring"
    ? "This pattern has come up a few times this week."
    : "This showed up more than once this week.";
}

function baselineLanguage(direction) {
  if (direction === "improving") return "slightly better than your usual pattern";
  if (direction === "declining") return "a bit below your usual pattern";
  if (direction === "stable") return "fairly consistent with your usual pattern";
  return null;
}

function streakNote(positiveStreak, negativeStreak) {
  const parts = [];
  if (negativeStreak?.days >= 2) {
    parts.push(`You had a ${negativeStreak.days}-day stretch of lower energy before recovering.`);
  }
  if (positiveStreak?.days >= 2) {
    parts.push(`You maintained a steady stretch of higher energy for ${positiveStreak.days} days.`);
  }
  return parts.length ? parts[0] : null;
}

function buildTooEarlySummary() {
  return "You're just getting started — every moment you log helps us learn how you tick. A few more and we'll start spotting patterns.";
}

function buildLowSummary(report) {
  const n = report.dataQuality.totalMoments;
  if (report.topTrigger) {
    return `You've logged ${n} moments so far, and ${report.topTrigger} has come up the most. Keep going — a few more days and your patterns will really start to take shape.`;
  }
  return `${n} moments logged across a few areas. No single theme stands out yet, which is fine — patterns emerge with a bit more data.`;
}

function buildEmergingSummary(report) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${report.topTrigger} has been on your mind the most this week.`);
  } else if (report.tiedTriggers?.length) {
    parts.push(`Your week was split between ${report.tiedTriggers.join(" and ")}.`);
  }

  if (report.topEmotion) {
    parts.push(`${report.topEmotion} was your most common feeling.`);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`Good news: ${r.trigger} seems to bring you back to ${r.emotion} — that's worth protecting.`);
  }

  if (bm?.drift?.direction === "declining") {
    parts.push("Your emotional tone has dipped a bit this week compared to your usual.");
  } else if (bm?.drift?.direction === "improving") {
    parts.push("You seem to be trending a little better than your usual this week.");
  }

  return parts.join(" ");
}

function buildModerateSummary(report) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${report.topTrigger} showed up the most this week.`);
  } else {
    parts.push(`No single trigger dominated — your attention was spread across ${report.tiedTriggers?.join(", ") || "a few areas"}.`);
  }

  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    let fLine = `When ${f.trigger} came up, it often left you feeling ${f.emotion} — that happened ${f.count} times.`;
    const rn = recurrenceNote(f.trigger, f.emotion, report.recurrence);
    if (rn) fLine += " " + rn;
    parts.push(fLine);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`On the flip side, ${r.trigger} kept bringing ${r.emotion}, which is a good anchor.`);
  }

  const bl = baselineLanguage(report.baselineContext?.driftDirection);
  if (bm?.stateOfMind) {
    parts.push(`Overall, you're ${bm.stateOfMind}${bl ? " — " + bl : ""}.`);
  } else if (report.trajectoryNote) {
    parts.push(report.trajectoryNote);
  }

  const sn = streakNote(report.positiveStreak, report.negativeStreak);
  if (sn) parts.push(sn);

  return parts.join(" ");
}

function buildStrongSummary(report) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${report.topTrigger} was the main theme this week.`);
  } else {
    parts.push(`Your week touched on ${report.tiedTriggers?.join(", ") || "several areas"} without one standing out.`);
  }

  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    let fLine = `${f.trigger} and ${f.emotion} kept pairing up (${f.count}×) — that's a pattern worth noticing.`;
    const rn = recurrenceNote(f.trigger, f.emotion, report.recurrence);
    if (rn) fLine += " " + rn;
    parts.push(fLine);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`${r.trigger} has been a consistent source of ${r.emotion} for you.`);
  }

  const bl = baselineLanguage(report.baselineContext?.driftDirection);
  if (bm?.stateOfMind) {
    parts.push(`Right now, you're ${bm.stateOfMind}${bl ? " — " + bl : ""}.`);
  } else {
    if (report.volatilityScore !== null) {
      parts.push(report.volatilityScore < 0.5 ? "Emotionally, things have been pretty steady." : "There's been some emotional range this week.");
    }
    if (report.trajectoryNote) {
      parts.push(report.trajectoryNote);
    }
  }

  if (bm?.recoveryLatency) {
    parts.push(`When things dip, you tend to ${bm.recoveryLatency.label}.`);
  }

  const sn = streakNote(report.positiveStreak, report.negativeStreak);
  if (sn) parts.push(sn);

  return parts.join(" ");
}

function appendTagContext(summary, report) {
  const tagFreq = report.tagFrequency;
  if (!tagFreq || !Object.keys(tagFreq).length) return summary;

  const sorted = Object.entries(tagFreq).sort(([, a], [, b]) => b - a);
  const topTag = sorted[0];
  if (!topTag || topTag[1] < 2) return summary;

  return `${summary} Notably, "${topTag[0]}" came up ${topTag[1]} times across your moments.`;
}

function appendPredictionContext(summary, report) {
  const pa = report.predictionAccuracy;
  if (!pa || pa.daysCompared < 2) return summary;

  if (pa.rate >= 0.6) {
    return `${summary} You seem to anticipate your days fairly accurately.`;
  }
  if (pa.rate <= 0.3) {
    return `${summary} Your days often unfolded differently than expected.`;
  }
  return summary;
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

  const trigger = report.topTrigger || report.tiedTriggers?.[0] || "work";
  const microExperiment = confidence !== "too_early" ? pickExperiment(trigger) : null;

  // Build structured fields for the new tab-based UI
  const whatWorking = buildWhatWorking(report);
  const whereToFocus = buildWhereToFocus(report);
  const bm = report.baselineMetrics;

  return {
    summary: appendPredictionContext(appendTagContext(summary, report), report),
    microExperiment,
    whatWorking,
    whereToFocus,
    stateOfMind: bm?.stateOfMind || null,
    baselineSummary: bm?.baseline?.reliable
      ? `Your emotional baseline sits around ${bm.baseline.label}. ${bm.drift ? `This week you're ${bm.drift.label} compared to your norm.` : ""}`
      : null,
    confidence,
    model: "rule-based-v3",
    generatedAt: new Date().toISOString(),
  };
}

function buildWhatWorking(report) {
  const items = [];
  for (const r of (report.regulators || []).slice(0, 3)) {
    items.push({
      text: `${r.trigger} tends to bring you ${r.emotion}`,
      trigger: r.trigger,
      emotion: r.emotion,
      count: r.count,
    });
  }
  if (report.volatilityScore !== null && report.volatilityScore < 0.5) {
    items.push({ text: "Your emotions have been pretty steady this week" });
  }
  const bm = report.baselineMetrics;
  if (bm?.stability?.score >= 0.7) {
    items.push({ text: "You're consistently hovering near your emotional baseline — that's great stability" });
  }
  return items.length > 0 ? items : null;
}

function buildWhereToFocus(report) {
  const items = [];
  for (const f of (report.frictionZones || []).slice(0, 3)) {
    items.push({
      text: `${f.trigger} often leads to ${f.emotion} — worth noticing`,
      trigger: f.trigger,
      emotion: f.emotion,
      count: f.count,
    });
  }
  const bm = report.baselineMetrics;
  if (bm?.drift?.direction === "declining") {
    items.push({ text: "Your emotional tone has dipped below your usual baseline this week" });
  }
  if (bm?.recoveryLatency?.days > 3) {
    items.push({ text: `It's been taking a few days to bounce back after tough spots — ${bm.recoveryLatency.label}` });
  }
  return items.length > 0 ? items : null;
}
