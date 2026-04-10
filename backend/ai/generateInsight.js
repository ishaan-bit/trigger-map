import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";
import { lintText, triggerLabel, cap } from "../utils/textGrammar.js";
import { buildSignalProfile, rankSignals, detectRelationship } from "./signalProfile.js";
import { retrieveForRuleBased, retrieveIntervention } from "../knowledge/ragEngine.js";
import {
  triggerHi, emotionHi,
  MICRO_EXPERIMENTS_HI,
  buildTooEarlySummaryHi, buildStaleSummaryHi, buildLowSummaryHi, buildEmergingSummaryHi,
  buildModerateSummaryHi, buildStrongSummaryHi,
  buildWhatWorkingHi, buildWhereToFocusHi,
  buildActionableDirectionHi, baselineSummaryHi,
  appendTagContextHi,
} from "./insightLang.js";

function emotionAvgScore(emotions) {
  let total = 0, weighted = 0;
  for (const [emotion, count] of Object.entries(emotions || {})) {
    const n = Number(count || 0);
    total += n;
    weighted += (EMOTION_SCORE[emotion] || 3) * n;
  }
  return total ? weighted / total : 3;
}

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
  if (direction === "stable") return "in line with your usual pattern";
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

function buildStaleSummary(report, firstName) {
  const dq = report.dataQuality || {};
  const days = dq.daysSinceLastLog || "a while";
  const name = firstName ? `${firstName}, it` : "It";
  const topT = report.topTrigger;
  const topE = report.topEmotion;

  let core = `${name} has been ${days} days since your last check-in. Here's what we still see from your previous activity.`;

  if (topT && topE) {
    core += ` ${cap(triggerLabel(topT))} was your most common area, and you felt ${topE} most often.`;
  } else if (topT) {
    core += ` ${cap(triggerLabel(topT))} was on your mind the most.`;
  }

  if (report.regulators?.length) {
    const r = report.regulators[0];
    core += ` ${cap(triggerLabel(r.trigger))} tended to bring you back to feeling ${r.emotion}. That anchor is still here.`;
  }

  core += " Log a moment whenever you're ready — your patterns are waiting.";
  return core;
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
  const sp = buildSignalProfile(report);
  const ranked = rankSignals(report, sp);
  const rel = detectRelationship(ranked);
  const bm = report.baselineMetrics;
  const name = firstName ? firstName + ", " : "";

  // ── Sentence 1: Surface state ──
  let s1;
  const avgScoreM = emotionAvgScore(report.emotionFrequency || {});
  if (sp.volatility === 'low' && sp.dominantEmotion === 'neutral') {
    s1 = sp.isFlattening
      ? `${name}your week looked stable on the surface, with neutral showing up more than any other feeling.`
      : `${name}your week was steady, with neutral being the most common feeling.`;
  } else if (sp.volatility === 'low' && avgScoreM < 2.5) {
    const topFriction = report.frictionZones?.[0];
    s1 = topFriction
      ? `${name}${triggerLabel(topFriction.trigger)} brought consistent friction this week, with ${topFriction.emotion} running through most days.`
      : `${name}this week carried a heavy emotional tone, with frustration or anxiety showing up often.`;
  } else if (sp.volatility === 'low') {
    s1 = `${name}things have been steady this week, with ${report.topEmotion || 'a consistent tone'} showing up most.`;
  } else if (sp.dominantEmotion === 'neutral' && report.frictionZones?.length && report.topTrigger) {
    s1 = `${name}${cap(triggerLabel(report.topTrigger))} came up the most this week, but most of it felt neutral.`;
  } else if (report.topTrigger) {
    s1 = `${name}${cap(triggerLabel(report.topTrigger))} came up the most this week.`;
  } else {
    s1 = `${name}your attention was spread across ${triggerList(report.tiedTriggers)} without one standing out.`;
  }

  // ── Sentence 2: Underlying shift or contrast ──
  let s2;
  if (rel === 'contrast') {
    // Flattening: neutral-dominant + within-week decline
    if (sp.isFlattening) {
      const topT = report.topTrigger;
      const neutralPair = report.recurrence?.find(r => r.trigger === topT && r.emotion === 'neutral');
      if (neutralPair) {
        s2 = `Underneath, ${triggerLabel(topT)} came up the most but didn't produce strong reactions, and your responses have been narrowing toward neutral as the week went on.`;
      } else {
        s2 = "Underneath, your emotional responses have been narrowing toward neutral, with less variation as the week went on.";
      }
    }
    // Stable surface + negative drift
    else if (sp.volatility === 'low' && (sp.drift === 'slight_negative' || sp.drift === 'strong_negative')) {
      const driftAdj = sp.drift === 'slight_negative' ? 'a subtle shift' : 'a noticeable shift';
      s2 = `While the surface looks stable, there's been ${driftAdj} below your usual baseline.`;
    }
    // Anchor present but tone not improving
    else if (ranked.anchor && sp.drift !== 'positive') {
      const a = ranked.anchor.data || {};
      const anchorTrigger = a.trigger || report.regulators?.[0]?.trigger;
      s2 = anchorTrigger
        ? `Although ${triggerLabel(anchorTrigger)} tends to help, your overall tone hasn't lifted this week.`
        : "There are positive signals, but your overall tone hasn't lifted this week.";
    }
    // Frequent trigger + neutral emotion
    else if (report.topTrigger && sp.dominantEmotion === 'neutral') {
      s2 = `${cap(triggerLabel(report.topTrigger))} appeared often, but your emotional response stayed mostly flat.`;
    }
    // Generic contrast fallback
    else {
      s2 = buildContrastFallback(report, sp);
    }
  } else {
    // Alignment — signals reinforce each other
    if (report.frictionZones?.length) {
      const f = report.frictionZones[0];
      const freq = f.count <= 2 ? 'sometimes' : 'often';
      s2 = `${cap(triggerLabel(f.trigger))} ${freq} left you feeling ${f.emotion} (${f.count}×).`;
    } else if (bm?.stateOfMind) {
      const bl = baselineLanguage(report.baselineContext?.driftDirection);
      s2 = `You're ${bm.stateOfMind}${bl ? ", " + bl : ""}.`;
    } else if (report.trajectoryNote) {
      s2 = report.trajectoryNote;
    } else {
      s2 = sp.volatility === 'low'
        ? "Your emotional range was narrow, with little variation day to day."
        : "There was some emotional range this week, though nothing stood out sharply.";
    }
  }

  // ── Sentence 3: Context or anchor ──
  let s3;
  if (report.regulators?.length) {
    const r = report.regulators[0];
    if (sp.isFlattening) {
      s3 = `${cap(triggerLabel(r.trigger))} still brought you ${r.emotion}, but it hasn't been enough to shift the overall tone.`;
    } else {
      const rVerb = r.count >= 3 ? 'kept leaving' : 'left';
      s3 = `${cap(triggerLabel(r.trigger))} ${rVerb} you feeling ${r.emotion}, which is a good anchor.`;
    }
  } else if (bm?.stateOfMind && !s2.includes(bm.stateOfMind)) {
    s3 = `Overall, you're ${bm.stateOfMind}.`;
  } else {
    s3 = report.trajectoryNote && !s2.includes(report.trajectoryNote)
      ? report.trajectoryNote
      : "No single pattern dominated, so there's room to explore what shapes your week.";
  }

  return `${cap(s1)} ${s2} ${s3}`;
}

