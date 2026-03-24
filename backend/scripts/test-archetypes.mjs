#!/usr/bin/env node
/**
 * Test harness: backfill each personality archetype and generate rule-based insights.
 *
 * Usage:
 *   node scripts/test-archetypes.mjs                    # all archetypes
 *   node scripts/test-archetypes.mjs burnout-candidate   # single archetype
 *
 * Requires: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
 *           (loaded via dotenv from backend/.env)
 */

import "dotenv/config";

// We need the backfill data definitions — replicate here since the ops-console
// module uses its own redis wrapper.  Instead, we call the backfill API or
// directly import the personality arcs.  Simplest: POST to the ops-console.
// But since the ops-console may not be running, we replicate the arc data
// and write directly via the backend redis client.

import { redis, redisKey, pipeline } from "../services/redisClient.js";
import { getWeeklyAggregates } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { generateInsight } from "../ai/generateInsight.js";
import { buildSignalProfile, rankSignals, detectRelationship } from "../ai/signalProfile.js";
import { randomUUID } from "node:crypto";

const TEST_OWNER = "test-archetype-runner-00000000";
const AGGREGATE_TTL = 60 * 60 * 24 * 45;

// ── Personality arcs (copied from ops-console backfill-demo.js) ────────────

const PERSONALITIES = {
  "burnout-candidate": {
    label: "Burnout Candidate",
    arcs: [
      {
        name: "burnout-a-pressure-cycle",
        moments: [
          { dayOffset: 0, hour: 8, trigger: "work", emotion: "frustrated", note: "Back-to-back meetings, no time to breathe", tags: ["meetings"] },
          { dayOffset: 0, hour: 13, trigger: "work", emotion: "anxious", note: "Deadline moved up again", tags: ["deadline"] },
          { dayOffset: 0, hour: 21, trigger: "alone", emotion: "frustrated", note: "Too tired to do anything, just staring at the wall" },
          { dayOffset: 1, hour: 8, trigger: "work", emotion: "anxious", note: "Woke up already dreading the day" },
          { dayOffset: 1, hour: 18, trigger: "exercise", emotion: "neutral", note: "Forced myself to walk, felt nothing" },
          { dayOffset: 2, hour: 9, trigger: "work", emotion: "frustrated", note: "More firefighting, zero progress on actual work", tags: ["meetings"] },
          { dayOffset: 2, hour: 20, trigger: "partner", emotion: "frustrated", note: "Snapped over something small" },
          { dayOffset: 3, hour: 10, trigger: "work", emotion: "anxious", note: "Performance review coming up", tags: ["deadline"] },
          { dayOffset: 3, hour: 19, trigger: "social", emotion: "neutral", note: "Cancelled dinner plans, stayed home" },
          { dayOffset: 4, hour: 9, trigger: "money", emotion: "anxious", note: "Rent increase on top of everything" },
          { dayOffset: 4, hour: 16, trigger: "health", emotion: "anxious", note: "Headaches all week, probably stress" },
          { dayOffset: 5, hour: 10, trigger: "alone", emotion: "calm", note: "Slept in, first rest in days" },
          { dayOffset: 6, hour: 8, trigger: "work", emotion: "frustrated", note: "Sunday dread already kicking in" },
        ],
      },
    ],
  },

  "steady-achiever": {
    label: "Steady Achiever",
    arcs: [
      {
        name: "steady-a-strong-routine",
        moments: [
          { dayOffset: 0, hour: 7, trigger: "exercise", emotion: "energized", note: "Morning run, best way to start the week", tags: ["morning-routine"] },
          { dayOffset: 0, hour: 14, trigger: "work", emotion: "calm", note: "Productive deep-work block" },
          { dayOffset: 1, hour: 8, trigger: "work", emotion: "neutral", note: "Standard day, knocked out my tasks" },
          { dayOffset: 1, hour: 18, trigger: "exercise", emotion: "calm", note: "Evening walk, watching the sunset" },
          { dayOffset: 2, hour: 9, trigger: "work", emotion: "calm", note: "Good feedback on my presentation" },
          { dayOffset: 2, hour: 12, trigger: "social", emotion: "energized", note: "Lunch with a colleague, great conversation", tags: ["lunch"] },
          { dayOffset: 3, hour: 7, trigger: "exercise", emotion: "energized", note: "New personal best on my run", tags: ["morning-routine"] },
          { dayOffset: 3, hour: 15, trigger: "work", emotion: "frustrated", note: "Annoying blocker, but sorted it out" },
          { dayOffset: 4, hour: 10, trigger: "alone", emotion: "calm", note: "Reading with coffee, quiet morning" },
          { dayOffset: 4, hour: 16, trigger: "family", emotion: "energized", note: "Video call with sister, catching up" },
          { dayOffset: 5, hour: 8, trigger: "exercise", emotion: "energized", note: "Saturday long run, feeling alive", tags: ["morning-routine"] },
          { dayOffset: 5, hour: 14, trigger: "partner", emotion: "calm", note: "Cooking together, nice afternoon" },
          { dayOffset: 6, hour: 10, trigger: "health", emotion: "calm", note: "Meal prepped for the week, feeling organized" },
        ],
      },
    ],
  },

  "social-butterfly": {
    label: "Social Butterfly",
    arcs: [
      {
        name: "social-a-people-powered",
        moments: [
          { dayOffset: 0, hour: 9, trigger: "work", emotion: "neutral", note: "Solo tasks all morning, felt flat" },
          { dayOffset: 0, hour: 12, trigger: "social", emotion: "energized", note: "Lunch with team, brainstormed ideas" },
          { dayOffset: 0, hour: 20, trigger: "social", emotion: "energized", note: "Drinks with friends after work" },
          { dayOffset: 1, hour: 8, trigger: "alone", emotion: "anxious", note: "Working from home alone, walls closing in" },
          { dayOffset: 1, hour: 18, trigger: "social", emotion: "energized", note: "Called a friend, mood flipped instantly" },
          { dayOffset: 2, hour: 10, trigger: "work", emotion: "calm", note: "Collaboration meeting, the good kind" },
          { dayOffset: 2, hour: 19, trigger: "partner", emotion: "calm", note: "Movie night, low-key and nice" },
          { dayOffset: 3, hour: 9, trigger: "alone", emotion: "frustrated", note: "Another solo day, cabin fever" },
          { dayOffset: 3, hour: 13, trigger: "social", emotion: "energized", note: "Impromptu coffee run with a colleague" },
          { dayOffset: 3, hour: 20, trigger: "social", emotion: "energized", note: "Game night with the usual crew" },
          { dayOffset: 4, hour: 10, trigger: "family", emotion: "energized", note: "Sibling visit, so much energy" },
          { dayOffset: 5, hour: 11, trigger: "alone", emotion: "anxious", note: "Saturday alone, felt restless" },
          { dayOffset: 5, hour: 17, trigger: "social", emotion: "energized", note: "House party, exactly what I needed" },
          { dayOffset: 6, hour: 10, trigger: "exercise", emotion: "calm", note: "Group yoga class" },
        ],
      },
    ],
  },

  "relationship-focused": {
    label: "Relationship-Focused",
    arcs: [
      {
        name: "relationship-a-ups-and-downs",
        moments: [
          { dayOffset: 0, hour: 8, trigger: "work", emotion: "neutral", note: "Uneventful morning" },
          { dayOffset: 0, hour: 20, trigger: "partner", emotion: "frustrated", note: "Argument about plans this weekend" },
          { dayOffset: 1, hour: 9, trigger: "work", emotion: "anxious", note: "Distracted, replaying last night in my head" },
          { dayOffset: 1, hour: 19, trigger: "partner", emotion: "calm", note: "Talked it through, found middle ground" },
          { dayOffset: 2, hour: 7, trigger: "exercise", emotion: "calm", note: "Morning walk to clear my head" },
          { dayOffset: 2, hour: 18, trigger: "partner", emotion: "energized", note: "Cooked dinner together, felt close" },
          { dayOffset: 3, hour: 10, trigger: "family", emotion: "calm", note: "Call with mom, grounding" },
          { dayOffset: 3, hour: 21, trigger: "partner", emotion: "frustrated", note: "Same issue resurfaced" },
          { dayOffset: 4, hour: 9, trigger: "work", emotion: "neutral", note: "Threw myself into work as distraction" },
          { dayOffset: 4, hour: 19, trigger: "partner", emotion: "calm", note: "Apologized, things feel better" },
          { dayOffset: 5, hour: 10, trigger: "family", emotion: "energized", note: "Family brunch, warm and easy" },
          { dayOffset: 5, hour: 16, trigger: "partner", emotion: "energized", note: "Afternoon walk together, really connecting" },
          { dayOffset: 6, hour: 9, trigger: "alone", emotion: "calm", note: "Some space, both needed it" },
        ],
      },
    ],
  },

  "wellness-warrior": {
    label: "Wellness Warrior",
    arcs: [
      {
        name: "wellness-a-peak-performance",
        moments: [
          { dayOffset: 0, hour: 6, trigger: "exercise", emotion: "energized", note: "5am run, sunrise was incredible" },
          { dayOffset: 0, hour: 12, trigger: "work", emotion: "calm", note: "Focused morning, productivity high" },
          { dayOffset: 0, hour: 19, trigger: "health", emotion: "calm", note: "Meal prepped all evening, feels organized" },
          { dayOffset: 1, hour: 6, trigger: "exercise", emotion: "energized", note: "HIIT class, pushed hard" },
          { dayOffset: 1, hour: 14, trigger: "work", emotion: "anxious", note: "Surprise all-hands meeting, reorg rumors" },
          { dayOffset: 1, hour: 20, trigger: "health", emotion: "calm", note: "Long bath, letting the stress go" },
          { dayOffset: 2, hour: 7, trigger: "exercise", emotion: "calm", note: "Gentle recovery swim" },
          { dayOffset: 2, hour: 15, trigger: "social", emotion: "energized", note: "Post-gym smoothie with friends" },
          { dayOffset: 3, hour: 6, trigger: "exercise", emotion: "energized", note: "Trail run, nature therapy" },
          { dayOffset: 3, hour: 17, trigger: "alone", emotion: "calm", note: "Stretching on the porch, birds chirping" },
          { dayOffset: 4, hour: 7, trigger: "exercise", emotion: "energized", note: "CrossFit, new PR on deadlift" },
          { dayOffset: 4, hour: 13, trigger: "work", emotion: "neutral", note: "Meetings but manageable" },
          { dayOffset: 5, hour: 8, trigger: "exercise", emotion: "energized", note: "Saturday long run with running club" },
          { dayOffset: 5, hour: 14, trigger: "health", emotion: "energized", note: "Tried a new healthy recipe, nailed it" },
          { dayOffset: 6, hour: 9, trigger: "health", emotion: "calm", note: "Restful Sunday, active recovery" },
        ],
      },
    ],
  },

  "delayed-crash": {
    label: "Delayed Crash",
    arcs: [
      {
        name: "delayed-crash-a-lagged-collapse",
        moments: [
          { dayOffset: 0, hour: 8, trigger: "work", emotion: "neutral", note: "Handled a heavy workload, felt in control", tags: ["workload"] },
          { dayOffset: 0, hour: 14, trigger: "work", emotion: "neutral", note: "Meetings were dense but manageable" },
          { dayOffset: 1, hour: 8, trigger: "alone", emotion: "frustrated", note: "Woke up exhausted, no energy to do anything" },
          { dayOffset: 1, hour: 18, trigger: "health", emotion: "anxious", note: "Headache won't go away, body is protesting" },
          { dayOffset: 2, hour: 8, trigger: "work", emotion: "neutral", note: "Pushed through another packed day", tags: ["workload"] },
          { dayOffset: 2, hour: 14, trigger: "work", emotion: "neutral", note: "Stayed composed but felt something building" },
          { dayOffset: 3, hour: 9, trigger: "alone", emotion: "frustrated", note: "Everything hit at once, could barely get out of bed" },
          { dayOffset: 3, hour: 19, trigger: "exercise", emotion: "calm", note: "Forced a walk, it helped somewhat" },
          { dayOffset: 4, hour: 9, trigger: "work", emotion: "neutral", note: "Back to autopilot mode", tags: ["workload"] },
          { dayOffset: 4, hour: 20, trigger: "alone", emotion: "anxious", note: "Weekend but too drained to enjoy it" },
          { dayOffset: 5, hour: 10, trigger: "exercise", emotion: "calm", note: "Long walk finally cleared my head" },
          { dayOffset: 5, hour: 17, trigger: "social", emotion: "neutral", note: "Met friends but could not fully engage" },
          { dayOffset: 6, hour: 9, trigger: "alone", emotion: "frustrated", note: "Dreading Monday already, the cycle repeats" },
        ],
      },
    ],
  },

  "false-recovery": {
    label: "False Recovery",
    arcs: [
      {
        name: "false-recovery-a-scrolling-trap",
        moments: [
          { dayOffset: 0, hour: 9, trigger: "work", emotion: "frustrated", note: "Overwhelmed from minute one", tags: ["deadline"] },
          { dayOffset: 0, hour: 20, trigger: "alone", emotion: "neutral", note: "Scrolling through my phone to zone out", tags: ["passive-rest"] },
          { dayOffset: 1, hour: 8, trigger: "alone", emotion: "frustrated", note: "Did not sleep well, woke up worse than yesterday" },
          { dayOffset: 1, hour: 18, trigger: "exercise", emotion: "energized", note: "Finally dragged myself to the gym, huge difference" },
          { dayOffset: 2, hour: 9, trigger: "work", emotion: "calm", note: "Clear-headed after yesterday's workout" },
          { dayOffset: 2, hour: 20, trigger: "alone", emotion: "neutral", note: "Netflix and couch, thought I earned it", tags: ["passive-rest"] },
          { dayOffset: 3, hour: 8, trigger: "alone", emotion: "anxious", note: "Woke up restless, the Netflix did not help" },
          { dayOffset: 3, hour: 18, trigger: "social", emotion: "energized", note: "Drinks with friends, actually laughed for the first time all week" },
          { dayOffset: 4, hour: 9, trigger: "work", emotion: "calm", note: "Felt genuinely better after real connection" },
          { dayOffset: 4, hour: 20, trigger: "alone", emotion: "neutral", note: "Thought I would try relaxing at home again", tags: ["passive-rest"] },
          { dayOffset: 5, hour: 8, trigger: "alone", emotion: "frustrated", note: "Same crash, passive rest just does not work for me" },
          { dayOffset: 5, hour: 16, trigger: "exercise", emotion: "energized", note: "Afternoon bike ride finally broke the cycle" },
          { dayOffset: 6, hour: 8, trigger: "alone", emotion: "anxious", note: "Thought I recovered but feel off again today" },
          { dayOffset: 6, hour: 15, trigger: "social", emotion: "energized", note: "Sunday brunch with friends saved the day" },
        ],
      },
    ],
  },

  "context-split": {
    label: "Context Split",
    arcs: [
      {
        name: "context-split-a-morning-vs-afternoon",
        moments: [
          { dayOffset: 0, hour: 8, trigger: "work", emotion: "calm", note: "Deep work block, headphones on, productive", tags: ["deep-work"] },
          { dayOffset: 0, hour: 14, trigger: "work", emotion: "anxious", note: "Back-to-back afternoon meetings, energy tanked", tags: ["afternoon-meetings"] },
          { dayOffset: 0, hour: 20, trigger: "alone", emotion: "calm", note: "Quiet evening, decompressing" },
          { dayOffset: 1, hour: 8, trigger: "work", emotion: "calm", note: "Morning coding session, in the zone", tags: ["deep-work"] },
          { dayOffset: 1, hour: 14, trigger: "work", emotion: "frustrated", note: "Project review meeting, lots of criticism", tags: ["afternoon-meetings"] },
          { dayOffset: 2, hour: 9, trigger: "work", emotion: "energized", note: "Creative brainstorm, fun collaboration", tags: ["brainstorm"] },
          { dayOffset: 2, hour: 14, trigger: "work", emotion: "anxious", note: "Sprint planning, everything feels urgent", tags: ["afternoon-meetings"] },
          { dayOffset: 2, hour: 19, trigger: "exercise", emotion: "calm", note: "Evening run, needed the release" },
          { dayOffset: 3, hour: 8, trigger: "work", emotion: "calm", note: "Morning focus time, clear progress", tags: ["deep-work"] },
          { dayOffset: 3, hour: 15, trigger: "work", emotion: "frustrated", note: "Another long afternoon meeting, no decisions made", tags: ["afternoon-meetings"] },
          { dayOffset: 4, hour: 8, trigger: "work", emotion: "calm", note: "Wrapping up deliverables solo", tags: ["deep-work"] },
          { dayOffset: 4, hour: 13, trigger: "social", emotion: "energized", note: "Lunch with the team, great energy", tags: ["lunch"] },
          { dayOffset: 5, hour: 9, trigger: "exercise", emotion: "energized", note: "Saturday morning run" },
          { dayOffset: 6, hour: 10, trigger: "family", emotion: "calm", note: "Relaxed Sunday with family" },
        ],
      },
    ],
  },

  "silent-drift": {
    label: "Silent Drift",
    arcs: [
      {
        name: "silent-drift-a-flattening",
        moments: [
          { dayOffset: 0, hour: 8, trigger: "work", emotion: "neutral", note: "Standard day, nothing remarkable" },
          { dayOffset: 0, hour: 18, trigger: "exercise", emotion: "neutral", note: "Went to the gym, felt okay I guess" },
          { dayOffset: 1, hour: 9, trigger: "work", emotion: "neutral", note: "Meetings but whatever" },
          { dayOffset: 1, hour: 20, trigger: "alone", emotion: "neutral", note: "Evening in, scrolling" },
          { dayOffset: 2, hour: 8, trigger: "social", emotion: "neutral", note: "Coffee with a friend, it was fine" },
          { dayOffset: 2, hour: 18, trigger: "work", emotion: "neutral", note: "Wrapped up some tasks" },
          { dayOffset: 3, hour: 9, trigger: "work", emotion: "neutral", note: "Another day, another meeting" },
          { dayOffset: 3, hour: 19, trigger: "partner", emotion: "neutral", note: "Dinner together, quiet night" },
          { dayOffset: 4, hour: 9, trigger: "work", emotion: "anxious", note: "Felt a flash of anxiety out of nowhere" },
          { dayOffset: 4, hour: 19, trigger: "alone", emotion: "anxious", note: "Can not settle, restless but do not know why" },
          { dayOffset: 5, hour: 10, trigger: "exercise", emotion: "neutral", note: "Ran but it felt mechanical" },
          { dayOffset: 5, hour: 17, trigger: "social", emotion: "calm", note: "Met friends, managed to enjoy it a little" },
          { dayOffset: 6, hour: 10, trigger: "alone", emotion: "neutral", note: "Just existing today" },
        ],
      },
    ],
  },
};

