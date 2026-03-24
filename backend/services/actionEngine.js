/**
 * Action Engine — Rule-based behavioural action generation
 * ─────────────────────────────────────────────────────────
 * Generates 3-5 contextual actions from the weekly report.
 * Each action is a concrete, small step the user can try or skip.
 * Feedback is stored via the HiTL loop (/api/actions POST).
 *
 * Now feedback-aware: accepts prior HiTL feedback + action prefs
 * to filter out tried/skipped items and bias toward liked patterns.
 */

import { lintText, triggerLabel, cap } from "../utils/textGrammar.js";

const ACTION_META = {
  regulate:   { icon: "🌿", category: "Try this" },
  awareness:  { icon: "👁️", category: "Notice" },
  experiment: { icon: "🧪", category: "Experiment" },
};

/**
 * Build set of action IDs the user has already responded to.
 * These should not appear again in the generated list.
 */
function buildFeedbackIndex(feedback) {
  const tried = new Set();
  const skipped = new Set();
  for (const entry of feedback || []) {
    if (entry.response === "tried") tried.add(entry.actionId);
    if (entry.response === "skipped") skipped.add(entry.actionId);
  }
  return { tried, skipped, all: new Set([...tried, ...skipped]) };
}

/**
 * @param {object}  report   - Full weekly report from patternEngine
 * @param {Array}   feedback - HiTL feedback entries [{actionId, response, timestamp}]
 * @param {object?} prefs    - Stored action prefs (likedTriggers, dislikedApproaches, llmActions)
 */
