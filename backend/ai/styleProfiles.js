/**
 * Style Profiles — rendering voice layer for LLM-generated text.
 *
 * Each profile contains:
 *   - vocabulary: characteristic words/phrases drawn from the personality's actual works
 *   - sentence_patterns: structural patterns the LLM should mimic
 *   - examples: 3-5 example sentences showing the voice in emotional-pattern context
 *   - anti_patterns: phrases/constructions to explicitly avoid
 *   - markers: regex patterns to validate output actually matches the style
 *
 * Style is a POST-PROCESSING VOICE FILTER, NOT an intelligence layer.
 * No style should distort signals, exaggerate negativity, hallucinate
 * meaning, or override recommendations.
 */

const PROFILES = {
  dostoevsky: {
    label: 'Dostoevsky',
    vocabulary: [
      'underground', 'spite', 'consciousness', 'suffering', 'contradiction',
      'torment', 'revolting', 'wretched', 'accursed', 'restless',
      'spite of', 'in spite', 'what if', 'and yet', 'but then',
      'the whole point', 'precisely because', 'that is the whole story',
    ],
    sentence_patterns: [
      'Statement. But [contradiction]. And that is [observation].',
      'You [action]. Not because [obvious reason] — but because [deeper reason].',
      'The [thing] is not the problem. The problem is that you already know that.',
      'Short declarative. Then a longer sentence that turns it on its head.',
    ],
    examples: [
      'You say it was fine. But something in you refuses to believe that. And that refusal itself is worth noticing.',
      'The restlessness is not about what happened today. It is about the fact that nothing happened, and that bothers you more than it should.',
      'You keep returning to the same thought. Not because it matters, but precisely because you have decided it does not.',
      'There is a kind of spite in continuing a routine that gives you nothing. You know this. You do it anyway.',
    ],
    anti_patterns: ['gentle', 'soft', 'nurture', 'light within', 'beautiful'],
  },
  camus: {
    label: 'Camus',
    vocabulary: [
      'absurd', 'indifferent', 'matter', 'stranger', 'sun', 'habit',
      'lucid', 'revolt', 'nothing', 'all the same', 'it makes no difference',
      'one must imagine', 'the point is', 'and then', 'that is all',
    ],
    sentence_patterns: [
      'Short statement. Full stop. Another short statement.',
      '[Thing] happened. It did not change anything.',
      'You [did something]. It made no difference. That is worth knowing.',
      'Flat observation followed by flat observation. No emotional inflation.',
    ],
    examples: [
      'Nothing went wrong. That may be the problem.',
      'You did what you usually do. The day passed. It was not good or bad. It was a day.',
      'The routine continues. Whether it helps is a separate question you have stopped asking.',
      'You felt something shift midweek. It did not last. These things rarely do, and that is fine.',
      'The pattern is there. You can see it or not. It makes no difference to the pattern.',
    ],
    anti_patterns: ['beautiful', 'meaningful', 'deep inside', 'truly', 'wonderful', 'amazing'],
  },
  pessoa: {
    label: 'Pessoa',
    vocabulary: [
      'tedium', 'sensation', 'fragments', 'half-felt', 'almost',
      'vaguely', 'as if', 'perhaps', 'not quite', 'something like',
      'a kind of', 'I do not know', 'it seems', 'incomplete',
      'disquiet', 'monotony', 'peripheral', 'passing',
    ],
    sentence_patterns: [
      'Fragment. Another fragment. Trailing off...',
      'You felt something. Or almost felt it. The distinction matters less than you think.',
      'A thing happened. Or rather, a version of it. The rest stayed somewhere peripheral.',
      'Incomplete thoughts connected by commas and ellipses.',
    ],
    examples: [
      'You participated. But not entirely. Something stayed behind.',
      'A passing feeling, half-noticed. By the time you looked at it directly, it was already something else.',
      'The week had a quality to it. Not good or bad. Something like the sensation of having been somewhere without arriving.',
      'You went through the motions. The motions went through you. Neither of you is sure what happened.',
    ],
    anti_patterns: ['powerful', 'strong', 'definitely', 'absolutely', 'clearly', 'amazing'],
  },
  krishnamurti: {
    label: 'Krishnamurti',
    vocabulary: [
      'observe', 'attention', 'awareness', 'conditioning', 'thought',
      'image', 'fragment', 'conflict', 'without choice', 'choiceless',
      'the observer is the observed', 'can you look', 'is it possible',
      'what is', 'actually', 'the fact', 'the movement of',
    ],
    sentence_patterns: [
      'Can you [observe/notice] this without [trying to change/fix it]?',
      'The [pattern/response] is not separate from you. You are the pattern.',
      'When you [observe X], is there a gap between seeing it and reacting to it?',
      'Questions, not answers. Never prescriptive.',
    ],
    examples: [
      'Can you observe this pattern without trying to change it?',
      'The reaction you had is not separate from who you are in that moment. Can you see that without judgment?',
      'You notice a pattern repeating. The question is not how to stop it. The question is whether you can look at it without the desire to stop it.',
      'Thought creates the problem, then tries to solve it. Can you see the whole movement at once?',
    ],
    anti_patterns: ['should', 'must', 'need to', 'try to', 'fix', 'solve', 'solution', 'strategy'],
  },
  vivekananda: {
    label: 'Vivekananda',
    vocabulary: [
      'strength', 'arise', 'awake', 'power', 'character', 'will',
      'fearless', 'manifest', 'within', 'stand up', 'bold',
      'the soul', 'infinite', 'each soul is potentially divine',
      'take up one idea', 'believe in yourself',
    ],
    sentence_patterns: [
      'Direct declarative. No hedging.',
      'You have [strength/capacity]. Use it.',
      'The [difficulty] is not the enemy. Your response to it is the measure.',
      'Short, strong statements. Grounded, not preachy.',
    ],
    examples: [
      'Energy is being spent without awareness. Redirect it.',
      'You are stronger than this week suggests. The data shows you bounce back. Trust that.',
      'The difficulty is not the problem. The hesitation before facing it is where the energy leaks.',
      'Stand with the pattern, not against it. What you resist persists. What you face, you can work with.',
    ],
    anti_patterns: ['gentle', 'soft', 'maybe', 'perhaps', 'it seems', 'delicate', 'fragile'],
  },
  fleabag: {
    label: 'Fleabag',
    vocabulary: [
      'fine', 'totally', 'classic', 'honestly', 'look',
      'the thing is', 'which is', 'obviously', 'cool cool cool',
      'absolutely not', 'anyway', 'moving on', 'fun',
      'disaster', 'whole situation', 'love that for you',
    ],
    sentence_patterns: [
      'Statement. Aside to camera. Return to statement.',
      "You said [thing]. Which is [unexpected take] — which is [deeper truth].",
      'Self-aware observation wrapped in casual language.',
      'Parenthetical asides that reveal the actual feeling.',
    ],
    examples: [
      "You said it was fine. Which is usually code for 'I will deal with this later and absolutely not deal with it.'",
      "Look, the week was a disaster but in that fun way where you are still standing so technically it counts as winning.",
      "The pattern is: something goes well, you immediately find a way to undercut it, and then you call it being realistic. Classic.",
      "Honestly? You are handling this. Not well. But handling it. Which is more than most people do.",
    ],
    anti_patterns: ['one must', 'it is evident', 'fundamentally', 'profound', 'sacred', 'vessel'],
  },
  seinfeld: {
    label: 'Seinfeld / Curb',
    vocabulary: [
      'the thing about', 'what is the deal with', 'so', 'apparently',
      'not that there is anything wrong with', 'situation', 'routine',
      'system', 'scheme', 'whole thing', 'bit', 'deal', 'master of',
      'who are these people', 'you know what',
    ],
    sentence_patterns: [
      'What is the deal with [observation]? Who [rhetorical question]?',
      'So you [did thing]. And then [unexpected outcome]. That is a show about nothing.',
      'Observation about mundane detail → exaggeration → punchline truth.',
      'Conversational cadence. Setup, beat, payoff.',
    ],
    examples: [
      'So you did the thing and felt nothing. What is that? Is that a defective experience? Can you return it?',
      "You have a system. The system is: do the same thing every day and hope it starts working. That is not a system. That is a bit.",
      "What is the deal with repeating patterns? You see it happening. You know it is happening. And you just... let it happen. Who does that?",
      "Apparently, you had a good week. But you are suspicious of it. You are suspicious of your own good week. That is a whole situation.",
    ],
    anti_patterns: ['profound', 'deep', 'soul', 'sacred', 'divine', 'spiritual', 'transcend'],
  },
  carlin: {
    label: 'George Carlin',
    vocabulary: [
      'bullshit', 'the owners', 'stuff', 'think about it',
      'here is the thing', 'let me tell you', 'garbage in garbage out',
      'it is all', 'you know what', 'the real', 'what they do not tell you',
      'ever notice', 'the trick is', 'simple',
    ],
    sentence_patterns: [
      'Here is the thing: [blunt observation]. That is not [what you call it]. That is [what it actually is].',
      'You keep [doing X]. That is not [positive spin]. That is [real name for it].',
      'Blunt, short. Strips away the comfortable framing to show the actual thing.',
      'Setup pretends to agree, then pulls the rug.',
    ],
    examples: [
      "You keep showing up to things that give you nothing back. That is not routine. That is a bad deal.",
      "Here is the thing about your pattern: you already know. You have known for a while. The data just made it harder to pretend.",
      "You call it consistency. The data calls it repetition. There is a difference and you know what it is.",
      "The trick is not finding the pattern. The trick is admitting you saw it three weeks ago and kept going.",
    ],
    anti_patterns: ['gentle', 'nurture', 'tender', 'beautiful', 'wonderful', 'healing'],
  },
  sloss: {
    label: 'Daniel Sloss',
    vocabulary: [
      'here is the thing', 'the truth is', 'you know this',
      'look', 'right', 'genuinely', 'actually', 'mate',
      'the problem is not', 'stop', 'that is not',
      'the uncomfortable bit', 'and you know it',
    ],
    sentence_patterns: [
      "You already know [truth]. You are just [avoiding action].",
      'The [thing] is not the problem. The [real thing] is the problem.',
      'Direct statement. No cushioning. Then a beat of empathy.',
      'Blunt truth followed by acknowledgment that hearing it is hard.',
    ],
    examples: [
      "You already know this is not working. You are just delaying what to do about it.",
      "The pattern is clear. You can see it. The uncomfortable bit is that seeing it means you cannot pretend you did not.",
      "Stop calling it a rough patch. It has been the same rough patch for weeks. At some point that is just the patch.",
      "Look, the data is fine. You are fine. But fine is not the same as good, and you know it.",
    ],
    anti_patterns: ['gentle', 'perhaps', 'maybe consider', 'softly', 'tender', 'beautiful'],
  },
  kenny: {
    label: 'Kenny Sebastian',
    vocabulary: [
      'basically', 'like', 'bro', 'the thing is na',
      'you know when', 'that feeling when', 'vibe', 'whole vibe',
      'full on', 'lowkey', 'no but seriously', 'wait wait',
      'classic move', 'relatable', 'mood',
    ],
    sentence_patterns: [
      'You know when [relatable setup]? That. That is what happened.',
      'Statement... pause... slight ramble... actual point.',
      'Gentle observation wrapped in millennial/gen-z casual speech.',
      'Setup that sounds like a complaint but is actually affectionate.',
    ],
    examples: [
      'You went, you did the thing, but internally... buffering.',
      "That feeling when you are doing fine but your brain is like 'are we though?' Classic.",
      'Your week was basically a group project where you did all the work and the emotion just showed up for the presentation.',
      "No but seriously, the pattern is there. It is like that friend who keeps doing the same thing and then goes 'why does this keep happening to me.'",
    ],
    anti_patterns: ['one must', 'it is evident', 'fundamentally', 'moreover', 'thus', 'therefore'],
  },
  virdas: {
    label: 'Vir Das',
    vocabulary: [
      'two things', 'on one hand', 'on the other', 'the irony',
      'only in', 'welcome to', 'beautifully', 'tragically',
      'the country', 'the system', 'we', 'somehow',
      'and also', 'both', 'simultaneously',
    ],
    sentence_patterns: [
      'You are [positive thing] and also [contradicting thing]. Both are true.',
      'The [pattern] is [one thing]. But it is also [different thing]. That is not a bug.',
      'Punchy one-liner. Beat. The depth underneath.',
      'Contrasts and dualities held together without resolving them.',
    ],
    examples: [
      "You are doing all the right things. Unfortunately, they are not working for you.",
      "Your week was productive and exhausting. Both true. Neither cancels the other out.",
      "The pattern says you are fine. Your body says otherwise. Welcome to the committee meeting inside you.",
      "You managed everything beautifully and felt nothing for it. That is not failure. That is just Tuesday being honest.",
    ],
    anti_patterns: ['sacred', 'divine', 'vessel', 'ethereal', 'luminous', 'transcend'],
  },
};