// Fallback for contrast when primary patterns are ambiguous
function buildContrastFallback(report, sp) {
  if (report.frictionZones?.length) {
    const f = report.frictionZones[0];
    const freq = f.count <= 2 ? 'sometimes' : 'often';
    return `${cap(triggerLabel(f.trigger))} ${freq} left you feeling ${f.emotion}, even though things looked steady on the surface.`;
  }
  if (sp.drift === 'slight_negative') {
    return "There's been a subtle downward shift in your emotional tone, even as day-to-day moments stayed consistent.";
  }
  return "Underneath the surface, some signals suggest a quiet shift worth watching.";
}

function buildStrongSummary(report, firstName) {
  const sp = buildSignalProfile(report);
  const ranked = rankSignals(report, sp);
  const rel = detectRelationship(ranked);
  const bm = report.baselineMetrics;
  const name = firstName ? firstName + ", " : "";

  // ── Sentence 1: Surface state ──
  let s1;
  const avgScoreS = emotionAvgScore(report.emotionFrequency || {});
  if (sp.volatility === 'low' && sp.dominantEmotion === 'neutral') {
    s1 = sp.isFlattening
      ? `${name}your week looked calm on the surface, but neutral was the dominant feeling, with less emotional range than usual.`
      : `${name}your week was quiet and largely neutral, without much emotional movement.`;
  } else if (sp.volatility === 'low' && avgScoreS < 2.5) {
    const topFriction = report.frictionZones?.[0];
    s1 = topFriction
      ? `${name}${triggerLabel(topFriction.trigger)} brought persistent friction this week, with ${topFriction.emotion} running through most days.`
      : `${name}this week carried a heavy emotional tone, with frustration or anxiety present throughout.`;
  } else if (sp.volatility === 'low') {
    s1 = `${name}things were steady this week, with ${report.topEmotion || 'a consistent emotional tone'} showing up most.`;
  } else if (sp.volatility === 'high') {
    s1 = `${name}there was a lot of emotional range this week, with shifts between different states.`;
  } else if (sp.dominantEmotion === 'neutral' && report.frictionZones?.length && report.topTrigger) {
    s1 = `${name}${cap(triggerLabel(report.topTrigger))} was the main theme this week, but most of it felt neutral.`;
  } else if (report.topTrigger) {
    s1 = `${name}${cap(triggerLabel(report.topTrigger))} was the main theme this week.`;
  } else {
    s1 = `${name}your week touched on ${triggerList(report.tiedTriggers)} without one standing out.`;
  }

  // ── Sentence 2: Underlying shift or contrast ──
  let s2;
  if (rel === 'contrast') {
    // Flattening: neutral-dominant + within-week decline
    if (sp.isFlattening) {
      const topT = report.topTrigger;
      const neutralPair = report.recurrence?.find(r => r.trigger === topT && r.emotion === 'neutral');
      if (neutralPair) {
        s2 = `${cap(triggerLabel(topT))} appeared often but didn't produce strong reactions, and your emotional responses narrowed toward neutral as the week went on.`;
      } else {
        s2 = "Your emotional responses narrowed toward neutral as the week went on, suggesting a subtle flattening in how you're responding to experiences.";
      }
    }
    else if (sp.volatility === 'low' && (sp.drift === 'slight_negative' || sp.drift === 'strong_negative')) {
      const driftAdj = sp.drift === 'slight_negative' ? 'a subtle decline' : 'a clear dip';
      s2 = `On the surface things look consistent, but there's been ${driftAdj} compared to your usual baseline.`;
    } else if (ranked.anchor && sp.drift !== 'positive' && report.frictionZones?.length) {
      const f = report.frictionZones[0];
      const a = ranked.anchor.data || report.regulators?.[0] || {};
      const fVerb = sp.triggerStrength === 'weak' ? 'showed up together' : 'kept showing up together';
      s2 = a.trigger
        ? `While ${triggerLabel(a.trigger)} tends to help, ${triggerLabel(f.trigger)} and feeling ${f.emotion} ${fVerb} (${f.count}×).`
        : `${cap(triggerLabel(f.trigger))} and feeling ${f.emotion} ${fVerb} (${f.count}×). That's worth noticing.`;
    } else if (report.topTrigger && sp.dominantEmotion === 'neutral') {
      s2 = `${cap(triggerLabel(report.topTrigger))} showed up often, but your responses stayed mostly neutral, suggesting reduced emotional variation.`;
    } else {
      s2 = buildContrastFallback(report, sp);
    }
  } else {
    // Alignment
    if (report.frictionZones?.length) {
      const f = report.frictionZones[0];
      const fVerb = sp.triggerStrength === 'weak' ? 'showed up together' : 'kept showing up together';
      const fNote = sp.triggerStrength === 'weak' ? 'That may be worth watching.' : "That's a pattern worth noticing.";
      s2 = `${cap(triggerLabel(f.trigger))} and feeling ${f.emotion} ${fVerb} (${f.count}×). ${fNote}`;
    } else if (bm?.stateOfMind) {
      const bl = baselineLanguage(report.baselineContext?.driftDirection);
      s2 = `Right now, you're ${bm.stateOfMind}${bl ? ", " + bl : ""}.`;
    } else if (report.volatilityScore !== null) {
      s2 = report.volatilityScore < 0.5
        ? "Emotionally, things have been pretty steady."
        : "There's been some emotional range this week.";
    } else {
      s2 = "No clear shift stood out, which can be a sign of stability.";
    }
  }

  // ── Sentence 3: Context or anchor ──
  let s3;
  if (report.regulators?.length && !s2.includes(triggerLabel(report.regulators[0].trigger))) {
    const r = report.regulators[0];
    if (sp.isFlattening) {
      s3 = `${cap(triggerLabel(r.trigger))} still brought you ${r.emotion}, but it hasn't been enough to shift the overall tone.`;
    } else {
      const rAdv = r.count >= 4 ? 'consistently' : 'generally';
      s3 = `${cap(triggerLabel(r.trigger))} has ${rAdv} left you feeling ${r.emotion}.`;
    }
  } else if (bm?.recoveryLatency) {
    s3 = `When things dip, you tend to ${bm.recoveryLatency.label}.`;
  } else if (bm?.stateOfMind && !s2.includes(bm.stateOfMind)) {
    s3 = `Overall, you're ${bm.stateOfMind}.`;
  } else {
    s3 = report.trajectoryNote && !s2.includes(report.trajectoryNote)
      ? report.trajectoryNote
      : "There's enough data now to start seeing what shapes your week.";
  }

  return `${cap(s1)} ${s2} ${s3}`;
}

