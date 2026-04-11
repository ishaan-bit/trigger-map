#!/usr/bin/env node
/**
 * Emotion mapping regression tests.
 * Run: node scripts/test-emotions.mjs
 *
 * Tests that coordinatesToLegacy correctly maps every quadrant of the
 * valence×arousal space to an appropriate legacy emotion label.
 * Exits with code 1 on any failure.
 */

import { coordinatesToLegacy, derivedEmotionLabel } from "../shared/constants/emotions.js";

const CASES = [
  // ── Q2: negative valence, positive arousal → anxious ──
  { v: -0.7,  a:  0.8,  expect: "anxious",    desc: "classic anxious" },
  { v: -0.3,  a:  0.8,  expect: "anxious",     desc: "mild neg, very high arousal" },
  { v: -0.5,  a:  0.75, expect: "anxious",     desc: "negative, above 0.7" },
  { v: -0.9,  a:  0.9,  expect: "anxious",     desc: "extreme anxious" },

  // ── Q3: negative valence, negative arousal → frustrated ──
  { v: -0.86, a: -0.71, expect: "frustrated",  desc: "drained/disappointed" },
  { v: -0.65, a: -0.50, expect: "frustrated",  desc: "low/heavy" },
  { v: -0.88, a: -0.68, expect: "frustrated",  desc: "very drained" },
  { v: -0.86, a: -0.53, expect: "frustrated",  desc: "depleted" },
  { v: -0.5,  a: -0.4,  expect: "frustrated",  desc: "moderate negative low" },
  { v: -0.3,  a: -0.8,  expect: "frustrated",  desc: "low energy negative" },

  // ── Negative valence, mid arousal → frustrated ──
  { v: -0.6,  a:  0.6,  expect: "frustrated",  desc: "classic frustrated" },
  { v: -0.85, a:  0.21, expect: "frustrated",  desc: "negative mid arousal" },
  { v: -0.5,  a:  0.3,  expect: "frustrated",  desc: "negative slight high" },
  { v: -0.4,  a:  0.65, expect: "frustrated",  desc: "negative below 0.7 cutoff" },

  // ── Q1: positive valence, positive arousal → energized ──
  { v:  0.7,  a:  0.7,  expect: "energized",   desc: "classic energized" },
  { v:  0.4,  a:  0.3,  expect: "energized",   desc: "mildly positive high" },
  { v:  0.5,  a:  0.1,  expect: "energized",   desc: "positive with slight arousal" },

  // ── Q4: positive valence, negative arousal → calm ──
  { v:  0.6,  a: -0.5,  expect: "calm",        desc: "classic calm" },
  { v:  0.3,  a: -0.3,  expect: "calm",        desc: "mildly positive low" },
  { v:  0.5,  a: -0.5,  expect: "calm",        desc: "positive low energy" },

  // ── Center → neutral ──
  { v:  0.0,  a:  0.0,  expect: "neutral",     desc: "dead center" },
  { v:  0.1,  a:  0.1,  expect: "neutral",     desc: "near center" },
  { v: -0.1,  a: -0.1,  expect: "neutral",     desc: "slightly negative center" },
  { v:  0.15, a: -0.1,  expect: "neutral",     desc: "edge of center" },

  // ── Never-neutral: strongly negative coordinates must NOT be neutral ──
  { v: -0.4,  a: -0.6,  never: "neutral",      desc: "clearly negative, never neutral" },
  { v: -0.8,  a:  0.0,  never: "neutral",      desc: "strong negative, zero arousal" },
  { v: -0.6,  a: -0.3,  never: "neutral",      desc: "moderate negative, never neutral" },
  { v: -0.9,  a: -0.9,  never: "neutral",      desc: "extreme negative, never neutral" },
  { v:  0.5,  a:  0.5,  never: "neutral",      desc: "clearly positive, never neutral" },
  { v:  0.5,  a: -0.5,  never: "neutral",      desc: "clearly positive low, never neutral" },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const result = coordinatesToLegacy(c.v, c.a);

  if (c.expect) {
    if (result === c.expect) {
      pass++;
    } else {
      console.error(`FAIL  v=${c.v} a=${c.a} (${c.desc}): got "${result}", expected "${c.expect}"`);
      fail++;
    }
  } else if (c.never) {
    if (result !== c.never) {
      pass++;
    } else {
      console.error(`FAIL  v=${c.v} a=${c.a} (${c.desc}): got "${result}", must NOT be "${c.never}"`);
      fail++;
    }
  }
}

// ── Exhaustive quadrant sweep ──
// Sweep every 0.1 step across the full -1..+1 plane and verify:
//   - No strongly negative coordinates map to neutral
//   - No strongly positive coordinates map to anxious/frustrated
let sweepFail = 0;
for (let v = -1.0; v <= 1.0; v += 0.1) {
  for (let a = -1.0; a <= 1.0; a += 0.1) {
    const result = coordinatesToLegacy(v, a);
    const mag = Math.sqrt(v * v + a * a);

    if (mag < 0.25) continue; // center is legitimately neutral

    if (v < -0.3 && result === "neutral") {
      console.error(`SWEEP FAIL  v=${v.toFixed(1)} a=${a.toFixed(1)} → "${result}" (negative coords should never be neutral)`);
      sweepFail++;
    }
    if (v > 0.3 && (result === "anxious" || result === "frustrated")) {
      console.error(`SWEEP FAIL  v=${v.toFixed(1)} a=${a.toFixed(1)} → "${result}" (positive coords should never be negative emotion)`);
      sweepFail++;
    }
    if (v < -0.3 && (result === "calm" || result === "energized")) {
      console.error(`SWEEP FAIL  v=${v.toFixed(1)} a=${a.toFixed(1)} → "${result}" (negative coords should never be positive emotion)`);
      sweepFail++;
    }
  }
}

console.log(`\nEmotion mapping: ${pass}/${pass + fail} point tests passed`);
console.log(`Quadrant sweep:  ${sweepFail === 0 ? "PASS" : sweepFail + " failures"} (441 coordinate pairs checked)`);

if (fail > 0 || sweepFail > 0) {
  console.error(`\n✗ FAILED — ${fail + sweepFail} total failures`);
  process.exit(1);
} else {
  console.log(`\n✓ ALL PASSED`);
}
