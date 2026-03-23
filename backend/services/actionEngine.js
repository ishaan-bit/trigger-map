/**
 * Action Engine — Rule-based behavioural action generation
 * ─────────────────────────────────────────────────────────
 * Generates 3-5 contextual actions from the weekly report.
 * Each action is a concrete, small step the user can try or skip.
 * Feedback is stored via the HiTL loop (/api/actions POST).
 */

const ACTION_META = {
  regulate:   { icon: "🌿", category: "Try this" },
  awareness:  { icon: "👁️", category: "Notice" },
  experiment: { icon: "🧪", category: "Experiment" },
};

export function generateActions(report) {
  if (!report || report.totalMoments < 3) return [];

  const actions = [];
  const friction = report.frictionZones || [];
  const regulators = report.regulators || [];
  const drift = report.baselineMetrics?.drift;
  const deltas = report.weeklyDeltas;

  // 1. Friction + Regulator pairing: suggest a known regulator for the top friction zone
  if (friction.length && regulators.length) {
    const f = friction[0];
    const r = regulators[0];
    actions.push({
      id: `reg-${f.trigger}-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
      type: "regulate",
      title: `Try ${r.trigger} when ${f.trigger} gets tough`,
      reason: `${f.trigger} often leads to ${f.emotion}. ${r.trigger} has been helping you feel ${r.emotion}.`,
      trigger: f.trigger,
      emotion: f.emotion,
    });
  }

  // 2. Repeated friction without a counter
  if (friction.length >= 2) {
    const f2 = friction[1];
    actions.push({
      id: `friction-${f2.trigger}-${f2.emotion}`.toLowerCase().replace(/\s+/g, "-"),
      type: "awareness",
      title: `Notice when ${f2.trigger} leads to ${f2.emotion}`,
      reason: `This pairing appeared ${f2.count} times. Awareness is the first step.`,
      trigger: f2.trigger,
      emotion: f2.emotion,
    });
  }

  // 3. Drift-based action: if emotional tone is declining
  if (drift?.direction === "declining") {
    actions.push({
      id: "drift-check-in",
      type: "awareness",
      title: "Check in with how you're feeling",
      reason: "Your emotional tone dipped below your baseline this week. A brief pause can help.",
    });
  }

  // 4. Rising trigger: if a trigger spiked compared to last week
  if (deltas?.triggerDeltas) {
    const rising = Object.entries(deltas.triggerDeltas)
      .filter(([, d]) => d.delta >= 2)
      .sort((a, b) => b[1].delta - a[1].delta);
    if (rising.length) {
      const [trigger, d] = rising[0];
      actions.push({
        id: `rising-${trigger}`.toLowerCase().replace(/\s+/g, "-"),
        type: "awareness",
        title: `${trigger} is showing up more`,
        reason: `Appeared ${d.delta} more times than last week. Worth paying attention.`,
        trigger,
      });
    }
  }

  // 5. Stability reinforcement: protect what's working
  if (regulators.length >= 2 && drift?.direction !== "declining") {
    const r = regulators[0];
    actions.push({
      id: `reinforce-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
      type: "regulate",
      title: `Keep ${r.trigger} in your week`,
      reason: `It consistently leads to ${r.emotion}. Protecting what works matters.`,
      trigger: r.trigger,
      emotion: r.emotion,
    });
  }

  // ── Fallback strategies ────────────────────────────────
  // When the 5 primary strategies produce nothing (e.g. data is spread
  // thin or emotions are mostly neutral), use always-available fields.

  const topPair = report.topPair;
  const topTrigger = report.topTrigger;
  const topEmotion = report.topEmotion;
  const triggerFreq = report.triggerFrequency || {};
  const dq = report.dataQuality || {};

  // 6. Top-pair awareness: surface the most common pairing even if
  //    it doesn't meet friction/regulator thresholds
  if (!actions.length && topPair?.trigger && topPair?.emotion) {
    actions.push({
      id: `pair-${topPair.trigger}-${topPair.emotion}`.toLowerCase().replace(/\s+/g, "-"),
      type: "awareness",
      title: `Notice when ${topPair.trigger} leads to ${topPair.emotion}`,
      reason: `This pairing appeared ${topPair.count} time${topPair.count === 1 ? "" : "s"} this week. Your most common combo.`,
      trigger: topPair.trigger,
      emotion: topPair.emotion,
    });
  }

  // 7. Dominant trigger check-in
  if (actions.length < 2 && topTrigger) {
    const already = actions.some((a) => a.id?.includes(topTrigger.toLowerCase().replace(/\s+/g, "-")));
    if (!already) {
      actions.push({
        id: `top-trigger-${topTrigger}`.toLowerCase().replace(/\s+/g, "-"),
        type: "awareness",
        title: `Pay attention to ${topTrigger}`,
        reason: `It's your top trigger this week. Notice how it makes you feel each time.`,
        trigger: topTrigger,
      });
    }
  }

  // 8. Variety experiment: if few unique triggers, encourage exploration
  if (actions.length < 3 && dq.uniqueTriggers && dq.uniqueTriggers <= 3) {
    actions.push({
      id: "explore-triggers",
      type: "experiment",
      title: "Try logging a new trigger",
      reason: `You've logged ${dq.uniqueTriggers} different trigger${dq.uniqueTriggers === 1 ? "" : "s"} so far. Broadening your map reveals more patterns.`,
    });
  }

  // 9. Logging consistency: if < 4 days logged, encourage regularity
  if (actions.length < 3 && dq.daysLogged && dq.daysLogged < 4) {
    actions.push({
      id: "log-consistency",
      type: "experiment",
      title: "Log at a different time of day",
      reason: `You've logged on ${dq.daysLogged} day${dq.daysLogged === 1 ? "" : "s"}. More days give sharper patterns.`,
    });
  }

  return actions.slice(0, 5).map((a, i) => ({
    ...a,
    ...(ACTION_META[a.type] || ACTION_META.awareness),
    order: i,
  }));
}