function appendTagContext(summary, report) {
  const tagFreq = report.tagFrequency;
  if (!tagFreq || !Object.keys(tagFreq).length) return summary;

  const sorted = Object.entries(tagFreq).sort(([, a], [, b]) => b - a);
  const topTag = sorted[0];
  if (!topTag || topTag[1] < 2) return summary;

  return `${summary} Notably, "${topTag[0]}" came up ${topTag[1]} times across your moments.`;
}

export async function generateInsight(report, opts = {}) {
  const confidence = report.dataQuality?.confidence || "too_early";
  const firstName = opts.firstName || null;
  const lang = opts.lang || "en";
  const hi = lang === "hi";

  let summary;
  switch (confidence) {
    case "too_early":
      summary = hi ? buildTooEarlySummaryHi() : buildTooEarlySummary();
      break;
    case "stale":
      summary = hi ? buildStaleSummaryHi(report, firstName) : buildStaleSummary(report, firstName);
      break;
    case "low":
      summary = hi ? buildLowSummaryHi(report, firstName) : buildLowSummary(report, firstName);
      break;
    case "emerging":
      summary = hi ? buildEmergingSummaryHi(report, firstName) : buildEmergingSummary(report, firstName);
      break;
    case "moderate": {
      if (hi) {
        const sp = buildSignalProfile(report);
        const ranked = rankSignals(report, sp);
        const rel = detectRelationship(ranked);
        summary = buildModerateSummaryHi(report, firstName, sp, ranked, rel, report.baselineMetrics);
      } else {
        summary = buildModerateSummary(report, firstName);
      }
      break;
    }
    default: {
      if (hi) {
        const sp = buildSignalProfile(report);
        const ranked = rankSignals(report, sp);
        const rel = detectRelationship(ranked);
        summary = buildStrongSummaryHi(report, firstName, sp, ranked, rel, report.baselineMetrics);
      } else {
        summary = buildStrongSummary(report, firstName);
      }
    }
  }

  const trigger = report.topTrigger || report.tiedTriggers?.[0] || "work";
  const expPool = hi ? MICRO_EXPERIMENTS_HI : MICRO_EXPERIMENTS;
  const pool = expPool[trigger] || expPool.work;
  const microExperiment = confidence !== "too_early" ? pool[Math.floor(Math.random() * pool.length)] : null;

  // RAG-retrieved context for richer output
  let rag = { interpretations: [], framing: [] };
  try { if (confidence !== "too_early") rag = retrieveForRuleBased(report, 4) || rag; } catch (e) { console.error("[RAG] retrieveForRuleBased failed:", e.message); }
  const topInterpretation = rag.interpretations[0]?.content || null;

  // Build structured fields for the new tab-based UI
  let whatWorking = buildWhatWorking(report);
  let whereToFocus = buildWhereToFocus(report);
  if (hi) {
    whatWorking = buildWhatWorkingHi(whatWorking);
    whereToFocus = buildWhereToFocusHi(whereToFocus);
  }
  const bm = report.baselineMetrics;

  // Structured Mirror output: drivers, behavioral loop, actionable direction
  const drivers = buildDrivers(report);
  const behavioralLoop = buildBehavioralLoop(report);
  let actionableDirection;
  if (hi) {
    const sp = buildSignalProfile(report);
    actionableDirection = buildActionableDirectionHi(report, sp, bm);
  } else {
    actionableDirection = buildActionableDirection(report);
  }

  if (hi) {
    summary = appendTagContextHi(summary, report);
  } else {
    summary = lintText(appendTagContext(summary, report));
  }

  return {
    summary: hi ? summary : lintText(summary),
    microExperiment,
    whatWorking: whatWorking?.map(item => ({ ...item, text: hi ? item.text : lintText(item.text) })) || null,
    whereToFocus: whereToFocus?.map(item => ({ ...item, text: hi ? item.text : lintText(item.text) })) || null,
    stateOfMind: bm?.stateOfMind || null,
    baselineSummary: hi
      ? baselineSummaryHi(bm)
      : (bm?.baseline?.reliable
        ? `Your emotional baseline sits around ${bm.baseline.label}. ${bm.drift ? `This week you're ${bm.drift.label} compared to your norm.` : ""}`
        : null),
    drivers,
    behavioralLoop,
    actionableDirection: actionableDirection ? (hi ? actionableDirection : lintText(actionableDirection)) : null,
    patternContext: topInterpretation,
    confidence,
    model: "rule-based-v4",
    generatedAt: new Date().toISOString(),
  };
}