// ── Expected insights per archetype ────────────────────────────────────────
// These are the signals we expect the rule-based engine to surface.

const EXPECTED = {
  "burnout-candidate": {
    mustMention: ["work", "frustrated", "anxious"],
    frictionExpected: true,
    regulatorExpected: false,
    toneKeywords: ["stress", "frustrated", "anxious", "friction", "work"],
    whatWorkingShouldNot: ["steady"],
    whereToFocusShouldMention: ["work"],
    description: "Work-dominated friction zones, high frustration+anxiety, exercise barely helps (neutral only). Should NOT say 'steady' or 'balanced'.",
  },
  "steady-achiever": {
    mustMention: ["exercise", "energized"],
    frictionExpected: false,
    regulatorExpected: true,
    toneKeywords: ["steady", "energized", "calm", "exercise"],
    whatWorkingShouldMention: ["exercise"],
    description: "Exercise is a clear regulator (energized). Mostly positive. Should highlight exercise as anchor. May mention the one frustrated moment but shouldn't overweight it.",
  },
  "social-butterfly": {
    mustMention: ["social", "energized"],
    frictionExpected: true,
    regulatorExpected: true,
    toneKeywords: ["social", "energized", "alone", "anxious"],
    whereToFocusShouldMention: ["alone"],
    description: "Social = energized (regulator). Alone = anxious/frustrated (friction). Clear inverse pattern. Should highlight social as anchor and alone as friction.",
  },
  "relationship-focused": {
    mustMention: ["partner"],
    frictionExpected: true,
    regulatorExpected: true,
    toneKeywords: ["partner", "frustrated", "calm", "energized"],
    description: "Partner drives both highs (energized) and lows (frustrated). Family stabilizes. Should show partner as both friction and regulator, or describe the cycling.",
  },
  "wellness-warrior": {
    mustMention: ["exercise", "energized"],
    frictionExpected: false,
    regulatorExpected: true,
    toneKeywords: ["exercise", "energized", "calm", "health"],
    whatWorkingShouldMention: ["exercise"],
    description: "Exercise consistently energizes. Health brings calm. One work-anxiety moment shouldn't dominate. Should feel very positive.",
  },
  "delayed-crash": {
    mustMention: ["work", "neutral", "alone", "frustrated"],
    frictionExpected: true,
    regulatorExpected: false,
    toneKeywords: ["neutral", "frustrated", "alone", "crash"],
    description: "Work appears neutral in-moment, but alone-time crashes follow with frustrated/anxious. Should capture the lagged pattern or at least the alone-frustrated friction.",
  },
  "false-recovery": {
    mustMention: ["alone", "frustrated"],
    frictionExpected: true,
    regulatorExpected: true,
    toneKeywords: ["alone", "frustrated", "exercise", "social", "energized"],
    description: "Alone = frustrated/anxious (friction). Exercise + social = energized (regulators). The passive-rest trap. Should show alone as friction, exercise/social as what works.",
  },
  "context-split": {
    mustMention: ["work"],
    frictionExpected: true,
    regulatorExpected: false,
    toneKeywords: ["work", "calm", "anxious", "frustrated"],
    description: "Work produces both calm (deep work) and anxious/frustrated (meetings). Tags differentiate. Should capture the split or at least mention work appears with mixed feelings.",
  },
  "silent-drift": {
    mustMention: ["neutral"],
    frictionExpected: false,
    regulatorExpected: false,
    toneKeywords: ["neutral", "flat", "narrowing", "flattening"],
    whatWorkingShouldNot: ["steady", "stability"],
    whereToFocusShouldExist: true,
    description: "Nearly everything is neutral. Should detect flattening pattern — emotional range narrowing. Should NOT describe as 'steady' positively.",
  },
};