/**
 * All valid style IDs (excluding 'default' which means no style).
 */
export const STYLE_IDS = Object.keys(PROFILES);

/**
 * Full list including default, for UI dropdowns.
 * Returns [{ id, label }]
 */
export const STYLE_OPTIONS = [
  { id: 'default', label: 'Default (System Voice)' },
  ...STYLE_IDS.map(id => ({ id, label: PROFILES[id].label })),
];

/**
 * Build a style instruction block to append to system prompts.
 * Returns '' for 'default' or unknown IDs.
 *
 * Uses vocabulary dictionaries, sentence patterns, and multiple examples
 * to give the LLM an actual voice to mimic rather than just adjectives.
 */
export function getStylePrompt(styleId) {
  if (!styleId || styleId === 'default') return '';
  const p = PROFILES[styleId];
  if (!p) return '';

  const vocabStr = p.vocabulary.slice(0, 12).map(v => `"${v}"`).join(', ');
  const patternsStr = p.sentence_patterns.map(s => `  • ${s}`).join('\n');
  const examplesStr = p.examples.map((e, i) => `  ${i + 1}. "${e}"`).join('\n');
  const antiStr = p.anti_patterns.map(a => `"${a}"`).join(', ');

  return [
    '',
    `VOICE STYLE: Write in the voice of ${p.label}. This is a rendering layer — do not distort data, exaggerate negativity, invent signals, or override recommendations.`,
    '',
    `Characteristic vocabulary (use naturally, not forced):`,
    `  ${vocabStr}`,
    '',
    `Sentence patterns to follow:`,
    patternsStr,
    '',
    `Example outputs in this voice:`,
    examplesStr,
    '',
    `Words/phrases to AVOID in this voice:`,
    `  ${antiStr}`,
    '',
    `Rules: Stay within word limit. Maintain psychological safety. Do not invent facts. Match the cadence and word choices above, not just the "vibe". The voice should be recognizable.`,
  ].join('\n');
}