function buildWhatWorking(report) {
  const m = report.mirror || report;
  const items = [];
  for (const r of (m.regulators || []).slice(0, 3)) {
    items.push({
      text: `${cap(triggerLabel(r.trigger))} tends to leave you feeling ${r.emotion}`,
      trigger: r.trigger,
      emotion: r.emotion,
      count: r.count,
    });
  }
  if (report.volatilityScore !== null && report.volatilityScore < 0.5) {
    const spWw = buildSignalProfile(report);
    // Only celebrate steadiness when emotional tone is at least neutral-positive
    const avgScore = emotionAvgScore(report.emotionFrequency || {});
    if (!spWw.isFlattening && avgScore >= 3.0) {
      items.push({ text: "Your emotions have been pretty steady this week" });
    }
  }
  const bm = report.baselineMetrics;
  if (bm?.stability?.score >= 0.7) {
    const spStab = buildSignalProfile(report);
    if (!spStab.isFlattening) {
      items.push({ text: "You're consistently hovering near your emotional baseline. That's great stability" });
    }
  }
  // Vacuum stability as a positive signal
  const spVac = buildSignalProfile(report);
  if (spVac.vacuumDrift === 'positive') {
    items.push({ text: "Your underlying emotional state is trending above your baseline, even beyond what individual triggers explain" });
  }
  return items.length > 0 ? items : null;
}

