/**
 * Early-warning signal — gentle, non-diagnostic pattern detection.
 * ────────────────────────────────────────────────────────────────
 * Computed entirely from the user's OWN logged moments (client-available),
 * this surfaces "worth noticing" patterns the way clinicians think about early
 * signs of low mood and anxiety: as patterns SUSTAINED OVER DAYS/WEEKS, never
 * single bad moments, and never a diagnosis.
 *
 * Design grounded in authoritative sources (NIMH, NHS, WHO, DSM-5 concepts,
 * PHQ-2/GAD-2 structure, valence-arousal circumplex + tripartite model):
 *   • Depression-leaning  → low-VALENCE + low-AROUSAL cluster over time, AND the
 *     scarcity of positive (high-valence) moments (anhedonia is the depression-
 *     SPECIFIC marker — the absence of brightness, not just presence of lows).
 *   • Anxiety-leaning     → high-AROUSAL + low-valence recurrence, worry that
 *     clusters on a life domain, and body/health coming up often.
 *   • Withdrawal          → a relative rise in "alone" moments vs the prior window.
 *
 * Everything is gated behind an "enough data + ≥2-week persistence" guard so it
 * never fires for new, sparse, or steady users, and the copy stays tentative.
 *
 * Pure & framework-free. Returns localizable keys + vars; the UI renders calm,
 * person-first language and pairs any low-mood signal with a supportive note.
 */
import { legacyToCoordinates } from "@triggermap/shared/constants/emotions";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Valence/arousal for a moment, with a legacy-emotion fallback. */
function momentVA(m) {
  if (m && typeof m.valence === "number" && typeof m.arousal === "number") {
    return { valence: m.valence, arousal: m.arousal };
  }
  if (m && m.emotion) {
    const c = legacyToCoordinates(m.emotion);
    return { valence: c.valence, arousal: c.arousal };
  }
  return { valence: 0, arousal: 0 };
}

function dayKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeDomain(trigger) {
  const v = String(trigger || "").toLowerCase();
  if (v === "body") return "health";
  if (v === "self") return "alone";
  return v;
}

/**
 * @param {Array} moments  the user's moments (any order); needs valence/arousal
 *                         (or a legacy `emotion`), `trigger`, and `timestamp`.
 * @param {object} [opts]
 * @param {number} [opts.now] epoch ms "now" (injectable for tests / determinism)
 * @returns {{ signals: Array, careNote: boolean, meta: object }}
 */
