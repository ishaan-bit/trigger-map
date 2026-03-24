/**
 * Signal Profile — classifies the intensity of detected patterns.
 *
 * Used to constrain language in both rule-based and LLM insights.
 * This is a CLASSIFIER over existing signals, not new detection logic.
 * It does not modify upstream detection — it reads the report and
 * produces a classification that downstream generators use to
 * calibrate their language.
 */

export function buildSignalProfile(report) {
  const vs = report.volatilityScore;
  const drift = report.baselineMetrics?.drift;
  const friction = report.frictionZones || [];
  const regulators = report.regulators || [];

  // Volatility: how much emotional range this week
  let volatility;
  if (vs == null || vs < 0.3) volatility = 'low';
  else if (vs < 0.8) volatility = 'moderate';
  else volatility = 'high';

  // Drift: direction relative to baseline
  let driftLevel;
  if (!drift) driftLevel = 'neutral';
  else if (drift.value > 0.15) driftLevel = 'positive';
  else if (drift.value >= -0.15) driftLevel = 'neutral';
  else if (drift.value >= -0.4) driftLevel = 'slight_negative';
  else driftLevel = 'strong_negative';

  // Trigger strength: how clear are trigger-emotion patterns
  const pairingCount = friction.length + regulators.length;
  const maxCount = Math.max(
    0,
    ...friction.map(f => f.count || 0),
    ...regulators.map(r => r.count || 0),
  );
  let triggerStrength;
  if (pairingCount === 0) triggerStrength = 'none';
  else if (pairingCount <= 1 && maxCount <= 2) triggerStrength = 'weak';
  else if (maxCount >= 4 && pairingCount >= 3) triggerStrength = 'strong';
  else triggerStrength = 'moderate';

  // Overall intensity
  const isSubtle = volatility === 'low'
    && (driftLevel === 'neutral' || driftLevel === 'slight_negative')
    && triggerStrength !== 'strong';
  const isStrong = volatility === 'high'
    || driftLevel === 'strong_negative'
    || triggerStrength === 'strong';
  const intensity = isStrong ? 'strong' : isSubtle ? 'subtle' : 'moderate';

  // Within-week trajectory slope: use last 7 entries (this week's window)
  const traj = report.weeklyEmotionTrajectory || [];
  let weeklySlope = 'flat';
  if (traj.length >= 3) {
    const recent = traj.slice(-7);
    const diff = recent[recent.length - 1].score - recent[0].score;
    if (diff <= -0.8) weeklySlope = 'declining';
    else if (diff <= -0.3) weeklySlope = 'slight_decline';
    else if (diff >= 0.8) weeklySlope = 'rising';
    else if (diff >= 0.3) weeklySlope = 'slight_rise';
  }

  // Flattening: neutral-dominant + low volatility + (within-week decline OR perpetual flatness)
  const emotionFreq = report.emotionFrequency || {};
  const totalEmotions = Object.values(emotionFreq).reduce((s, v) => s + v, 0);
  const neutralRatio = (emotionFreq.neutral || 0) / (totalEmotions || 1);
  const isFlattening = volatility === 'low'
    && neutralRatio >= 0.4
    && (weeklySlope === 'declining' || weeklySlope === 'slight_decline'
        || driftLevel === 'slight_negative'
        || neutralRatio >= 0.65);

  return {
    volatility,
    drift: driftLevel,
    dominantEmotion: report.topEmotion || null,
    triggerStrength,
    intensity,
    weeklySlope,
    isFlattening,
  };
}

/**
 * Build constraint text for LLM prompts based on signal profile.
 */
export function buildSignalConstraints(profile) {
  const lines = [];

  lines.push(`SIGNAL PROFILE: ${profile.intensity} intensity.`);

  if (profile.volatility === 'low') {
    lines.push('Volatility: low. Avoid "spikes", "sharp changes", "intense", "volatile". Prefer "steady", "consistent", "subtle".');
  } else if (profile.volatility === 'high') {
    lines.push('Volatility: high. Emotional range was significant this week.');
  }

  if (profile.triggerStrength === 'none' || profile.triggerStrength === 'weak') {
    lines.push('Trigger patterns: weak or absent. Do NOT invent causes (deadlines, meetings, workload). Describe what was logged without inferring why.');
  }

  if (profile.dominantEmotion === 'neutral') {
    lines.push('Dominant emotion: neutral. Describe evenness or reduced emotional range. Do NOT label as stress or anxiety unless data shows it.');
  }

  if (profile.drift === 'slight_negative') {
    lines.push('Drift: slight negative. Use "subtle decline", "slight dip". Avoid "drop", "worsening", "significantly declining".');
  } else if (profile.drift === 'strong_negative') {
    lines.push('Drift: strong negative. Emotional tone has fallen meaningfully below baseline. Acknowledge the shift directly but without catastrophizing.');
  } else if (profile.drift === 'neutral') {
    lines.push('Drift: stable. Do not suggest things are getting worse.');
  } else if (profile.drift === 'positive') {
    lines.push('Drift: positive. Reflect improvement genuinely.');
  }

  if (profile.intensity === 'subtle') {
    lines.push('CONSTRAINT: Subtle signal profile. Be observational, not diagnostic. Describe what is present without exaggeration. Reflect uncertainty. Avoid strong causal claims.');
  }

  if (profile.isFlattening) {
    lines.push('FLATTENING DETECTED: Emotional range is narrowing toward neutral. Describe reduced emotional responsiveness, not positive stability. Frame neutral-dominance as a subtle shift worth watching, not as steadiness.');
  }

  if (profile.weeklySlope === 'slight_decline' || profile.weeklySlope === 'declining') {
    lines.push(`Within-week trajectory: ${profile.weeklySlope === 'declining' ? 'declining' : 'slight decline'}. Emotional tone dropped from start of week to end. Acknowledge this within-week shift.`);
  }

  return lines.join('\n');
}

