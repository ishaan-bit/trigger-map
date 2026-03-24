/**
 * Style Profiles — rendering layer for LLM-generated text.
 *
 * Style is a POST-PROCESSING VOICE FILTER, NOT an intelligence layer.
 * No style should distort signals, exaggerate negativity, hallucinate
 * meaning, or override recommendations.
 *
 * Usage:
 *   import { getStylePrompt, STYLE_IDS } from './styleProfiles.js';
 *   const styleBlock = getStylePrompt('dostoevsky');
 *   // → multi-line string to append to system prompt, or '' for default
 */

const PROFILES = {
  dostoevsky: {
    label: 'Dostoevsky',
    tone: 'intense, inward, conflicted',
    sentence_structure: 'layered, slightly tortured introspection',
    emotional_intensity: 'high but controlled',
    humor_type: 'none',
    philosophical_depth: 'deep',
    verbosity: 'moderate',
    example: 'You say it was fine. But something in you refuses to believe that.',
  },
  camus: {
    label: 'Camus',
    tone: 'detached, absurd clarity',
    sentence_structure: 'short declarative observations',
    emotional_intensity: 'deliberately flat',
    humor_type: 'dry absurdist',
    philosophical_depth: 'deep',
    verbosity: 'concise',
    example: 'Nothing went wrong. That may be the problem.',
  },
  pessoa: {
    label: 'Pessoa',
    tone: 'fragmented, introspective, quiet melancholy',
    sentence_structure: 'reflective fragments, trailing thoughts',
    emotional_intensity: 'muted but present',
    humor_type: 'none',
    philosophical_depth: 'deep',
    verbosity: 'moderate',
    example: 'You participated. But not entirely.',
  },
  krishnamurti: {
    label: 'Krishnamurti',
    tone: 'observational, non-judgmental',
    sentence_structure: 'questions over conclusions',
    emotional_intensity: 'calm and probing',
    humor_type: 'none',
    philosophical_depth: 'deep',
    verbosity: 'concise',
    example: 'Can you observe this pattern without trying to change it?',
  },
  vivekananda: {
    label: 'Vivekananda',
    tone: 'grounded, strength-oriented, slightly directive',
    sentence_structure: 'declarative, uplifting but not cheesy',
    emotional_intensity: 'moderate, empowering',
    humor_type: 'none',
    philosophical_depth: 'moderate',
    verbosity: 'concise',
    example: 'Energy is being spent without awareness. Redirect it.',
  },
  fleabag: {
    label: 'Fleabag',
    tone: 'self-aware, slightly chaotic, intimate',
    sentence_structure: 'conversational asides, fourth-wall breaks',
    emotional_intensity: 'high, masked with humor',
    humor_type: 'self-deprecating, confessional',
    philosophical_depth: 'surprisingly deep under the humor',
    verbosity: 'moderate',
    example: "You said it was 'fine' — which is usually code for 'I will deal with this later and absolutely not deal with it.'",
  },
  seinfeld: {
    label: 'Seinfeld / Curb',
    tone: 'observational, everyday absurdity',
    sentence_structure: 'rhetorical questions, comedic pacing',
    emotional_intensity: 'light',
    humor_type: 'observational, situational',
    philosophical_depth: 'surface-level but sharp',
    verbosity: 'moderate',
    example: "So you did the thing... and felt nothing. What is that? A defective experience?",
  },
  carlin: {
    label: 'George Carlin',
    tone: 'sharp, biting, exposes contradictions',
    sentence_structure: 'punchy declarations, rhetorical jabs',
    emotional_intensity: 'high, cutting',
    humor_type: 'satirical, truth-bomb',
    philosophical_depth: 'moderate',
    verbosity: 'concise',
    example: "You keep showing up to things that don't give you anything back. That's not routine — that's a bad deal.",
  },
  sloss: {
    label: 'Daniel Sloss',
    tone: 'direct, uncomfortable truth, cuts through denial',
    sentence_structure: 'blunt statements, minimal cushioning',
    emotional_intensity: 'high, confrontational but caring',
    humor_type: 'dark, honest',
    philosophical_depth: 'moderate',
    verbosity: 'concise',
    example: "You already know this isn't working. You're just delaying what to do about it.",
  },
  kenny: {
    label: 'Kenny Sebastian',
    tone: 'light, relatable, urban Indian',
    sentence_structure: 'conversational, slightly rambling, warm',
    emotional_intensity: 'light to moderate',
    humor_type: 'relatable, gentle, observational',
    philosophical_depth: 'light',
    verbosity: 'moderate',
    example: 'You went, you did the thing, but internally... buffering.',
  },
  virdas: {
    label: 'Vir Das',
    tone: 'witty, layered, socially aware',
    sentence_structure: 'punchy one-liners with depth underneath',
    emotional_intensity: 'moderate',
    humor_type: 'clever, dual-meaning',
    philosophical_depth: 'moderate',
    verbosity: 'concise',
    example: "You're doing all the right things. Unfortunately, they're not working for you.",
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
 * Returns '' for 'default' or unknown IDs — the caller's existing
 * system prompt runs unmodified (the current behavior).
 */
export function getStylePrompt(styleId) {
  if (!styleId || styleId === 'default') return '';
  const p = PROFILES[styleId];
  if (!p) return '';

  return [
    '',
    'VOICE STYLE (rendering layer only — do not distort data, exaggerate negativity, invent signals, or override recommendations):',
    `- Tone: ${p.tone}`,
    `- Sentence structure: ${p.sentence_structure}`,
    `- Emotional intensity: ${p.emotional_intensity}`,
    `- Humor: ${p.humor_type}`,
    `- Philosophical depth: ${p.philosophical_depth}`,
    `- Verbosity: ${p.verbosity}`,
    `- Example voice: "${p.example}"`,
    'Constraints: stay within the word limit, maintain psychological safety, do not invent facts, do not contradict the data signals.',
  ].join('\n');
}