function buildWhereToFocus(report) {
  const m = report.mirror || report;
  const items = [];
  const spWf = buildSignalProfile(report);
  // Use longitudinal (mirror) friction zones for pattern-level items
  for (const f of (m.frictionZones || []).slice(0, 3)) {
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
    const driftText = spWf.drift === 'slight_negative'
      ? "There's been a subtle dip below your usual emotional baseline"
      : "Your emotional tone has dipped below your usual baseline this week";
    items.push({ text: driftText });
  }
  if (spWf.isFlattening) {
    items.push({ text: "Your emotional range has been narrowing toward neutral, with less variation day to day" });
  }
  if (bm?.recoveryLatency?.days > 3) {
    items.push({ text: "It's been taking a few days to bounce back after tough spots" });
  }
  // Invoked metrics: masking, false recovery, crash risk, contamination
  if (spWf.maskingLevel === 'high' || spWf.maskingLevel === 'moderate') {
    items.push({ text: "Your behavioral patterns suggest more is going on than your reported emotions show" });
  }
  if (spWf.falseRecovery) {
    items.push({ text: "Your scores look like they've returned to normal, but underlying signals suggest the recovery may not be complete" });
  }
  if (spWf.crashRisk) {
    items.push({ text: "Things look steady on the surface, but some deeper signals are diverging - worth paying attention to" });
  }
  if (spWf.residueContamination) {
    items.push({ text: "Emotions from one part of your day seem to be carrying over into unrelated contexts" });
  }
  return items.length > 0 ? items : null;
}