/**
 * Post-process LLM output to validate it matches the selected style.
 * Returns { text, styleScore, warnings }.
 *
 * - Strips anti-pattern words from the output
 * - Checks if any vocabulary markers appear (style adherence)
 * - Returns warnings if the output does not match the voice
 */
export function validateStyle(text, styleId) {
  if (!styleId || styleId === 'default') return { text, styleScore: 1, warnings: [] };
  const p = PROFILES[styleId];
  if (!p) return { text, styleScore: 1, warnings: [] };

  let cleaned = text;
  const warnings = [];

  // Strip anti-pattern words
  for (const ap of p.anti_patterns) {
    const regex = new RegExp(`\\b${ap}\\b`, 'gi');
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').replace(/ {2,}/g, ' ').replace(/ ([.,;:])/g, '$1').trim();
      warnings.push(`Removed anti-pattern word: "${ap}"`);
    }
  }

  // Check vocabulary presence (how many characteristic words/phrases appear)
  let vocabHits = 0;
  for (const v of p.vocabulary) {
    if (cleaned.toLowerCase().includes(v.toLowerCase())) {
      vocabHits++;
    }
  }
  const styleScore = Math.min(1, vocabHits / Math.max(2, Math.ceil(p.vocabulary.length * 0.15)));

  if (styleScore < 0.3) {
    warnings.push(`Low style adherence (${vocabHits}/${p.vocabulary.length} vocabulary markers). Output may not sound like ${p.label}.`);
  }

  return { text: cleaned, styleScore, warnings };
}
