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
import { buildSignalProfile } from "../ai/signalProfile.js";
import { triggerHi, emotionHi } from "../ai/insightLang.js";

function tl(trigger, lang) { return lang === "hi" ? triggerHi(trigger) : triggerLabel(trigger); }
function el(emotion, lang) { return lang === "hi" ? emotionHi(emotion) : emotion; }

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
  const helped = new Set();
  const notHelpful = new Set();
  const counters = {}; // actionId -> { helped: n, notHelpful: n }
  for (const entry of feedback || []) {
    const r = entry.response;
    if (!counters[entry.actionId]) counters[entry.actionId] = { helped: 0, notHelpful: 0 };
    if (r === "helped" || r === "tried") {
      helped.add(entry.actionId);
      counters[entry.actionId].helped++;
    }
    if (r === "not_helpful" || r === "skipped") {
      notHelpful.add(entry.actionId);
      counters[entry.actionId].notHelpful++;
    }
  }
  const all = new Set([...helped, ...notHelpful]);
  // Base IDs (epoch suffix stripped) for cross-epoch matching
  const helpedBases = new Set([...helped].map(id => id.replace(/-r\d+$/, "")));
  const notHelpfulBases = new Set([...notHelpful].map(id => id.replace(/-r\d+$/, "")));
  const allBases = new Set([...all].map(id => id.replace(/-r\d+$/, "")));
  return { helped, notHelpful, all, helpedBases, notHelpfulBases, allBases, counters };
}

/**
 * @param {object}  report   - Full weekly report from patternEngine
 * @param {Array}   feedback - HiTL feedback entries [{actionId, response, timestamp}]
 * @param {object?} prefs    - Stored action prefs (likedTriggers, dislikedApproaches, llmActions)
 */
