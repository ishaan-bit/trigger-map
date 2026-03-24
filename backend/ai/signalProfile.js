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

  return {
    volatility,
    drift: driftLevel,
    dominantEmotion: report.topEmotion || null,
    triggerStrength,
    intensity,
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
  } else if (profile.drift === 'neutral') {
    lines.push('Drift: stable. Do not suggest things are getting worse.');
  } else if (profile.drift === 'positive') {
    lines.push('Drift: positive. Reflect improvement genuinely.');
  }

  if (profile.intensity === 'subtle') {
    lines.push('CONSTRAINT: Subtle signal profile. Be observational, not diagnostic. Describe what is present without exaggeration. Reflect uncertainty. Avoid strong causal claims.');
  }

  return lines.join('\n');
}