export function generateActions(report, feedback = [], prefs = null) {
  if (!report || report.totalMoments < 3) return [];

  const fb = buildFeedbackIndex(feedback);

  // If LLM actions exist in prefs, use them as the primary source.
  // Filter out any that the user already tried/skipped.
  if (prefs?.llmActions?.length) {
    const fresh = prefs.llmActions.filter(a => !fb.all.has(a.id));
    if (fresh.length >= 3) {
      return fresh.slice(0, 4).map((a, i) => ({
        ...a,
        title: lintText(a.title),
        reason: lintText(a.reason),
        ...(ACTION_META[a.type] || ACTION_META.awareness),
        order: i,
      }));
    }
    // If some LLM actions remain, use them as seeds and fill with rule-based
  }

  const candidates = [];
  const friction = report.frictionZones || [];
  const regulators = report.regulators || [];
  const drift = report.baselineMetrics?.drift;
  const deltas = report.weeklyDeltas;
  const likedTriggers = new Set(prefs?.likedTriggers || []);

  // 1. Friction + Regulator pairing
  if (friction.length && regulators.length) {
    const f = friction[0];
    const r = regulators[0];
    candidates.push({
      id: `reg-${f.trigger}-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
      type: "regulate",
      title: `Try ${triggerLabel(r.trigger)} when ${triggerLabel(f.trigger)} gets tough`,
      reason: `${cap(triggerLabel(f.trigger))} often leaves you feeling ${f.emotion}. ${cap(triggerLabel(r.trigger))} has been helping you feel ${r.emotion}.`,
      trigger: f.trigger,
      emotion: f.emotion,
    });
  }

  // 2. Repeated friction without a counter
  if (friction.length >= 2) {
    const f2 = friction[1];
    candidates.push({
      id: `friction-${f2.trigger}-${f2.emotion}`.toLowerCase().replace(/\s+/g, "-"),
      type: "awareness",
      title: `Notice when ${triggerLabel(f2.trigger)} leaves you feeling ${f2.emotion}`,
      reason: `This pairing appeared ${f2.count} times. Awareness is the first step.`,
      trigger: f2.trigger,
      emotion: f2.emotion,
    });
  }

  // 3. Drift-based action
  if (drift?.direction === "declining") {
    candidates.push({
      id: "drift-check-in",
      type: "awareness",
      title: "Check in with how you're feeling",
      reason: "Your emotional tone dipped below your baseline this week. A brief pause can help.",
    });
  }

  // 4. Rising trigger
  if (deltas?.triggerDeltas) {
    const rising = Object.entries(deltas.triggerDeltas)
      .filter(([, d]) => d.delta >= 2)
      .sort((a, b) => b[1].delta - a[1].delta);
    if (rising.length) {
      const [trigger, d] = rising[0];
      candidates.push({
        id: `rising-${trigger}`.toLowerCase().replace(/\s+/g, "-"),
        type: "awareness",
        title: `${cap(triggerLabel(trigger))} is showing up more`,
        reason: `Appeared ${d.delta} more times than last week. Worth paying attention.`,
        trigger,
      });
    }
  }

  // 5. Stability reinforcement
  if (regulators.length >= 2 && drift?.direction !== "declining") {
    const r = regulators[0];
    candidates.push({
      id: `reinforce-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
      type: "regulate",
      title: `Keep ${triggerLabel(r.trigger)} in your week`,
      reason: `It consistently leaves you feeling ${r.emotion}. Protecting what works matters.`,
      trigger: r.trigger,
      emotion: r.emotion,
    });
  }

  // 5b. Liked-trigger reinforcement: if user previously "tried" an action
  // involving a specific trigger, generate a follow-up for that trigger
  if (likedTriggers.size > 0 && regulators.length) {
    for (const r of regulators) {
      if (likedTriggers.has(r.trigger) && !candidates.some(c => c.id?.includes(r.trigger))) {
        candidates.push({
          id: `liked-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
          type: "regulate",
          title: `Build on ${triggerLabel(r.trigger)} — it's been working for you`,
          reason: `You engaged with ${triggerLabel(r.trigger)} last time and it helped. Keep the momentum.`,
          trigger: r.trigger,
          emotion: r.emotion,
        });
        break;
      }
    }
  }

  // ── Fallback strategies ────────────────────────────────

  const topPair = report.topPair;
  const topTrigger = report.topTrigger;
  const dq = report.dataQuality || {};

  // 6. Top-pair awareness
  if (!candidates.length && topPair?.trigger && topPair?.emotion) {
    candidates.push({
      id: `pair-${topPair.trigger}-${topPair.emotion}`.toLowerCase().replace(/\s+/g, "-"),
      type: "awareness",
      title: `Notice when ${triggerLabel(topPair.trigger)} leaves you feeling ${topPair.emotion}`,
      reason: `This pairing appeared ${topPair.count} time${topPair.count === 1 ? "" : "s"} this week. Your most common combo.`,
      trigger: topPair.trigger,
      emotion: topPair.emotion,
    });
  }

  // 7. Dominant trigger check-in
  if (candidates.length < 3 && topTrigger) {
    const id = `top-trigger-${topTrigger}`.toLowerCase().replace(/\s+/g, "-");
    if (!candidates.some((a) => a.id === id)) {
      candidates.push({
        id,
        type: "awareness",
        title: `Pay attention to ${triggerLabel(topTrigger)}`,
        reason: `It's your top trigger this week. Notice how it makes you feel each time.`,
        trigger: topTrigger,
      });
    }
  }

  // 8. Variety experiment
  if (candidates.length < 3 && dq.uniqueTriggers && dq.uniqueTriggers <= 3) {
    candidates.push({
      id: "explore-triggers",
      type: "experiment",
      title: "Try logging a new trigger",
      reason: `You've logged ${dq.uniqueTriggers} different trigger${dq.uniqueTriggers === 1 ? "" : "s"} so far. Broadening your map reveals more patterns.`,
    });
  }

  // 9. Logging consistency
  if (candidates.length < 3 && dq.daysLogged && dq.daysLogged < 4) {
    candidates.push({
      id: "log-consistency",
      type: "experiment",
      title: "Log at a different time of day",
      reason: `You've logged on ${dq.daysLogged} day${dq.daysLogged === 1 ? "" : "s"}. More days give sharper patterns.`,
    });
  }

  // 10. Top emotion reflection (new fallback for minimum 3)
  if (candidates.length < 3 && report.topEmotion) {
    candidates.push({
      id: `emotion-reflect-${report.topEmotion}`.toLowerCase(),
      type: "awareness",
      title: `Reflect on why ${report.topEmotion} shows up most`,
      reason: `Feeling ${report.topEmotion} was your most common emotion. Consider what makes it appear.`,
    });
  }

  // 11. Trigger-emotion pair exploration (ensures we always reach 3)
  if (candidates.length < 3) {
    // Use pairFrequency if available, otherwise build pairs from friction zones
    let pairs;
    if (report.pairFrequency && Object.keys(report.pairFrequency).length) {
      pairs = Object.entries(report.pairFrequency).sort(([, a], [, b]) => b - a);
    } else {
      pairs = friction.map(f => [`${f.trigger}|${f.emotion}`, f.count]);
    }
    for (const [pairKey, count] of pairs) {
      if (candidates.length >= 3) break;
      const [trigger, emotion] = pairKey.split("|");
      const id = `explore-${trigger}-${emotion}`.toLowerCase().replace(/\s+/g, "-");
      if (!candidates.some(c => c.id === id)) {
        candidates.push({
          id,
          type: "experiment",
          title: `Explore the ${triggerLabel(trigger)} and ${emotion} connection`,
          reason: `This pairing came up ${count} time${count === 1 ? "" : "s"}. Notice what specifically triggers it.`,
          trigger,
          emotion,
        });
      }
    }
  }

  // 12. Ultimate safety net — generic but useful actions to guarantee minimum 3
  if (candidates.length < 3) {
    const fillers = [
      { id: "reflect-week", type: "awareness", title: "Take 2 minutes to reflect on your week", reason: "A short review helps you notice patterns you might miss in the moment." },
      { id: "log-new-trigger", type: "experiment", title: "Log something new that affects your mood", reason: "Expanding what you track reveals hidden patterns." },
      { id: "check-timing", type: "awareness", title: "Notice what time of day your mood shifts", reason: "Timing patterns can reveal environmental triggers." },
    ];
    for (const f of fillers) {
      if (candidates.length >= 3) break;
      if (!candidates.some(c => c.id === f.id)) {
        candidates.push(f);
      }
    }
  }

  // Filter out actions the user has already responded to (tried or skipped)
  let filtered = candidates.filter(a => !fb.all.has(a.id));

  // If filtering removed too many, add back from candidates that aren't exact duplicates
  // (user may have skipped an old version but the data context changed)
  if (filtered.length < 3) {
    const remaining = candidates.filter(a => !filtered.some(f => f.id === a.id));
    for (const c of remaining) {
      if (filtered.length >= 3) break;
      // Don't re-add exact skipped IDs — but allow tried ones to come back as enhanced
      if (!fb.skipped.has(c.id)) {
        filtered.push(c);
      }
    }
  }

  // If LLM prefs have leftover actions that weren't filtered, merge them in
  if (prefs?.llmActions?.length && filtered.length < 4) {
    const llmFresh = prefs.llmActions.filter(a => !fb.all.has(a.id) && !filtered.some(f => f.id === a.id));
    for (const a of llmFresh) {
      if (filtered.length >= 4) break;
      filtered.push(a);
    }
  }

  return filtered.slice(0, 5).map((a, i) => ({
    ...a,
    title: lintText(a.title),
    reason: lintText(a.reason),
    ...(ACTION_META[a.type] || ACTION_META.awareness),
    order: i,
  }));
}