// ── Backfill logic ─────────────────────────────────────────────────────────

function bucketForHour(hour) {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function ds(date) {
  return date.toISOString().slice(0, 10);
}

async function clearUser(ownerId) {
  const delCmds = [["DEL", redisKey("moments", ownerId)], ["DEL", redisKey("weekly_report", ownerId)]];
  // Delete daily keys for past 60 days
  const now = new Date();
  for (let d = 0; d < 60; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    delCmds.push(["DEL", redisKey("daily", ownerId, ds(dt))]);
  }
  const BATCH_SIZE = 50;
  for (let i = 0; i < delCmds.length; i += BATCH_SIZE) {
    await pipeline(delCmds.slice(i, i + BATCH_SIZE));
  }
}

async function backfillArchetype(ownerId, personality) {
  await clearUser(ownerId);

  const arcs = PERSONALITIES[personality].arcs;
  const arc = arcs[0]; // use first arc

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);

  // Seed 2 weeks for baseline data
  const commands = [];
  commands.push(["SADD", redisKey("owners"), ownerId]);

  for (let w = 0; w < 2; w++) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() - (1 - w) * 7);
    const weekArc = arcs[w % arcs.length];

    for (const m of weekArc.moments) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + m.dayOffset);
      d.setHours(m.hour, Math.floor(Math.random() * 50), 0, 0);
      if (d > now) continue;

      const dateStr = ds(d);
      const dailyKey = redisKey("daily", ownerId, dateStr);
      const pairKey = `${m.trigger}|${m.emotion}`;
      const timeBucket = bucketForHour(m.hour);

      commands.push(["HINCRBY", dailyKey, "total", "1"]);
      commands.push(["HINCRBY", dailyKey, `trigger:${m.trigger}`, "1"]);
      commands.push(["HINCRBY", dailyKey, `emotion:${m.emotion}`, "1"]);
      commands.push(["HINCRBY", dailyKey, `pair:${pairKey}`, "1"]);
      commands.push(["HINCRBY", dailyKey, `time:${timeBucket}`, "1"]);
      commands.push(["HSET", dailyKey, "date", dateStr]);
      commands.push(["EXPIRE", dailyKey, String(AGGREGATE_TTL)]);

      if (m.tags?.length) {
        for (const tag of m.tags) {
          commands.push(["HINCRBY", dailyKey, `tag:${tag}`, "1"]);
        }
      }

      const momentObj = {
        id: randomUUID(),
        ownerId,
        trigger: m.trigger,
        emotion: m.emotion,
        note: m.note || "",
        timestamp: d.toISOString(),
        isAnonymous: false,
        ...(m.tags?.length ? { tags: m.tags } : {}),
      };
      commands.push(["RPUSH", redisKey("moments", ownerId), JSON.stringify(momentObj)]);
    }
  }

  // Execute via pipeline in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < commands.length; i += BATCH_SIZE) {
    await pipeline(commands.slice(i, i + BATCH_SIZE));
  }
}

