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
  if (!report || !report.totalMoments) return [];

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
      title: `Notice when ${f2.trigger} brings ${f2.emotion}`,
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

  return actions.slice(0, 5).map((a, i) => ({
    ...a,
    ...(ACTION_META[a.type] || ACTION_META.awareness),
    order: i,
  }));
}
