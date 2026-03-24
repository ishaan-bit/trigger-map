import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";
import { lintText, triggerLabel, cap } from "../utils/textGrammar.js";
import { buildSignalProfile } from "./signalProfile.js";

/**
 * Confidence-aware rule-based insight generator.
 *
 * Consumes the structured output from the rebuilt patternEngine
 * and generates grounded, honest observations — never faking
 * certainty when data is thin.
 */

// Natural-language list join for trigger names
function triggerList(triggers) {
  const items = (triggers || []).map(triggerLabel);
  if (items.length === 0) return "several areas";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

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
  return "You're just getting started. Every moment you log helps us learn how you tick. A few more and we'll start spotting patterns.";
}

function buildLowSummary(report, firstName) {
  const n = report.dataQuality.totalMoments;
  const opener = firstName ? `${firstName}, you've` : "You've";
  if (report.topTrigger) {
    return `${opener} logged ${n} moments so far, and ${triggerLabel(report.topTrigger)} has come up the most. Keep going, a few more days and your patterns will really start to take shape.`;
  }
  return `${n} moments logged across a few areas. No single theme stands out yet, which is fine. Patterns emerge with a bit more data.`;
}

function buildEmergingSummary(report, firstName) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${firstName ? firstName + ", " : ""}${cap(triggerLabel(report.topTrigger))} has been on your mind the most this week.`);
  } else if (report.tiedTriggers?.length) {
    parts.push(`${firstName ? firstName + ", your" : "Your"} week was split between ${triggerList(report.tiedTriggers)}.`);
  }

  if (report.topEmotion) {
    parts.push(`You felt ${report.topEmotion} most often this week.`);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`Good news: ${triggerLabel(r.trigger)} seems to bring you back to feeling ${r.emotion}. That's worth protecting.`);
  }

  if (bm?.drift?.direction === "declining") {
    parts.push("Your emotional tone has dipped a bit this week compared to your usual.");
  } else if (bm?.drift?.direction === "improving") {
    parts.push("You seem to be trending a little better than your usual this week.");
  }

  return parts.join(" ");
}

function buildModerateSummary(report, firstName) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${firstName ? firstName + ", " : ""}${cap(triggerLabel(report.topTrigger))} showed up the most this week.`);
  } else {
    parts.push(`${firstName ? firstName + ", no" : "No"} single trigger dominated. Your attention was spread across ${triggerList(report.tiedTriggers)}.`);
  }

  const sp = buildSignalProfile(report);

  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    const freq = f.count <= 2 ? 'sometimes' : 'often';
    let fLine = `When ${triggerLabel(f.trigger)} came up, it ${freq} left you feeling ${f.emotion} (${f.count}×).`;
    const rn = recurrenceNote(f.trigger, f.emotion, report.recurrence);
    if (rn) fLine += " " + rn;
    parts.push(fLine);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    const rVerb = r.count >= 3 ? 'kept leaving' : 'left';
    parts.push(`On the flip side, ${triggerLabel(r.trigger)} ${rVerb} you feeling ${r.emotion}, which is a good anchor.`);
  }

  const bl = baselineLanguage(report.baselineContext?.driftDirection);
  if (bm?.stateOfMind) {
    parts.push(`Overall, you're ${bm.stateOfMind}${bl ? ", " + bl : ""}.`);
  } else if (report.trajectoryNote) {
    parts.push(report.trajectoryNote);
  }

  const sn = streakNote(report.positiveStreak, report.negativeStreak);
  if (sn) parts.push(sn);

  return parts.join(" ");
}