// ── Test runner ────────────────────────────────────────────────────────────

async function testArchetype(personality) {
  const label = PERSONALITIES[personality].label;
  const expected = EXPECTED[personality];

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label.toUpperCase()} (${personality})`);
  console.log(`${"═".repeat(70)}`);
  console.log(`Expected: ${expected.description}\n`);

  // Backfill
  await backfillArchetype(TEST_OWNER, personality);

  // Generate report
  const aggregates = await getWeeklyAggregates(TEST_OWNER, 45);
  const report = generateWeeklyReport({ aggregates, allAggregates: aggregates });

  // Generate insight
  const insight = await generateInsight(report);

  // Signal profile
  const sp = buildSignalProfile(report);
  const ranked = rankSignals(report, sp);
  const rel = detectRelationship(ranked);

  // Display results
  console.log("── Signal Profile ──");
  console.log(`  volatility: ${sp.volatility} | drift: ${sp.drift} | intensity: ${sp.intensity}`);
  console.log(`  weeklySlope: ${sp.weeklySlope} | isFlattening: ${sp.isFlattening}`);
  console.log(`  dominantEmotion: ${sp.dominantEmotion} | triggerStrength: ${sp.triggerStrength}`);
  console.log(`  primary: ${ranked.primary?.type || "none"} (${ranked.primary?.label || "-"})`);
  console.log(`  secondary: ${ranked.secondary?.type || "none"} (${ranked.secondary?.label || "-"})`);
  console.log(`  relationship: ${rel}`);

  console.log("\n── Key Report Data ──");
  console.log(`  topTrigger: ${report.topTrigger || "tied"} | topEmotion: ${report.topEmotion || "tied"}`);
  console.log(`  totalMoments: ${report.totalMoments} | confidence: ${report.dataQuality?.confidence}`);
  console.log(`  volatilityScore: ${report.volatilityScore?.toFixed(2)} (${report.volatilityLabel})`);
  if (report.regulators?.length) {
    console.log(`  regulators: ${report.regulators.map(r => `${r.trigger}+${r.emotion}(${r.count}x)`).join(", ")}`);
  }
  if (report.frictionZones?.length) {
    console.log(`  frictionZones: ${report.frictionZones.map(f => `${f.trigger}+${f.emotion}(${f.count}x)`).join(", ")}`);
  }
  const emotionFreq = report.emotionFrequency || {};
  console.log(`  emotions: ${Object.entries(emotionFreq).sort(([,a],[,b]) => b - a).map(([e,c]) => `${e}=${c}`).join(", ")}`);
  const triggerFreq = report.triggerFrequency || {};
  console.log(`  triggers: ${Object.entries(triggerFreq).sort(([,a],[,b]) => b - a).map(([t,c]) => `${t}=${c}`).join(", ")}`);

  console.log("\n── SUMMARY ──");
  console.log(`  ${insight.summary}`);

  console.log("\n── WHAT WORKING ──");
  if (insight.whatWorking?.length) {
    for (const item of insight.whatWorking) {
      console.log(`  ✓ ${item.text}`);
    }
  } else {
    console.log("  (none)");
  }

  console.log("\n── WHERE TO FOCUS ──");
  if (insight.whereToFocus?.length) {
    for (const item of insight.whereToFocus) {
      console.log(`  ▸ ${item.text}`);
    }
  } else {
    console.log("  (none)");
  }

  console.log(`\n── STATE: ${insight.stateOfMind || "(none)"} ──`);

  // ── Validation ──
  const issues = [];
  const summaryLower = insight.summary.toLowerCase();
  const allText = [
    insight.summary,
    ...(insight.whatWorking || []).map(w => w.text),
    ...(insight.whereToFocus || []).map(w => w.text),
  ].join(" ").toLowerCase();

  // Check must-mention
  for (const word of (expected.mustMention || [])) {
    if (!allText.includes(word)) {
      issues.push(`MISS: expected "${word}" to appear somewhere in output`);
    }
  }

  // Check friction zones exist when expected
  if (expected.frictionExpected && (!report.frictionZones?.length)) {
    issues.push("MISS: expected friction zones in report but found none");
  }

  // Check regulators exist when expected
  if (expected.regulatorExpected && (!report.regulators?.length)) {
    issues.push("MISS: expected regulators in report but found none");
  }

  // Check what-working should mention
  if (expected.whatWorkingShouldMention) {
    const wwText = (insight.whatWorking || []).map(w => w.text).join(" ").toLowerCase();
    for (const word of expected.whatWorkingShouldMention) {
      if (!wwText.includes(word)) {
        issues.push(`MISS: What Working should mention "${word}"`);
      }
    }
  }

  // Check what-working should NOT mention
  if (expected.whatWorkingShouldNot) {
    const wwText = (insight.whatWorking || []).map(w => w.text).join(" ").toLowerCase();
    for (const word of expected.whatWorkingShouldNot) {
      if (wwText.includes(word)) {
        issues.push(`BAD: What Working should NOT mention "${word}"`);
      }
    }
  }

  // Check where-to-focus should mention  
  if (expected.whereToFocusShouldMention) {
    const wfText = (insight.whereToFocus || []).map(w => w.text).join(" ").toLowerCase();
    for (const word of expected.whereToFocusShouldMention) {
      if (!wfText.includes(word)) {
        issues.push(`MISS: Where To Focus should mention "${word}"`);
      }
    }
  }

  // Check where-to-focus should exist at all
  if (expected.whereToFocusShouldExist && (!insight.whereToFocus?.length)) {
    issues.push("MISS: Where To Focus should have at least one item");
  }

  if (issues.length === 0) {
    console.log("\n  ✅ PASS — all expectations met");
  } else {
    console.log(`\n  ❌ ISSUES (${issues.length}):`);
    for (const issue of issues) {
      console.log(`     ${issue}`);
    }
  }

  return { personality, label, issues, summary: insight.summary };
}

// ── Main ───────────────────────────────────────────────────────────────────

const selected = process.argv[2];
const personalities = selected
  ? [selected]
  : Object.keys(PERSONALITIES);

if (selected && !PERSONALITIES[selected]) {
  console.error(`Unknown personality: ${selected}`);
  console.error(`Available: ${Object.keys(PERSONALITIES).join(", ")}`);
  process.exit(1);
}

console.log(`Testing ${personalities.length} archetype(s)...\n`);

const results = [];
for (const p of personalities) {
  const result = await testArchetype(p);
  results.push(result);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n\n${"═".repeat(70)}`);
console.log("  FINAL SCORECARD");
console.log(`${"═".repeat(70)}`);
for (const r of results) {
  const status = r.issues.length === 0 ? "✅ PASS" : `❌ FAIL (${r.issues.length})`;
  console.log(`  ${status}  ${r.label}`);
  if (r.issues.length > 0) {
    for (const issue of r.issues) {
      console.log(`           ${issue}`);
    }
  }
}

// Cleanup
await clearUser(TEST_OWNER);
console.log("\n(Test user data cleaned up)");

const totalIssues = results.reduce((s, r) => s + r.issues.length, 0);
process.exit(totalIssues > 0 ? 1 : 0);
