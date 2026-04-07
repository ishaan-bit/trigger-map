/**
 * Structured knowledge base for RAG-augmented insight generation.
 *
 * Each chunk is a self-contained knowledge fragment indexed by signal tags.
 * The retrieval engine scores chunks by tag overlap with the user's signal
 * profile and injects the top-k into LLM prompts or rule-based framing.
 *
 * Domains:
 *   interpretation — what a pattern combination means behaviorally
 *   intervention   — evidence-based micro-actions for a given profile
 *   dynamics       — how emotions interact, compound, and transform
 *   framing        — narrative guidance for communicating insight at different severities
 *
 * Tags use the signal profile vocabulary:
 *   volatility:low / volatility:moderate / volatility:high
 *   drift:positive / drift:negative / drift:strong_negative / drift:neutral
 *   flattening / masking / false_recovery / crash_risk
 *   trigger:work / trigger:family / trigger:health / trigger:money / etc.
 *   emotion:anxious / emotion:frustrated / emotion:calm / emotion:energized / etc.
 *   confidence:too_early / confidence:low / confidence:emerging / confidence:moderate / confidence:strong
 *   intensity:subtle / intensity:moderate / intensity:strong
 *   vacuum:negative / vacuum:positive / vacuum:strong_negative
 *   recovery:slow / recovery:fast
 *   recurrence / streak:positive / streak:negative
 */