export function generateActions(report, feedback = [], prefs = null, lang = "en") {
  if (!report || (report.totalMoments < 3 && !report.dataQuality?.isSilent)) return [];

  const isSilent = !!report.dataQuality?.isSilent;
  const fb = buildFeedbackIndex(feedback);
  const hi = lang === "hi";

  // Rotation epoch: every 3 feedback responses, rotate action IDs so
  // the user always gets fresh items after responding to the current set.
  const epoch = Math.floor(fb.all.size / 3);
  const eid = epoch > 0 ? `-r${epoch}` : "";

  // LLM actions are mixed into the candidate pool and processed through
  // the same HiTL feedback pipeline as rule-based candidates (see below).

  const candidates = [];
  const friction = report.frictionZones || [];
  const regulators = report.regulators || [];
  const drift = report.baselineMetrics?.drift;
  const deltas = report.weeklyDeltas;
  const likedTriggers = new Set(prefs?.likedTriggers || []);
  const sp = buildSignalProfile(report);
  const centroid = report.weeklyCentroid;
  const centroidDrift = report.centroidDrift;

  if (centroid?.count >= 3) {
    if (centroid.valence <= -0.2 && centroid.arousal >= 0.2) {
      candidates.push({
        id: "centroid-activated-negative",
        type: "awareness",
        title: hi
          ? `ध्यान दें क्या आपको ${el(centroid.label, lang)} बनाए रखता है`
          : `Notice what keeps you feeling ${centroid.label}`,
        reason: hi
          ? `इस हफ़्ते आपका औसत मूड ${el(centroid.label, lang)} की तरफ रहा। बार-बार चढ़ी हुई ऊर्जा किस चीज़ से जुड़ती है, उसे पहचानें।`
          : `Your week averaged toward ${centroid.label}. Notice what repeatedly sends your energy up while the emotional tone stays tough.`,
      });
    } else if (centroid.valence <= -0.2 && centroid.arousal <= -0.2) {
      candidates.push({
        id: "centroid-heavy-negative",
        type: "regulate",
        title: hi
          ? `भारी दिनों में रिकवरी के लिए जगह बचाएँ`
          : `Protect recovery when the week feels heavy`,
        reason: hi
          ? `इस हफ़्ते का औसत मूड ${el(centroid.label, lang)} रहा। कम-ऊर्जा वाले पलों के बाद थोड़ा नरम सहारा जोड़ना मदद कर सकता है।`
          : `Your week averaged toward ${centroid.label}. Adding one gentle support after low-energy moments can help stop that heaviness from stacking.`,
      });
    } else if (centroid.valence >= 0.2 && centroid.arousal <= 0.2) {
      candidates.push({
        id: "centroid-settled-positive",
        type: "regulate",
        title: hi
          ? `जो चीज़ आपको ${el(centroid.label, lang)} रखती है उसे बनाए रखें`
          : `Keep the conditions that made this week feel ${centroid.label}`,
        reason: hi
          ? `इस हफ़्ते आपका औसत मूड ${el(centroid.label, lang)} रहा। जो आपको टिकाव देता है, उसे अगले हफ़्ते में भी जगह दें।`
          : `Your week averaged toward ${centroid.label}. Carry one thing that helped that steadier tone into next week.`,
      });
    }

    if (centroidDrift && centroidDrift.arousal >= 0.2 && !candidates.some((candidate) => candidate.id === "centroid-rising-energy")) {
      candidates.push({
        id: "centroid-rising-energy",
        type: "awareness",
        title: hi ? "ध्यान दें कि ऊर्जा कब चढ़ने लगती है" : "Notice when your energy starts climbing",
        reason: hi
          ? `हफ़्ते के दौरान आपकी ऊर्जा ऊपर गई। किस समय या किस ट्रिगर के बाद यह बदलता है, उस पर नज़र रखें।`
          : `Your weekly energy trended upward. Pay attention to the time, trigger, or context right before that activation rises.`,
      });
    }
  }

  // 1. Friction + Regulator pairing
  if (friction.length && regulators.length) {
    const f = friction[0];
    // Pick a regulator whose trigger differs from the friction trigger
    const r = regulators.find((reg) => reg.trigger.toLowerCase() !== f.trigger.toLowerCase()) || regulators[0];
    const sameTrigger = f.trigger.toLowerCase() === r.trigger.toLowerCase();
    const freq1 = f.count <= 2 ? (hi ? 'कभी-कभी' : 'sometimes') : (hi ? 'अक्सर' : 'often');
    candidates.push({
      id: `reg-${f.trigger}-${r.trigger}`.toLowerCase().replace(/\s+/g, "-"),
      type: "regulate",
      title: hi
        ? (sameTrigger
          ? `${tl(f.trigger, lang)} में ${el(r.emotion, lang)} वाले पलों पर ध्यान दें`
          : `जब ${tl(f.trigger, lang)} मुश्किल हो, तो ${tl(r.trigger, lang)} आज़माएँ`)
        : (sameTrigger
          ? `Lean into the ${r.emotion} side of ${triggerLabel(r.trigger)}`
          : `Try ${triggerLabel(r.trigger)} when ${triggerLabel(f.trigger)} gets tough`),
      reason: hi
        ? `${tl(f.trigger, lang)} ${freq1} आपको ${el(f.emotion, lang)} छोड़ता है। ${tl(r.trigger, lang)} आपको ${el(r.emotion, lang)} महसूस कराने में मदद करता है।`
        : `${cap(triggerLabel(f.trigger))} ${freq1} leaves you feeling ${f.emotion}. ${cap(triggerLabel(r.trigger))} has been helping you feel ${r.emotion}.`,
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
      title: hi
        ? `ध्यान दें जब ${tl(f2.trigger, lang)} आपको ${el(f2.emotion, lang)} छोड़े`
        : `Notice when ${triggerLabel(f2.trigger)} leaves you feeling ${f2.emotion}`,
      reason: hi
        ? `ये जोड़ी ${f2.count} बार दिखी। पहचानना पहला कदम है।`
        : `This pairing appeared ${f2.count} times. Awareness is the first step.`,
      trigger: f2.trigger,
      emotion: f2.emotion,
    });
  }

  // 3. Drift-based action
  if (drift?.direction === "declining") {
    const subtleDrift = sp.drift === 'slight_negative';
    candidates.push({
      id: "drift-check-in",
      type: "awareness",
      title: hi
        ? (subtleDrift ? "ध्यान दें कि आपकी बेसलाइन कैसे बदल रही है" : "अपने आप से जाँचें कैसा महसूस हो रहा है")
        : (subtleDrift ? "Notice how your baseline is shifting" : "Check in with how you're feeling"),
      reason: hi
        ? (subtleDrift ? "आपकी सामान्य बेसलाइन में हल्का बदलाव आया है। कुछ पल रुकना मदद कर सकता है।" : "इस हफ़्ते आपकी भावनात्मक टोन बेसलाइन से नीचे गई। कुछ पल रुकना मदद कर सकता है।")
        : (subtleDrift ? "There's been a subtle shift below your usual baseline. A brief check-in can help." : "Your emotional tone dipped below your baseline this week. A brief pause can help."),
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
        title: hi
          ? `${tl(trigger, lang)} ज़्यादा दिख रहा है`
          : `${cap(triggerLabel(trigger))} is showing up more`,
        reason: hi
          ? `पिछले हफ़्ते से ${d.delta} ज़्यादा बार आया। ध्यान देना ज़रूरी है।`
          : `Appeared ${d.delta} more times than last week. Worth paying attention.`,
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
      title: hi
        ? `${tl(r.trigger, lang)} को अपने हफ़्ते में बनाए रखें`
        : `Keep ${triggerLabel(r.trigger)} in your week`,
      reason: hi
        ? `ये ${r.count >= 4 ? "लगातार" : "आम तौर पर"} आपको ${el(r.emotion, lang)} महसूस कराता है। जो काम करता है उसे बचाना ज़रूरी है।`
        : `It ${r.count >= 4 ? 'consistently' : 'generally'} leaves you feeling ${r.emotion}. Protecting what works matters.`,
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
          title: hi
            ? `${tl(r.trigger, lang)} पर टिके रहें — ये काम कर रहा है`
            : `Build on ${triggerLabel(r.trigger)} — it's been working for you`,
          reason: hi
            ? `पिछली बार आपने ${tl(r.trigger, lang)} आज़माया और मदद मिली। जारी रखें।`
            : `You engaged with ${triggerLabel(r.trigger)} last time and it helped. Keep the momentum.`,
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
      title: hi
        ? `ध्यान दें जब ${tl(topPair.trigger, lang)} आपको ${el(topPair.emotion, lang)} छोड़े`
        : `Notice when ${triggerLabel(topPair.trigger)} leaves you feeling ${topPair.emotion}`,
      reason: hi
        ? `ये जोड़ी इस हफ़्ते ${topPair.count} बार दिखी।${topPair.count >= 3 ? " आपकी सबसे आम जोड़ी।" : ""}`
        : `This pairing appeared ${topPair.count} time${topPair.count === 1 ? "" : "s"} this week.${topPair.count >= 3 ? ' Your most common combo.' : ''}`,
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
        title: hi
          ? `${tl(topTrigger, lang)} पर ध्यान दें`
          : `Pay attention to ${triggerLabel(topTrigger)}`,
        reason: hi
          ? `ये इस हफ़्ते आपका सबसे बड़ा ट्रिगर है। हर बार ध्यान दें कि कैसा महसूस होता है।`
          : `It's your top trigger this week. Notice how it makes you feel each time.`,
        trigger: topTrigger,
      });
    }
  }

  // 8. Variety experiment
  if (candidates.length < 3 && dq.uniqueTriggers && dq.uniqueTriggers <= 3) {
    candidates.push({
      id: "explore-triggers",
      type: "experiment",
      title: hi ? "एक नया ट्रिगर लॉग करें" : "Try logging a new trigger",
      reason: hi
        ? `आपने अब तक ${dq.uniqueTriggers} अलग ट्रिगर लॉग किए हैं। ज़्यादा लॉग करने से नए पैटर्न दिखेंगे।`
        : `You've logged ${dq.uniqueTriggers} different trigger${dq.uniqueTriggers === 1 ? "" : "s"} so far. Broadening your map reveals more patterns.`,
    });
  }

  // 9. Logging consistency
  if (candidates.length < 3 && dq.daysLogged && dq.daysLogged < 4) {
    candidates.push({
      id: "log-consistency",
      type: "experiment",
      title: hi ? "दिन के किसी अलग समय पर लॉग करें" : "Log at a different time of day",
      reason: hi
        ? `आपने ${dq.daysLogged} दिन लॉग किए हैं। ज़्यादा दिन लॉग करने से पैटर्न और स्पष्ट होंगे।`
        : `You've logged on ${dq.daysLogged} day${dq.daysLogged === 1 ? "" : "s"}. More days give sharper patterns.`,
    });
  }

  // 10. Top emotion reflection (new fallback for minimum 3)
  if (candidates.length < 3 && report.topEmotion) {
    candidates.push({
      id: `emotion-reflect-${report.topEmotion}`.toLowerCase(),
      type: "awareness",
      title: hi
        ? `सोचें कि ${el(report.topEmotion, lang)} सबसे ज़्यादा क्यों आता है`
        : `Reflect on why ${report.topEmotion} shows up most`,
      reason: hi
        ? `${el(report.topEmotion, lang)} आपकी सबसे आम भावना रही। सोचें क्या इसे लाता है।`
        : `Feeling ${report.topEmotion} was your most common emotion. Consider what makes it appear.`,
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
          title: hi
            ? `${tl(trigger, lang)} और ${el(emotion, lang)} के बीच के रिश्ते को समझें`
            : `Explore the ${triggerLabel(trigger)} and ${emotion} connection`,
          reason: hi
            ? `ये जोड़ी ${count} बार दिखी। ध्यान दें कि असल में क्या इसे ट्रिगर करता है।`
            : `This pairing came up ${count} time${count === 1 ? "" : "s"}. Notice what specifically triggers it.`,
          trigger,
          emotion,
        });
      }
    }
  }

  // 12. Ultimate safety net — generic but useful actions to guarantee minimum 3
  if (candidates.length < 3) {
    const fillers = hi
      ? [
          { id: "reflect-week", type: "awareness", title: "2 मिनट अपने हफ़्ते पर सोचें", reason: "थोड़ा सा रिव्यू आपको वो पैटर्न दिखा सकता है जो पल में नहीं दिखते।" },
          { id: "log-new-trigger", type: "experiment", title: "कुछ नया लॉग करें जो मूड पर असर डाले", reason: "ज़्यादा चीज़ें ट्रैक करने से छुपे पैटर्न सामने आते हैं।" },
          { id: "check-timing", type: "awareness", title: "ध्यान दें कि दिन में कब मूड बदलता है", reason: "समय के पैटर्न से माहौल के ट्रिगर्स का पता चलता है।" },
        ]
      : [
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

  // ── HiTL Feedback Layer ──────────────────────────────────────

  // Add LLM actions to the candidate pool (given priority in final sort)
  if (prefs?.llmActions?.length) {
    for (const a of prefs.llmActions) {
      if (!candidates.some(c => c.id === a.id)) {
        candidates.push({ ...a, _llmPriority: true });
      }
    }
  }

  // 1. Extract triggers from not-helpful feedback for trigger-level suppression
  //    "Not helpful" means: don't show this OR similar trigger suggestions again.
  const notHelpfulTriggers = new Set();
  for (const [id, c] of Object.entries(fb.counters)) {
    if (c.notHelpful > 0) {
      const baseId = id.replace(/-r\d+$/, "");
      const matched = candidates.find(a => a.id === baseId);
      if (matched?.trigger) {
        notHelpfulTriggers.add(matched.trigger.toLowerCase());
      } else {
        // Fallback: parse trigger from ID pattern (e.g., "friction-work-anxious" → "work")
        const parts = baseId.split("-");
        if (parts.length >= 2 && !["centroid", "drift", "explore", "reflect", "log", "check", "emotion", "enhance", "pair", "top", "fill"].includes(parts[0])) {
          notHelpfulTriggers.add(parts[1].toLowerCase());
        }
      }
    }
  }

  // 2. Enhance "helped" candidates — transform into deeper follow-ups
  //    instead of filtering them out. The user liked this approach, so build on it.
  const enhanced = [];
  for (const c of candidates) {
    const baseId = c.id.replace(/-r\d+$/, "");
    if (fb.helpedBases.has(baseId)) {
      enhanced.push({
        ...c,
        id: `enhance-${baseId}${eid}`,
        title: hi
          ? `${c.title} — इसे और आगे ले जाएँ`
          : `Build on this: ${c.title.charAt(0).toLowerCase() + c.title.slice(1)}`,
        reason: hi
          ? `इस तरीके ने पहले आपकी मदद की। अगला कदम उठाएँ और इस प्रयास को और गहरा करें।`
          : `This approach helped you before. Take the next step and deepen the practice.`,
      });
    }
  }

  // 3. Apply rotation epoch to candidate IDs
  if (eid) {
    for (const c of candidates) { c.id = c.id + eid; }
  }

  // 4. Filter candidates:
  //    - Remove actions the user already responded to (any epoch)
  //    - Suppress triggers the user said "not helpful" to
  let filtered = candidates.filter(a => {
    const aBase = a.id.replace(/-r\d+$/, "");
    if (fb.allBases.has(aBase)) return false;
    if (a.trigger && notHelpfulTriggers.has(a.trigger.toLowerCase())) return false;
    return true;
  });

  // 5. Merge: enhanced actions (from "helped" feedback) first, then fresh candidates
  filtered = [...enhanced, ...filtered];

  // Deduplicate by trigger (enhanced actions get priority)
  const seenTriggers = new Set();
  filtered = filtered.filter(a => {
    if (!a.trigger) return true;
    const key = a.trigger.toLowerCase();
    if (seenTriggers.has(key)) return false;
    seenTriggers.add(key);
    return true;
  });

  // 6. Rank: LLM actions first, then boost helped triggers
  const helpedTriggers = new Set();
  for (const [id, c] of Object.entries(fb.counters)) {
    if (c.helped > 0) {
      const baseId = id.replace(/-r\d+$/, "");
      const matched = candidates.find(a => a.id === id || a.id.replace(/-r\d+$/, "") === baseId);
      if (matched?.trigger) helpedTriggers.add(matched.trigger);
      const parts = baseId.split("-");
      if (parts.length >= 2 && parts[0] !== "centroid" && parts[0] !== "drift") {
        if (parts[1]) helpedTriggers.add(parts[1]);
      }
    }
  }
  filtered.sort((a, b) => {
    const aLlm = a._llmPriority ? 2 : 0;
    const bLlm = b._llmPriority ? 2 : 0;
    const aBoost = a.trigger && helpedTriggers.has(a.trigger) ? 1 : 0;
    const bBoost = b.trigger && helpedTriggers.has(b.trigger) ? 1 : 0;
    return (bLlm + bBoost) - (aLlm + aBoost);
  });

  // 7. Guarantee exactly 3 — post-filter safety net
  if (filtered.length < 3) {
    const fillers = hi
      ? [
          { id: `reflect-week${eid}`, type: "awareness", title: "2 मिनट अपने हफ़्ते पर सोचें", reason: "थोड़ा सा रिव्यू आपको वो पैटर्न दिखा सकता है जो पल में नहीं दिखते।" },
          { id: `log-new-trigger${eid}`, type: "experiment", title: "कुछ नया लॉग करें जो मूड पर असर डाले", reason: "ज़्यादा चीज़ें ट्रैक करने से छुपे पैटर्न सामने आते हैं।" },
          { id: `check-timing${eid}`, type: "awareness", title: "ध्यान दें कि दिन में कब मूड बदलता है", reason: "समय के पैटर्न से माहौल के ट्रिगर्स का पता चलता है।" },
        ]
      : [
          { id: `reflect-week${eid}`, type: "awareness", title: "Take 2 minutes to reflect on your week", reason: "A short review helps you notice patterns you might miss in the moment." },
          { id: `log-new-trigger${eid}`, type: "experiment", title: "Log something new that affects your mood", reason: "Expanding what you track reveals hidden patterns." },
          { id: `check-timing${eid}`, type: "awareness", title: "Notice what time of day your mood shifts", reason: "Timing patterns can reveal environmental triggers." },
        ];
    for (const f of fillers) {
      if (filtered.length >= 3) break;
      const fBase = f.id.replace(/-r\d+$/, "");
      if (!filtered.some(c => c.id === f.id) && !fb.allBases.has(fBase)) {
        filtered.push(f);
      }
    }
  }

  // Absolute fallback: guarantee 3 with unique IDs
  if (filtered.length < 3) {
    const fallback = hi
      ? [
          { type: "awareness", title: "अपने हफ़्ते पर एक नज़र डालें", reason: "छोटा सा रिव्यू पैटर्न दिखा सकता है।" },
          { type: "experiment", title: "आज कुछ नया लॉग करें", reason: "नई चीज़ें ट्रैक करने से छुपे पैटर्न मिलते हैं।" },
          { type: "awareness", title: "ध्यान दें आज कैसा महसूस हो रहा है", reason: "रोज़ाना की जागरूकता से पैटर्न साफ़ होते हैं।" },
        ]
      : [
          { type: "awareness", title: "Take a moment to review your week", reason: "A quick review can reveal patterns you might otherwise miss." },
          { type: "experiment", title: "Log something new today", reason: "Tracking new things reveals hidden patterns." },
          { type: "awareness", title: "Notice how you're feeling right now", reason: "Daily awareness makes patterns clearer over time." },
        ];
    for (let i = 0; filtered.length < 3 && i < fallback.length; i++) {
      filtered.push({ ...fallback[i], id: `fill-${epoch}-${filtered.length}` });
    }
  }

  // Always return exactly 3 actions
  // For silent (returning) users, prepend a welcome-back action
  if (isSilent) {
    const welcomeBack = {
      id: `welcome-back${eid}`,
      type: "awareness",
      title: hi ? "वापसी पर स्वागत है — एक पल लॉग करें" : "Welcome back — log a moment when you're ready",
      reason: hi
        ? "आपके पिछले पैटर्न अभी भी यहाँ हैं। एक नया पल लॉग करने से सब फिर से जुड़ जाएगा।"
        : "Your previous patterns are still here. Logging one new moment reconnects everything.",
    };
    filtered.unshift(welcomeBack);
  }

  return filtered.slice(0, 3).map((a, i) => ({
    ...a,
    title: hi ? a.title : lintText(a.title),
    reason: hi ? a.reason : lintText(a.reason),
    ...(ACTION_META[a.type] || ACTION_META.awareness),
    order: i,
  }));
}