// ── Signal Ranking ───────────────────────────────────────────────────────────
//
// Ranks available signals by importance, selects PRIMARY + SECONDARY,
// and detects whether they form a CONTRAST or ALIGNMENT relationship.
// Consumed by summary builders to structure the 3-sentence output.

/**
 * Rank signals by importance and select the top two.
 * Returns { primary, secondary, anchor } where each is
 * { type, label, weight } or null.
 */
export function rankSignals(report, sp) {
  const bm = report.baselineMetrics;
  const signals = [];

  // Dominant emotion — always high weight
  if (report.topEmotion) {
    const isNeutral = report.topEmotion === 'neutral';
    signals.push({
      type: 'dominantEmotion',
      label: report.topEmotion,
      weight: isNeutral ? 3 : 4,
      valence: isNeutral ? 'flat' : (['calm', 'energized'].includes(report.topEmotion) ? 'positive' : 'negative'),
    });
  }

  // Drift — high weight when present and non-neutral
  if (sp.drift !== 'neutral') {
    const w = sp.drift === 'strong_negative' ? 5 : sp.drift === 'slight_negative' ? 4 : 3;
    signals.push({
      type: 'drift',
      label: sp.drift,
      weight: w,
      valence: sp.drift === 'positive' ? 'positive' : 'negative',
    });
  }

  // Volatility — medium weight
  if (sp.volatility !== 'low') {
    signals.push({
      type: 'volatility',
      label: sp.volatility,
      weight: sp.volatility === 'high' ? 3 : 2,
      valence: sp.volatility === 'high' ? 'negative' : 'mixed',
    });
  } else {
    signals.push({
      type: 'volatility',
      label: 'low',
      weight: 2,
      valence: 'stable',
    });
  }

  // Top trigger — medium weight
  if (report.topTrigger) {
    signals.push({
      type: 'trigger',
      label: report.topTrigger,
      weight: 2,
      valence: 'mixed',
    });
  }

  // Top friction zone — medium-high weight
  if (report.frictionZones?.length) {
    const f = report.frictionZones[0];
    signals.push({
      type: 'friction',
      label: `${f.trigger}+${f.emotion}`,
      weight: f.count >= 3 ? 3 : 2,
      valence: 'negative',
      data: f,
    });
  }

  // Top regulator / anchor — medium weight
  if (report.regulators?.length) {
    const r = report.regulators[0];
    signals.push({
      type: 'anchor',
      label: `${r.trigger}+${r.emotion}`,
      weight: r.count >= 3 ? 3 : 2,
      valence: 'positive',
      data: r,
    });
  }

  // Recovery latency — low weight
  if (bm?.recoveryLatency) {
    signals.push({
      type: 'recovery',
      label: bm.recoveryLatency.label,
      weight: 1,
      valence: bm.recoveryLatency.days <= 2 ? 'positive' : 'negative',
    });
  }

  // Within-week trajectory decline
  if (sp.weeklySlope === 'declining' || sp.weeklySlope === 'slight_decline') {
    signals.push({
      type: 'weeklyDecline',
      label: sp.weeklySlope,
      weight: sp.weeklySlope === 'declining' ? 4 : 3,
      valence: 'negative',
    });
  }

  // Sort by weight descending
  signals.sort((a, b) => b.weight - a.weight);

  const primary = signals[0] || null;
  // Secondary must be different type than primary
  const secondary = signals.find(s => s !== primary && s.type !== primary?.type) || null;
  // Anchor: prefer a regulator if not already primary/secondary
  const anchor = signals.find(s => s.type === 'anchor' && s !== primary && s !== secondary)
    || signals.find(s => s.valence === 'positive' && s !== primary && s !== secondary)
    || null;

  return { primary, secondary, anchor, all: signals };
}

/**
 * Detect whether primary and secondary signals form a CONTRAST
 * or an ALIGNMENT. Returns 'contrast' | 'alignment'.
 */
export function detectRelationship(ranked) {
  const { primary, secondary } = ranked;
  if (!primary || !secondary) return 'alignment';

  // Contrast: signals point in different directions
  const valences = [primary.valence, secondary.valence];
  const hasPositive = valences.some(v => v === 'positive' || v === 'stable');
  const hasNegative = valences.some(v => v === 'negative');
  const hasFlat = valences.some(v => v === 'flat');

  // stable/positive + negative = contrast
  if (hasPositive && hasNegative) return 'contrast';
  // flat + negative = contrast (neutral but drifting)
  if (hasFlat && hasNegative) return 'contrast';
  // stable + flat is alignment (both point to evenness)
  return 'alignment';
}