export const KNOWLEDGE_CHUNKS = [

  // ════════════════════════════════════════════════════════════════
  //  PATTERN INTERPRETATIONS
  // ════════════════════════════════════════════════════════════════

  {
    id: "flat_work",
    domain: "interpretation",
    tags: ["flattening", "trigger:work"],
    weight: 0.95,
    content: "When emotional range narrows toward neutral and work is the dominant trigger, this often indicates functional numbing. The emotional system dampens responses to maintain output. The person may feel fine but shows decreased engagement variety. This differs from genuine calm, which includes energy variety and positive moments.",
  },
  {
    id: "flat_general",
    domain: "interpretation",
    tags: ["flattening"],
    weight: 0.85,
    content: "Emotional flattening is a narrowing of felt range toward neutral. It is not stability. Stable patterns show variety within a comfortable range. Flattening shows a collapse of variety. Common causes include avoidance, fatigue, or emotional overload. The key signal is that even positive triggers stop producing positive emotions.",
  },
  {
    id: "mask_high",
    domain: "interpretation",
    tags: ["masking"],
    weight: 0.9,
    content: "High masking means the person's reported emotional state diverges from their behavioral patterns. They may report feeling stable while logging at irregular times, with high intra-day variance, or shifting time distributions. This is not intentional deception. It often reflects a gap between what someone believes they feel and what their behavior signals.",
  },
  {
    id: "mask_flat",
    domain: "interpretation",
    tags: ["masking", "flattening"],
    weight: 0.95,
    content: "Masking combined with flattening suggests emotional suppression. The person reports neutral states while behaving unstably. This combination is more significant than either signal alone. The suppression is usually automatic and the person is often unaware of it. The insight should gently highlight the divergence without accusation.",
  },
  {
    id: "false_recovery_pattern",
    domain: "interpretation",
    tags: ["false_recovery"],
    weight: 0.95,
    content: "False recovery is when surface emotion scores return to baseline but the underlying vacuum state remains depressed. The person appears to have bounced back but hasn't. This pattern is common after loss, major stress, or relationship disruption. It can persist for weeks. The key indicator is a vacuum score that stays below baseline even as reported emotions normalize.",
  },
  {
    id: "crash_risk_pattern",
    domain: "interpretation",
    tags: ["crash_risk"],
    weight: 0.98,
    content: "Crash risk is detected when sustained positive surface emotions coexist with a declining vacuum state and elevated masking for three or more days. This pattern often precedes a sudden emotional drop. It can indicate overextension, forced positivity, or accumulating stress masked by activity. The insight should acknowledge positive surface energy while noting that the pace may not be sustainable.",
  },
  {
    id: "drift_neg_work",
    domain: "interpretation",
    tags: ["drift:negative", "trigger:work"],
    weight: 0.85,
    content: "Negative emotional drift with work as the dominant trigger suggests accumulating work-related stress. The person's current emotional state is trending below their personal baseline. When work is the primary driver, the drift is often amplified by a lack of recovery time between work moments.",
  },
  {
    id: "drift_neg_partner",
    domain: "interpretation",
    tags: ["drift:negative", "trigger:partner"],
    weight: 0.85,
    content: "Negative drift paired with partner as the dominant trigger suggests relational tension is pulling emotion below baseline. Relational friction tends to produce higher emotional residue than other triggers, meaning its effects linger longer into subsequent moments. The insight should note the pattern without assigning cause.",
  },
  {
    id: "drift_pos",
    domain: "interpretation",
    tags: ["drift:positive"],
    weight: 0.7,
    content: "Positive drift means the person's recent emotional average exceeds their baseline. This is genuinely good news and should be framed positively. Look for regulators that may be driving the improvement. Positive drift is more reliable when accompanied by moderate-to-low volatility, which suggests the improvement is steady rather than driven by occasional spikes.",
  },
  {
    id: "high_vol_multi_trigger",
    domain: "interpretation",
    tags: ["volatility:high"],
    weight: 0.8,
    content: "High volatility means wide swings between emotional entries. This can reflect a genuinely variable week or indicate that multiple life areas are pulling in different directions simultaneously. When paired with diverse triggers, it suggests the person is managing several competing demands. When paired with a single trigger, it suggests that one area is producing unpredictable emotional responses.",
  },
  {
    id: "low_vol_positive",
    domain: "interpretation",
    tags: ["volatility:low", "drift:positive"],
    weight: 0.75,
    content: "Low volatility with positive drift is the strongest positive signal. The person is emotionally consistent and trending upward. This is genuine stability and should be celebrated in the insight. Look for regulators and routines that may be anchoring this pattern.",
  },
  {
    id: "vacuum_neg",
    domain: "interpretation",
    tags: ["vacuum:negative"],
    weight: 0.85,
    content: "A negative vacuum state means the person's internal emotional ground truth, with trigger influence removed, is below their baseline. Even when positive things happen, the underlying emotional tone is depressed. This is a signal of internal emotional load that isn't being driven by external events alone.",
  },
  {
    id: "vacuum_strong_neg",
    domain: "interpretation",
    tags: ["vacuum:strong_negative"],
    weight: 0.92,
    content: "A strongly negative vacuum state indicates significant internal emotional depletion independent of external triggers. The person's emotional ground truth is substantially below their personal baseline. External positive events are providing temporary lift but not shifting the underlying state. This requires gentle framing and emphasis on recovery-oriented suggestions.",
  },
  {
    id: "recurrence_friction",
    domain: "interpretation",
    tags: ["recurrence"],
    weight: 0.75,
    content: "Recurring trigger-emotion patterns that repeat multiple times within a week indicate a stable behavioral loop. When the loop involves negative emotions, it represents a friction zone that is reliably producing distress. These loops are the most actionable patterns because they are predictable. Small changes in the trigger context or the response to the trigger can break or soften the loop.",
  },
  {
    id: "streak_neg",
    domain: "interpretation",
    tags: ["streak:negative"],
    weight: 0.82,
    content: "A negative streak means multiple consecutive days of lower-than-average emotional scores. This represents sustained low energy rather than isolated bad moments. Negative streaks compound through emotional residue, where each low day makes the next harder. The most effective response is introducing small regulators rather than large changes.",
  },
  {
    id: "streak_pos",
    domain: "interpretation",
    tags: ["streak:positive"],
    weight: 0.7,
    content: "A positive streak reflects consecutive days of higher emotional energy. This is worth noting as evidence that the person can sustain positive states. Identifying what maintained the streak (specific triggers, routines, environments) is valuable for replication.",
  },
  {
    id: "contamination_pattern",
    domain: "interpretation",
    tags: ["masking"],
    weight: 0.72,
    content: "Context contamination occurs when emotional responses to one trigger systematically bleed into responses to other triggers. For example, work stress may elevate anxiety during family moments that would otherwise be neutral. This makes the contaminated trigger appear more negative than it actually is. Identifying the source trigger is key.",
  },
  {
    id: "recovery_slow",
    domain: "interpretation",
    tags: ["recovery:slow"],
    weight: 0.78,
    content: "When recovery latency is slow, the person takes longer than average to return to baseline after emotional dips. This can indicate depleted coping resources, persistent stressors, or inadequate recovery rituals. The insight should gently suggest that recovery may need more deliberate space.",
  },

  // ════════════════════════════════════════════════════════════════
  //  EVIDENCE-BASED INTERVENTIONS
  // ════════════════════════════════════════════════════════════════

  {
    id: "int_flat_notice",
    domain: "intervention",
    tags: ["flattening"],
    weight: 0.85,
    content: "For flattening: the intervention is not to feel more. It is to notice more. Suggest deliberately pausing at two moments during the day to label what is actually being felt, even if the answer is nothing. Emotional granularity practice, simply naming sub-emotions, can reopen collapsed emotional range. Suggest trying to distinguish between calm, bored, tired, content, and indifferent.",
  },
  {
    id: "int_mask_check",
    domain: "intervention",
    tags: ["masking"],
    weight: 0.82,
    content: "For masking patterns: the intervention is gentle self-honesty. Suggest a brief end-of-day check where the person asks: what did I actually feel today versus what I said I felt? This is not about self-criticism. It is about closing the gap between reported and experienced emotion. Even noticing the gap exists is the first step.",
  },
  {
    id: "int_crash_pace",
    domain: "intervention",
    tags: ["crash_risk"],
    weight: 0.9,
    content: "For crash risk: the intervention is pacing. When the surface is positive but the underlying state is declining, the person is likely overextending. Suggest building in one deliberate recovery block (30+ minutes of zero obligation) into the next 48 hours. The goal is not to slow down permanently but to prevent the accumulating deficit from reaching a tipping point.",
  },
  {
    id: "int_false_rec_ground",
    domain: "intervention",
    tags: ["false_recovery"],
    weight: 0.88,
    content: "For false recovery: the intervention is grounding rather than pushing forward. The surface suggests recovery but the underlying state hasn't yet healed. Suggest one low-demand activity that brings genuine comfort rather than productivity. The goal is to give the deeper emotional layer time to catch up with the surface recovery.",
  },
  {
    id: "int_drift_neg_anchor",
    domain: "intervention",
    tags: ["drift:negative"],
    weight: 0.8,
    content: "For negative drift: identify the person's existing regulators from the data and suggest deliberately increasing exposure to one of them. Regulators are trigger-emotion pairings that consistently produce positive outcomes. The intervention is not a new behavior but amplification of what already works. If no regulators exist, suggest logging one small moment of genuine enjoyment, however minor.",
  },
  {
    id: "int_vol_high_structure",
    domain: "intervention",
    tags: ["volatility:high"],
    weight: 0.78,
    content: "For high volatility: the intervention is anchoring through micro-routines. Wide emotional swings often reflect a lack of predictable anchors in the day. Suggest one fixed ritual (morning walk, evening tea, midday pause) that stays the same regardless of what else happens. The ritual acts as an emotional anchor point against which the swings feel less destabilizing.",
  },
  {
    id: "int_recurrence_break",
    domain: "intervention",
    tags: ["recurrence"],
    weight: 0.82,
    content: "For recurring friction loops: the intervention is a context shift. Recurring negative trigger-emotion pairings are maintained by context cues. Suggest changing one element of the context surrounding the trigger. If work+frustrated recurs, changing the physical location, time, or preceding activity can disrupt the automatic emotional response.",
  },
  {
    id: "int_neg_streak_small",
    domain: "intervention",
    tags: ["streak:negative"],
    weight: 0.8,
    content: "For negative streaks: suggest one small positive action with zero obligation. When energy is consistently low, large suggestions feel overwhelming and get skipped. A 5-minute walk, one message to a friend, or eating something nourishing is enough. The goal is to introduce a single break in the pattern, not to reverse it in one move.",
  },
  {
    id: "int_vacuum_neg_restore",
    domain: "intervention",
    tags: ["vacuum:negative"],
    weight: 0.85,
    content: "For depressed vacuum state: the intervention targets internal restoration rather than external activity. Suggest reducing the number of emotionally demanding commitments for the next few days and replacing one obligation with rest. The vacuum state reflects internal depletion that external positivity alone cannot fill.",
  },
  {
    id: "int_low_data_gentle",
    domain: "intervention",
    tags: ["confidence:too_early", "confidence:low"],
    weight: 0.7,
    content: "With limited data, the most helpful intervention is simply to keep logging. Frame the suggestion as building their personal dataset. Suggest logging at different times of day and in response to different triggers to build a more complete picture. Avoid making strong claims about patterns that may not be stable yet.",
  },
  {
    id: "int_positive_sustain",
    domain: "intervention",
    tags: ["drift:positive", "volatility:low"],
    weight: 0.72,
    content: "When patterns are genuinely positive and stable, the intervention is about sustaining rather than changing. Suggest the person notice what is working, name their regulators, and protect those routines. Positive patterns need maintenance. The temptation during good periods is to add more, which can destabilize what is already working.",
  },

  // ════════════════════════════════════════════════════════════════
  //  EMOTIONAL DYNAMICS
  // ════════════════════════════════════════════════════════════════

  {
    id: "dyn_residue",
    domain: "dynamics",
    tags: ["volatility:high", "recurrence"],
    weight: 0.72,
    content: "Emotional residue means the emotional effect of a moment carries forward into subsequent moments with a decay rate. When a strongly negative moment occurs, its emotional residue contaminates the next 2-3 moments even if their triggers are neutral or positive. This is why a bad morning can color an otherwise good afternoon. The residue decays at roughly 0.7 per hour.",
  },
  {
    id: "dyn_evoked_invoked",
    domain: "dynamics",
    tags: ["vacuum:negative", "vacuum:strong_negative"],
    weight: 0.8,
    content: "Every emotional score has two components: evoked (caused by the trigger, expected from history) and invoked (internally generated, independent of events). When the invoked component is negative, the person's internal state is pulling emotion downward regardless of what happens externally. This is what the vacuum state captures. Positive invoked means internal resilience is adding to external positivity.",
  },
  {
    id: "dyn_cascade",
    domain: "dynamics",
    tags: ["volatility:high", "masking"],
    weight: 0.75,
    content: "Emotional cascades occur when one trigger's emotional impact spreads to other areas. Work frustration bleeds into family interactions. Partner conflict reduces social energy. The cascade mechanism is context contamination, where the brain's emotional response system generalizes from one domain to others. Breaking a cascade requires addressing the source trigger, not the contaminated ones.",
  },
  {
    id: "dyn_regulator_mech",
    domain: "dynamics",
    tags: ["drift:positive"],
    weight: 0.7,
    content: "Regulators are trigger-emotion pairings that reliably produce positive outcomes. They work through two mechanisms: direct positive activation (the trigger genuinely produces good feeling) and buffering (the regulator's positive residue protects against subsequent negative moments). Identifying and protecting regulators is one of the highest-leverage insights.",
  },
  {
    id: "dyn_friction_mech",
    domain: "dynamics",
    tags: ["drift:negative", "recurrence"],
    weight: 0.75,
    content: "Friction zones are trigger-emotion pairings that reliably produce negative outcomes. They become self-reinforcing through anticipatory anxiety, where the person begins to expect the negative outcome before the trigger even occurs. This expectation itself shifts emotion downward at the moment of trigger encounter, making the negative outcome more likely. The loop can be weakened by changing one element of the context.",
  },
  {
    id: "dyn_baseline_meaning",
    domain: "dynamics",
    tags: ["drift:neutral"],
    weight: 0.65,
    content: "The personal emotional baseline is not a target. It is a reference point. Being at baseline means the person's emotional state is where their system naturally settles. Drift above baseline is positive; drift below is worth attention. But baseline itself is neither good nor bad. Each person's baseline reflects their temperament, circumstances, and coping patterns.",
  },
  {
    id: "dyn_stability_vs_flat",
    domain: "dynamics",
    tags: ["flattening", "volatility:low"],
    weight: 0.82,
    content: "True emotional stability shows variety within a comfortable range. The person experiences highs and lows but within a manageable bandwidth. Flattening shows a collapse of variety itself. Stable people log calm, energized, and occasional frustration. Flattened people log neutral across most triggers. The key diagnostic is whether positive triggers produce positive emotions. If not, it is flattening, not stability.",
  },

  // ════════════════════════════════════════════════════════════════
  //  NARRATIVE FRAMING
  // ════════════════════════════════════════════════════════════════

  {
    id: "frame_subtle",
    domain: "framing",
    tags: ["intensity:subtle"],
    weight: 0.8,
    content: "When signals are subtle, use restrained observational language. Phrases like 'there is a slight shift', 'a small pattern is forming', 'something worth noticing'. Avoid strong claims. Frame as noticing rather than concluding. The purpose is to name what the data shows without overinterpreting a weak signal.",
  },
  {
    id: "frame_moderate",
    domain: "framing",
    tags: ["intensity:moderate"],
    weight: 0.8,
    content: "When signals are moderate, use direct but not alarming language. Phrases like 'a clear pattern is showing', 'your data consistently shows', 'this has been steady all week'. The tone is calm reporting with enough specificity to feel grounded. Avoid hedging language used for subtle signals.",
  },
  {
    id: "frame_strong",
    domain: "framing",
    tags: ["intensity:strong"],
    weight: 0.8,
    content: "When signals are strong, be direct and specific. Phrases like 'this pattern is pronounced', 'the data is very clear on this', 'this has been the dominant theme'. Strong signals warrant clear language, but never clinical or diagnostic terms. The tone is honest and caring, not clinical or alarming.",
  },
  {
    id: "frame_crash",
    domain: "framing",
    tags: ["crash_risk"],
    weight: 0.92,
    content: "For crash risk framing: acknowledge the positive surface energy first. Then gently note the pace or accumulated load. Never say 'you are going to crash'. Use language like 'the pace has been high', 'your energy has been running at full capacity', 'there may be less in reserve than it feels like'. The goal is awareness, not alarm.",
  },
  {
    id: "frame_false_rec",
    domain: "framing",
    tags: ["false_recovery"],
    weight: 0.88,
    content: "For false recovery framing: avoid implying the person is not actually better. Instead, note that recovery takes time at different layers. Use language like 'your day-to-day feels more even, and the deeper settling may still be in progress', 'the surface has steadied while something underneath is still shifting'. The tone is patient and normalizing.",
  },
  {
    id: "frame_positive",
    domain: "framing",
    tags: ["drift:positive", "volatility:low"],
    weight: 0.75,
    content: "For genuinely positive patterns: celebrate without over-explaining. Name the regulators and routines that seem to anchor the positive state. Avoid adding caveats or warnings when the data is clearly positive. The temptation is to find something to warn about; resist it. Good weeks deserve to be recognized as good weeks.",
  },
  {
    id: "frame_low_data",
    domain: "framing",
    tags: ["confidence:too_early", "confidence:low"],
    weight: 0.75,
    content: "With limited data: be transparent about confidence. Use phrases like 'with a few entries so far', 'early signs suggest', 'as more data comes in this will sharpen'. Never state a pattern as established when the data is thin. The most honest response to low data is curiosity and encouragement to log more.",
  },
  {
    id: "frame_masking",
    domain: "framing",
    tags: ["masking"],
    weight: 0.85,
    content: "For masking framing: never accuse the person of dishonesty or self-deception. Use language like 'there is an interesting gap between what gets logged and the logging pattern itself', 'the timing and rhythm of entries tell a slightly different story than the emotions logged'. Frame it as the data noticing something the person might not have, not as a judgment.",
  },
  {
    id: "frame_flattening",
    domain: "framing",
    tags: ["flattening"],
    weight: 0.88,
    content: "For flattening framing: the wrong approach is to call neutral emotions bad. The right approach is to note the narrowing of range. Use language like 'your emotional range has been unusually narrow', 'even moments that usually produce a shift stayed near neutral', 'the variety has pulled in'. Frame it as something to notice, not something wrong.",
  },

  // ════════════════════════════════════════════════════════════════
  //  TRIGGER-SPECIFIC CONTEXT
  // ════════════════════════════════════════════════════════════════

  {
    id: "ctx_work",
    domain: "interpretation",
    tags: ["trigger:work"],
    weight: 0.6,
    content: "Work as a trigger typically produces the widest emotional range. It can be both a regulator and a friction source in the same week. When work dominates both positive and negative entries, it indicates the person's identity is highly invested in their professional life. Suggestions should respect this investment rather than suggesting disengagement.",
  },
  {
    id: "ctx_family",
    domain: "interpretation",
    tags: ["trigger:family"],
    weight: 0.6,
    content: "Family as a dominant trigger tends to produce higher emotional residue than other triggers because family interactions carry deeper attachment patterns. Negative family moments contaminate subsequent entries more strongly. Positive family moments provide stronger grounding effects. Suggestions for family friction should focus on boundaries and self-regulation, not on changing family members.",
  },
  {
    id: "ctx_health",
    domain: "interpretation",
    tags: ["trigger:health"],
    weight: 0.6,
    content: "When health is the dominant trigger, emotional patterns are often driven by physical state more than psychological factors. Sleep, exercise, illness, and energy levels create a physical substrate that colors all other emotional responses. Suggestions should prioritize somatic and physical interventions over cognitive ones.",
  },
  {
    id: "ctx_money",
    domain: "interpretation",
    tags: ["trigger:money"],
    weight: 0.6,
    content: "Money as a dominant trigger typically produces anxiety more than other negative emotions. Financial stress has a distinctive pattern of persistent low-level anxiety rather than acute spikes. It tends to contaminate other life areas through background worry. Suggestions should focus on containment, reducing how much financial concern bleeds into non-financial moments.",
  },
  {
    id: "ctx_self",
    domain: "interpretation",
    tags: ["trigger:self"],
    weight: 0.65,
    content: "Self as a dominant trigger indicates high self-referential processing. The person's emotional life is significantly shaped by internal dialogue rather than external events. This can manifest as rumination when negative or healthy self-awareness when positive. The invoked component is typically larger than the evoked component for self-triggered moments.",
  },
  {
    id: "ctx_social",
    domain: "interpretation",
    tags: ["trigger:social"],
    weight: 0.6,
    content: "Social triggers tend to produce bimodal emotional responses. Social energy can be strongly positive or depleting, with little middle ground. When social patterns show high volatility, it often reflects the person's sensitivity to social dynamics rather than the events themselves. Suggestions should help the person identify which social contexts energize versus deplete.",
  },
];