function buildStrongSummary(report, firstName) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${firstName ? firstName + ", " : ""}${cap(triggerLabel(report.topTrigger))} was the main theme this week.`);
  } else {
    parts.push(`${firstName ? firstName + ", your" : "Your"} week touched on ${triggerList(report.tiedTriggers)} without one standing out.`);
  }

  const sp = buildSignalProfile(report);

  if (report.frictionZones.length) {
    const f = report.frictionZones[0];
    const fVerb = sp.triggerStrength === 'weak' ? 'showed up together' : 'kept showing up together';
    const fNote = sp.triggerStrength === 'weak' ? 'That may be worth watching.' : "That's a pattern worth noticing.";
    let fLine = `${cap(triggerLabel(f.trigger))} and feeling ${f.emotion} ${fVerb} (${f.count}×). ${fNote}`;
    const rn = recurrenceNote(f.trigger, f.emotion, report.recurrence);
    if (rn) fLine += " " + rn;
    parts.push(fLine);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    const rAdv = r.count >= 4 ? 'consistently' : 'generally';
    parts.push(`${cap(triggerLabel(r.trigger))} has ${rAdv} left you feeling ${r.emotion}.`);
  }

  const bl = baselineLanguage(report.baselineContext?.driftDirection);
  if (bm?.stateOfMind) {
    parts.push(`Right now, you're ${bm.stateOfMind}${bl ? ", " + bl : ""}.`);
  } else {
    if (report.volatilityScore !== null) {
      parts.push(report.volatilityScore < 0.5 ? "Emotionally, things have been pretty steady." : "There's been some emotional range this week.");
    }
    if (report.trajectoryNote) {
      parts.push(report.trajectoryNote);
    }
  }

  if (bm?.recoveryLatency) {
    parts.push(`When things dip, you tend to ${bm.recoveryLatency.label}. That's a good sign.`);
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

export async function generateInsight(report, opts = {}) {
  const confidence = report.dataQuality?.confidence || "too_early";
  const firstName = opts.firstName || null;

  let summary;
  switch (confidence) {
    case "too_early":
      summary = buildTooEarlySummary();
      break;
    case "low":
      summary = buildLowSummary(report, firstName);
      break;
    case "emerging":
      summary = buildEmergingSummary(report, firstName);
      break;
    case "moderate":
      summary = buildModerateSummary(report, firstName);
      break;
    default:
      summary = buildStrongSummary(report, firstName);
  }

  const trigger = report.topTrigger || report.tiedTriggers?.[0] || "work";
  const microExperiment = confidence !== "too_early" ? pickExperiment(trigger) : null;

  // Build structured fields for the new tab-based UI
  const whatWorking = buildWhatWorking(report);
  const whereToFocus = buildWhereToFocus(report);
  const bm = report.baselineMetrics;

  return {
    summary: lintText(appendPredictionContext(appendTagContext(summary, report), report)),
    microExperiment,
    whatWorking: whatWorking?.map(item => ({ ...item, text: lintText(item.text) })) || null,
    whereToFocus: whereToFocus?.map(item => ({ ...item, text: lintText(item.text) })) || null,
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
      text: `${cap(triggerLabel(r.trigger))} tends to leave you feeling ${r.emotion}`,
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
    items.push({ text: "You're consistently hovering near your emotional baseline. That's great stability" });
  }
  return items.length > 0 ? items : null;
}

function buildWhereToFocus(report) {
  const items = [];
  for (const f of (report.frictionZones || []).slice(0, 3)) {
    const freq = f.count <= 2 ? 'sometimes' : 'often';
    items.push({
      text: `${cap(triggerLabel(f.trigger))} ${freq} leaves you feeling ${f.emotion} - worth noticing`,
      trigger: f.trigger,
      emotion: f.emotion,
      count: f.count,
    });
  }
  const bm = report.baselineMetrics;
  if (bm?.drift?.direction === "declining") {
    const sp = buildSignalProfile(report);
    const driftText = sp.drift === 'slight_negative'
      ? "There's been a subtle dip below your usual emotional baseline"
      : "Your emotional tone has dipped below your usual baseline this week";
    items.push({ text: driftText });
  }
  if (bm?.recoveryLatency?.days > 3) {
    items.push({ text: "It's been taking a few days to bounce back after tough spots" });
  }
  return items.length > 0 ? items : null;
}
