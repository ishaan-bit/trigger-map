/**
 * triggerCopy — framework-free mapping from the semantic signal model to
 * localized strings. Kept separate from the RN view so the copy logic (which
 * decides what sentence a user actually reads) is unit-testable in isolation.
 *
 * Every function takes a `t(key, vars)` translator and returns ready-to-render
 * strings. No React/RN imports here.
 */

export function triggerName(key, t) {
  const m = t("triggers." + key);
  const v = m && m !== "triggers." + key ? m : key;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function emotionName(key, t) {
  const m = t("emotions." + key);
  return m && m !== "emotions." + key ? m : key;
}

/** Headline title + body from the signal's state. */
export function buildHeadline(signal, t) {
  const { state } = signal;
  const lead = signal.connected?.friction?.[0];
  const base = "triggerMap.headline.";

  // First log — a real, personal reflection (never inferring repetition/cause).
  if (state === "reflection") {
    const s = signal.seed?.lead || {};
    return {
      title: t(base + "reflection.title"),
      body:
        s.trigger && s.emotion
          ? t(base + "reflection.body", { trigger: triggerName(s.trigger, t), emotion: emotionName(s.emotion, t) })
          : t(base + "reflection.bodyNoLead"),
    };
  }

  // Second log — a careful, provisional comparison. Echo ≠ pattern.
  if (state === "thread") {
    const seed = signal.seed || {};
    if (!seed.echo) {
      return { title: t(base + "threadForming.title"), body: t(base + "threadForming.body") };
    }
    const trig = seed.repeatedTrigger ? triggerName(seed.repeatedTrigger, t) : null;
    const emo = seed.repeatedEmotion ? emotionName(seed.repeatedEmotion, t) : null;
    let body;
    if (trig && emo) body = t(base + "thread.bodyBoth", { trigger: trig, emotion: emo });
    else if (trig) body = t(base + "thread.bodyTrigger", { trigger: trig });
    else if (emo) body = t(base + "thread.bodyEmotion", { emotion: emo });
    else body = t(base + "threadForming.body");
    return { title: t(base + "thread.title"), body };
  }

  if (state === "pattern") {
    if (lead) {
      return {
        title: t(base + "pattern.title"),
        body: t(base + "pattern.body", {
          trigger: triggerName(lead.trigger, t),
          emotion: emotionName(lead.emotion, t),
        }),
      };
    }
    return { title: t(base + "pattern.title"), body: t(base + "patternNoLead") };
  }
  const key = signal.meta?.pending && state === "forming" ? "formingPending" : state;
  return { title: t(base + key + ".title"), body: t(base + key + ".body") };
}

/** Body line for the dormant/welcome-back state (days-aware). */
export function dormantBody(signal, t) {
  if (signal.meta?.silenceDays) {
    return t("triggerMap.headline.dormant.bodyDays", { days: signal.meta.silenceDays });
  }
  return t("triggerMap.headline.dormant.body");
}

/** Confidence chip label from confidence + data sufficiency. */
export function confidenceLabel(signal, t) {
  const b = "triggerMap.confidence.";
  // Early states get encouraging, honest labels — not a "not enough" gate.
  if (signal.state === "reflection") return t(b + "firstReflection");
  if (signal.state === "thread") return t(b + "possibleThread");
  if (signal.state === "seeding" || signal.barometer?.enoughData === false) return t(b + "insufficient");
  switch (signal.confidence) {
    case "low":
    case "emerging":
      return t(b + "emerging");
    case "moderate":
      return t(b + "observed");
    case "strong":
      return t(b + "established");
    default:
      return t(b + "forming");
  }
}

/** Plain-language barometer drivers (≤3), de-duplicated. */
export function buildDrivers(signal, t) {
  const b = "triggerMap.barometer.drivers.";
  const out = [];
  const seen = new Set();
  const push = (key, vars) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t(b + key, vars));
  };
  for (const c of signal.barometer?.concerns || []) {
    if (c === "crashRisk") push("crashRisk");
    else if (c === "falseRecovery") push("falseRecovery");
    else if (c === "masking" || c === "maskingMild") push("masking");
    else if (c === "driftDeclining") push("driftDeclining");
    else if (c === "vacuumDrift") push("vacuumDrift");
    else if (c === "negativeStreak") push("negativeStreak", { days: signal.barometer.negDays || 2 });
  }
  for (const s of signal.barometer?.stabilizers || []) {
    if (s === "driftImproving") push("driftImproving");
    else if (s === "positiveStreak") push("positiveStreak", { days: signal.barometer.posDays || 2 });
    else if (s === "lowVolatility") push("lowVolatility");
  }
  return out.slice(0, 3);
}

/** "What's changed" lines (≤3). */
export function buildChanges(signal, t) {
  const b = "triggerMap.changes.";
  return (signal.changes || [])
    .map((c) => {
      if (c.kind === "triggerDelta") {
        const trig = triggerName(c.trigger, t);
        return c.delta > 0
          ? t(b + "triggerUp", { trigger: trig, delta: Math.abs(c.delta) })
          : t(b + "triggerDown", { trigger: trig, delta: Math.abs(c.delta) });
      }
      if (c.kind === "emotionDelta") {
        const emo = emotionName(c.emotion, t);
        return c.delta > 0
          ? t(b + "emotionUp", { emotion: emo, delta: Math.abs(c.delta) })
          : t(b + "emotionDown", { emotion: emo, delta: Math.abs(c.delta) });
      }
      if (c.kind === "newPattern") {
        return t(b + "newPattern", { trigger: triggerName(c.trigger, t), emotion: emotionName(c.emotion, t) });
      }
      if (c.kind === "text") return c.text;
      return null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

/** "Worth noticing" lines. */
export function buildWatch(signal, t) {
  const b = "triggerMap.watch.";
  return (signal.watch || [])
    .map((w) => {
      if (w.kind === "emergingPair") {
        return t(b + "emergingPair", { trigger: triggerName(w.trigger, t), emotion: emotionName(w.emotion, t) });
      }
      if (w.kind === "carryOver") {
        return t(b + "carryOver", { source: triggerName(w.source, t), target: triggerName(w.target, t) });
      }
      return null;
    })
    .filter(Boolean);
}