export function computeEarlySignals(moments, opts = {}) {
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const list = Array.isArray(moments) ? moments : [];

  const within = (m, lo, hi) => {
    const t = new Date(m.timestamp).getTime();
    return !Number.isNaN(t) && now - t >= lo && now - t < hi;
  };

  const win14 = list.filter((m) => within(m, 0, 14 * DAY_MS));
  const prior14 = list.filter((m) => within(m, 14 * DAY_MS, 28 * DAY_MS));
  const win10 = list.filter((m) => within(m, 0, 10 * DAY_MS));

  const loggedDays = new Set(win14.map((m) => dayKey(m.timestamp)).filter(Boolean));
  const totalInWindow = win14.length;

  const empty = { signals: [], careNote: false, meta: { windowDays: 14, loggedDays: loggedDays.size, totalInWindow } };

  // Enough-data + persistence guard. Below this the data can't honestly support a
  // pattern read, so we surface nothing (no false alarms for new/sparse users).
  if (loggedDays.size < 5 || totalInWindow < 6) return empty;

  // ── Classify moments ──
  const isLow = (va) => va.valence < -0.15 && va.arousal < -0.15;        // deactivated negative (depression affect)
  const isPositive = (va) => va.valence > 0.15;                          // brightness
  const isAnxious = (va) => va.valence < -0.15 && va.arousal > 0.15;     // activated negative (anxiety affect)

  const lowDays = new Set();
  let positiveCount = 0;
  for (const m of win14) {
    const va = momentVA(m);
    if (isLow(va)) { const k = dayKey(m.timestamp); if (k) lowDays.add(k); }
    if (isPositive(va)) positiveCount += 1;
  }
  const positiveShare = totalInWindow > 0 ? positiveCount / totalInWindow : 0;

  // Anxiety recurrence over a tighter 10-day window.
  const anxiousDays = new Set();
  const anxiousByDomain = {};
  let anxiousCount = 0;
  for (const m of win10) {
    const va = momentVA(m);
    if (!isAnxious(va)) continue;
    anxiousCount += 1;
    const k = dayKey(m.timestamp);
    if (k) anxiousDays.add(k);
    const dom = normalizeDomain(m.trigger);
    if (dom) anxiousByDomain[dom] = (anxiousByDomain[dom] || 0) + 1;
  }
  const loggedDays10 = new Set(win10.map((m) => dayKey(m.timestamp)).filter(Boolean)).size;

  // Body/health recurrence (sleep folds into health in our domain model).
  const healthDays = new Set();
  for (const m of win14) {
    if (normalizeDomain(m.trigger) === "health") { const k = dayKey(m.timestamp); if (k) healthDays.add(k); }
  }

  // Withdrawal: relative rise in "alone" moments vs the prior 14-day window.
  const aloneShare = (arr) => {
    if (!arr.length) return 0;
    const a = arr.filter((m) => normalizeDomain(m.trigger) === "alone").length;
    return a / arr.length;
  };
  const aloneNow = aloneShare(win14);
  const alonePrior = aloneShare(prior14);

  // ── Build candidate signals (priority order matters; we cap at 2) ──
  const minLowDays = Math.max(4, Math.ceil(0.5 * loggedDays.size));
  const hasPersistentLow = lowDays.size >= minLowDays;
  // Anhedonia is conservative: a real stretch of logging with brightness almost
  // absent. Requires negativity present too, so all-neutral loggers don't trip it.
  const hasAnhedonia = totalInWindow >= 8 && loggedDays.size >= 6 && positiveShare < 0.1 && lowDays.size >= 2;

  const minAnxDays = Math.max(3, Math.ceil(0.4 * Math.max(loggedDays10, 1)));
  const hasAnxious = anxiousDays.size >= minAnxDays && anxiousCount >= 3;

  let topAnxDomain = null;
  if (anxiousCount >= 3) {
    const sorted = Object.entries(anxiousByDomain).sort((a, b) => b[1] - a[1]);
    if (sorted.length && sorted[0][1] / anxiousCount >= 0.6) topAnxDomain = sorted[0][0];
  }

  const hasBodyRecurring = healthDays.size >= 5;
  const hasWithdrawal = prior14.length >= 5 && totalInWindow >= 6 && aloneNow >= 0.35 && (aloneNow - alonePrior) >= 0.15;

  const candidates = [];

  // Two-cardinal (PHQ-2-style) combo collapses the two depression signals into one.
  if (hasPersistentLow && hasAnhedonia) {
    candidates.push({ key: "lowCombo", lean: "depression", titleKey: "triggerMap.early.lowCombo.title", bodyKey: "triggerMap.early.lowCombo.body", vars: {} });
  } else {
    if (hasPersistentLow) {
      candidates.push({ key: "persistentLow", lean: "depression", titleKey: "triggerMap.early.persistentLow.title", bodyKey: "triggerMap.early.persistentLow.body", vars: { days: lowDays.size } });
    }
    if (hasAnhedonia) {
      candidates.push({ key: "anhedonia", lean: "depression", titleKey: "triggerMap.early.anhedonia.title", bodyKey: "triggerMap.early.anhedonia.body", vars: {} });
    }
  }

  if (topAnxDomain && hasAnxious) {
    candidates.push({ key: "anxiousDomain", lean: "anxiety", titleKey: "triggerMap.early.anxiousDomain.title", bodyKey: "triggerMap.early.anxiousDomain.body", vars: { domain: topAnxDomain } });
  } else if (hasAnxious) {
    candidates.push({ key: "anxious", lean: "anxiety", titleKey: "triggerMap.early.anxious.title", bodyKey: "triggerMap.early.anxious.body", vars: {} });
  }

  if (hasWithdrawal) {
    candidates.push({ key: "withdrawal", lean: "depression", titleKey: "triggerMap.early.withdrawal.title", bodyKey: "triggerMap.early.withdrawal.body", vars: {} });
  }
  if (hasBodyRecurring) {
    candidates.push({ key: "bodyRecurring", lean: "anxiety", titleKey: "triggerMap.early.bodyRecurring.title", bodyKey: "triggerMap.early.bodyRecurring.body", vars: {} });
  }

  const signals = candidates.slice(0, 2);
  const careNote = signals.some((s) => s.lean === "depression");

  return {
    signals,
    careNote,
    meta: { windowDays: 14, loggedDays: loggedDays.size, totalInWindow, lowDays: lowDays.size, positiveShare: Number(positiveShare.toFixed(2)) },
  };
}

export default computeEarlySignals;