function buildDrivers(report) {
  const m = report.mirror || report;
  const triggers = Object.entries(m.triggerFrequency || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (!triggers.length) return null;
  return triggers.map(([trigger, count]) => {
    const friction = (m.frictionZones || []).find(f => f.trigger === trigger);
    const regulator = (m.regulators || []).find(r => r.trigger === trigger);
    return {
      trigger,
      count,
      effect: regulator ? "regulator" : friction ? "friction" : "neutral",
      emotion: regulator?.emotion || friction?.emotion || null,
    };
  });
}

function buildBehavioralLoop(report) {
  const m = report.mirror || report;
  const friction = m.frictionZones?.[0];
  const regulator = m.regulators?.[0];
  if (!friction && !regulator) return null;

  const loops = [];
  if (friction) {
    const bm = report.baselineMetrics;
    loops.push({
      type: "friction",
      trigger: friction.trigger,
      emotion: friction.emotion,
      recovery: bm?.recoveryLatency?.label || null,
      count: friction.count,
    });
  }
  if (regulator) {
    loops.push({
      type: "regulator",
      trigger: regulator.trigger,
      emotion: regulator.emotion,
      recovery: null,
      count: regulator.count,
    });
  }
  return loops;
}

function buildActionableDirection(report) {
  const sp = buildSignalProfile(report);
  const bm = report.baselineMetrics;

  // RAG-informed base directions
  let ragIntervention = null;
  try { ragIntervention = retrieveIntervention(report); } catch (e) { console.error("[RAG] retrieveIntervention failed:", e.message); }

  if (sp.crashRisk) return ragIntervention || "Your surface metrics look stable but deeper signals are diverging. Prioritize rest and check in with yourself.";
  if (sp.falseRecovery) return ragIntervention || "Your scores bounced back but the underlying pattern hasn't resolved. Ease back into demanding situations gradually.";
  if (sp.maskingLevel === "high") return ragIntervention || "There's more going on than your logged emotions suggest. Try logging more freely without filtering.";
  const m = report.mirror || report;
  if (bm?.drift?.direction === "declining") return ragIntervention || `Your baseline has been dipping. Lean into what helps: ${m.regulators?.[0] ? triggerLabel(m.regulators[0].trigger) : "your regulators"}.`;
  if (sp.isFlattening) return ragIntervention || "Your emotional range is narrowing. Try something outside your routine to see what shifts.";
  if (m.regulators?.length && bm?.stability?.score >= 0.6) return `Things are steady. Keep ${triggerLabel(m.regulators[0].trigger)} in your week.`;
  return ragIntervention || null;
}
