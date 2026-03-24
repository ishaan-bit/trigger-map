import { requireAuth } from '../../../lib/auth.js';
import { pipeline, redisKey, keys, redis } from '../../../lib/redis.js';
import { randomUUID } from 'node:crypto';

/**
 * POST /api/control/backfill-demo
 *
 * Body: { ownerIds: string[], weeks: number, personality: string }
 *
 * Generates curated demo moments for the specified accounts going back
 * `weeks` weeks from today.  A `personality` type determines the emotional
 * patterns seeded — each type has 2 arc variants that alternate across
 * weeks so multi-week backfills aren't identical repetitions.
 *
 * Data is written directly to Redis daily aggregates (same format the
 * mobile app produces) so the full insight pipeline works on it.
 */

const AGGREGATE_TTL = 60 * 60 * 24 * 45;

// ── Personality-based weekly arcs ──────────────────────────────────────────
// Each personality has a distinct emotional signature with 2 arc variants.
// ~13 moments per week across 6-7 days.

const PERSONALITIES = {
  'burnout-candidate': {
    label: 'Burnout Candidate',
    description: 'Work-dominated stress, declining energy, exercise barely helps',
    arcs: [
      {
        name: 'burnout-a-pressure-cycle',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Back-to-back meetings, no time to breathe', tags: ['meetings'] },
          { dayOffset: 0, hour: 13, trigger: 'work',     emotion: 'anxious',    note: 'Deadline moved up again', tags: ['deadline'] },
          { dayOffset: 0, hour: 21, trigger: 'alone',    emotion: 'frustrated', note: 'Too tired to do anything, just staring at the wall' },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'anxious',    note: 'Woke up already dreading the day' },
          { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'neutral',    note: 'Forced myself to walk, felt nothing' },
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'frustrated', note: 'More firefighting, zero progress on actual work', tags: ['meetings'] },
          { dayOffset: 2, hour: 20, trigger: 'partner',   emotion: 'frustrated', note: 'Snapped over something small' },
          { dayOffset: 3, hour: 10, trigger: 'work',     emotion: 'anxious',    note: 'Performance review coming up', tags: ['deadline'] },
          { dayOffset: 3, hour: 19, trigger: 'social',    emotion: 'neutral',    note: 'Cancelled dinner plans, stayed home' },
          { dayOffset: 4, hour: 9,  trigger: 'money',     emotion: 'anxious',    note: 'Rent increase on top of everything' },
          { dayOffset: 4, hour: 16, trigger: 'health',   emotion: 'anxious',    note: 'Headaches all week, probably stress' },
          { dayOffset: 5, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Slept in, first rest in days' },
          { dayOffset: 6, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Sunday dread already kicking in' },
        ],
      },
      {
        name: 'burnout-b-weekend-crash',
        moments: [
          { dayOffset: 0, hour: 7,  trigger: 'work',     emotion: 'anxious',    note: 'Inbox full before 8am' },
          { dayOffset: 0, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Short run, small relief' },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'frustrated', note: 'Project scope creep, nobody listens' },
          { dayOffset: 1, hour: 21, trigger: 'money',     emotion: 'frustrated', note: 'Unexpected bill, feels like everything piles up' },
          { dayOffset: 2, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Third day of meetings with no decisions' },
          { dayOffset: 2, hour: 17, trigger: 'family',   emotion: 'neutral',    note: 'Quick call with mom, kept it short' },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Boss added another task, plate is full' },
          { dayOffset: 3, hour: 20, trigger: 'partner',   emotion: 'calm',       note: 'Talked about how I am feeling, helped a bit' },
          { dayOffset: 4, hour: 10, trigger: 'work',     emotion: 'frustrated', note: 'Friday and still buried' },
          { dayOffset: 4, hour: 19, trigger: 'social',    emotion: 'neutral',    note: 'Went out but felt disconnected' },
          { dayOffset: 5, hour: 11, trigger: 'alone',    emotion: 'frustrated', note: 'Wasted Saturday doing nothing, felt guilty' },
          { dayOffset: 5, hour: 17, trigger: 'health',   emotion: 'anxious',    note: 'Barely eating, running on caffeine' },
          { dayOffset: 6, hour: 9,  trigger: 'exercise',  emotion: 'neutral',    note: 'Tried yoga, mind kept wandering to work' },
        ],
      },
    ],
  },

  'steady-achiever': {
    label: 'Steady Achiever',
    description: 'Balanced routines, exercise is a strong regulator, mostly positive',
    arcs: [
      {
        name: 'steady-a-strong-routine',
        moments: [
          { dayOffset: 0, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Morning run, best way to start the week', tags: ['morning-routine'] },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Productive deep-work block' },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Standard day, knocked out my tasks' },
          { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Evening walk, watching the sunset' },
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Good feedback on my presentation' },
          { dayOffset: 2, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Lunch with a colleague, great conversation', tags: ['lunch'] },
          { dayOffset: 3, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'New personal best on my run', tags: ['morning-routine'] },
          { dayOffset: 3, hour: 15, trigger: 'work',     emotion: 'frustrated', note: 'Annoying blocker, but sorted it out' },
          { dayOffset: 4, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Reading with coffee, quiet morning' },
          { dayOffset: 4, hour: 16, trigger: 'family',   emotion: 'energized',  note: 'Video call with sister, catching up' },
          { dayOffset: 5, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Saturday long run, feeling alive', tags: ['morning-routine'] },
          { dayOffset: 5, hour: 14, trigger: 'partner',   emotion: 'calm',       note: 'Cooking together, nice afternoon' },
          { dayOffset: 6, hour: 10, trigger: 'health',   emotion: 'calm',       note: 'Meal prepped for the week, feeling organized' },
        ],
      },
      {
        name: 'steady-b-midweek-dip',
        moments: [
          { dayOffset: 0, hour: 7,  trigger: 'exercise',  emotion: 'calm',       note: 'Gentle yoga to ease into Monday' },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Clear priorities, focused day' },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Meetings but manageable' },
          { dayOffset: 1, hour: 19, trigger: 'partner',   emotion: 'energized',  note: 'Date night, really needed that' },
          { dayOffset: 2, hour: 8,  trigger: 'work',     emotion: 'anxious',    note: 'Unexpected deadline, had to scramble' },
          { dayOffset: 2, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Gym session took the edge off' },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Bounced back, wrapped up the deliverable' },
          { dayOffset: 3, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Coffee catch-up, laughed a lot' },
          { dayOffset: 4, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Friday morning swim, pure energy' },
          { dayOffset: 4, hour: 15, trigger: 'work',     emotion: 'calm',       note: 'Wrapped up the week on a high note' },
          { dayOffset: 5, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Journaling in the park' },
          { dayOffset: 5, hour: 17, trigger: 'family',   emotion: 'calm',       note: 'Helped parents with garden' },
          { dayOffset: 6, hour: 9,  trigger: 'exercise',  emotion: 'energized',  note: 'Long hike, recharged for the week' },
          { dayOffset: 6, hour: 18, trigger: 'health',   emotion: 'calm',       note: 'Early dinner, early bed' },
        ],
      },
    ],
  },

  'social-butterfly': {
    label: 'Social Butterfly',
    description: 'Energized by people, solo time is draining, social-dominant',
    arcs: [
      {
        name: 'social-a-people-powered',
        moments: [
          { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Solo tasks all morning, felt flat' },
          { dayOffset: 0, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Lunch with team, brainstormed ideas' },
          { dayOffset: 0, hour: 20, trigger: 'social',    emotion: 'energized',  note: 'Drinks with friends after work' },
          { dayOffset: 1, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Working from home alone, walls closing in' },
          { dayOffset: 1, hour: 18, trigger: 'social',    emotion: 'energized',  note: 'Called a friend, mood flipped instantly' },
          { dayOffset: 2, hour: 10, trigger: 'work',     emotion: 'calm',       note: 'Collaboration meeting, the good kind' },
          { dayOffset: 2, hour: 19, trigger: 'partner',   emotion: 'calm',       note: 'Movie night, low-key and nice' },
          { dayOffset: 3, hour: 9,  trigger: 'alone',    emotion: 'frustrated', note: 'Another solo day, cabin fever' },
          { dayOffset: 3, hour: 13, trigger: 'social',    emotion: 'energized',  note: 'Impromptu coffee run with a colleague' },
          { dayOffset: 3, hour: 20, trigger: 'social',    emotion: 'energized',  note: 'Game night with the usual crew' },
          { dayOffset: 4, hour: 10, trigger: 'family',   emotion: 'energized',  note: 'Sibling visit, so much energy' },
          { dayOffset: 5, hour: 11, trigger: 'alone',    emotion: 'anxious',    note: 'Saturday alone, felt restless' },
          { dayOffset: 5, hour: 17, trigger: 'social',    emotion: 'energized',  note: 'House party, exactly what I needed' },
          { dayOffset: 6, hour: 10, trigger: 'exercise',  emotion: 'calm',       note: 'Group yoga class' },
        ],
      },
      {
        name: 'social-b-connecting-week',
        moments: [
          { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Quiet office, everyone remote' },
          { dayOffset: 0, hour: 19, trigger: 'social',    emotion: 'energized',  note: 'Spontaneous dinner with neighbors' },
          { dayOffset: 1, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Coworking space, buzzing energy' },
          { dayOffset: 1, hour: 21, trigger: 'alone',    emotion: 'frustrated', note: 'Evening alone felt too long' },
          { dayOffset: 2, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Group run with the running club' },
          { dayOffset: 2, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Pair programming, actually enjoyable' },
          { dayOffset: 3, hour: 10, trigger: 'family',   emotion: 'calm',       note: 'Long call with cousin' },
          { dayOffset: 3, hour: 19, trigger: 'social',    emotion: 'energized',  note: 'Open mic night, incredible vibe' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Heads-down day, manageable' },
          { dayOffset: 4, hour: 20, trigger: 'social',    emotion: 'energized',  note: 'Friday hangout, laughing until midnight' },
          { dayOffset: 5, hour: 10, trigger: 'alone',    emotion: 'anxious',    note: 'Everyone busy, scrolling aimlessly' },
          { dayOffset: 5, hour: 16, trigger: 'partner',   emotion: 'energized',  note: 'Surprise visit, best part of the day' },
          { dayOffset: 6, hour: 11, trigger: 'social',    emotion: 'energized',  note: 'Brunch with the group' },
        ],
      },
    ],
  },

  'relationship-focused': {
    label: 'Relationship-Focused',
    description: 'Partner interactions drive mood swings, family is stabilizing',
    arcs: [
      {
        name: 'relationship-a-ups-and-downs',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Uneventful morning' },
          { dayOffset: 0, hour: 20, trigger: 'partner',   emotion: 'frustrated', note: 'Argument about plans this weekend' },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Distracted, replaying last night in my head' },
          { dayOffset: 1, hour: 19, trigger: 'partner',   emotion: 'calm',       note: 'Talked it through, found middle ground' },
          { dayOffset: 2, hour: 7,  trigger: 'exercise',  emotion: 'calm',       note: 'Morning walk to clear my head' },
          { dayOffset: 2, hour: 18, trigger: 'partner',   emotion: 'energized',  note: 'Cooked dinner together, felt close' },
          { dayOffset: 3, hour: 10, trigger: 'family',   emotion: 'calm',       note: 'Call with mom, grounding' },
          { dayOffset: 3, hour: 21, trigger: 'partner',   emotion: 'frustrated', note: 'Same issue resurfaced' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Threw myself into work as distraction' },
          { dayOffset: 4, hour: 19, trigger: 'partner',   emotion: 'calm',       note: 'Apologized, things feel better' },
          { dayOffset: 5, hour: 10, trigger: 'family',   emotion: 'energized',  note: 'Family brunch, warm and easy' },
          { dayOffset: 5, hour: 16, trigger: 'partner',   emotion: 'energized',  note: 'Afternoon walk together, really connecting' },
          { dayOffset: 6, hour: 9,  trigger: 'alone',    emotion: 'calm',       note: 'Some space, both needed it' },
        ],
      },
      {
        name: 'relationship-b-reconnecting',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'partner',   emotion: 'anxious',    note: 'Tension from the weekend still lingering' },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Work was a welcome distraction' },
          { dayOffset: 1, hour: 9,  trigger: 'family',   emotion: 'calm',       note: 'Talked to dad about everything' },
          { dayOffset: 1, hour: 20, trigger: 'partner',   emotion: 'calm',       note: 'Watched a show together, quiet but nice' },
          { dayOffset: 2, hour: 10, trigger: 'work',     emotion: 'neutral',    note: 'Regular day, nothing remarkable' },
          { dayOffset: 2, hour: 18, trigger: 'partner',   emotion: 'energized',  note: 'Spontaneous date night, felt the spark' },
          { dayOffset: 3, hour: 8,  trigger: 'exercise',  emotion: 'calm',       note: 'Ran together for the first time in weeks' },
          { dayOffset: 3, hour: 19, trigger: 'partner',   emotion: 'energized',  note: 'Deep conversation about future plans' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Stressful meeting but came home to comfort' },
          { dayOffset: 4, hour: 20, trigger: 'partner',   emotion: 'calm',       note: 'Just being together, no agenda' },
          { dayOffset: 5, hour: 10, trigger: 'family',   emotion: 'energized',  note: 'Both families got together, great day' },
          { dayOffset: 5, hour: 17, trigger: 'alone',    emotion: 'calm',       note: 'Some me-time in the evening' },
          { dayOffset: 6, hour: 9,  trigger: 'partner',   emotion: 'calm',       note: 'Lazy Sunday morning together' },
          { dayOffset: 6, hour: 15, trigger: 'health',   emotion: 'calm',       note: 'Cooked healthy lunch, ate together' },
        ],
      },
    ],
  },

  'wellness-warrior': {
    label: 'Wellness Warrior',
    description: 'Exercise/health dominant, high baseline, only work causes dips',
    arcs: [
      {
        name: 'wellness-a-peak-performance',
        moments: [
          { dayOffset: 0, hour: 6,  trigger: 'exercise',  emotion: 'energized',  note: '5am run, sunrise was incredible' },
          { dayOffset: 0, hour: 12, trigger: 'work',     emotion: 'calm',       note: 'Focused morning, productivity high' },
          { dayOffset: 0, hour: 19, trigger: 'health',   emotion: 'calm',       note: 'Meal prepped all evening, feels organized' },
          { dayOffset: 1, hour: 6,  trigger: 'exercise',  emotion: 'energized',  note: 'HIIT class, pushed hard' },
          { dayOffset: 1, hour: 14, trigger: 'work',     emotion: 'anxious',    note: 'Surprise all-hands meeting, reorg rumors' },
          { dayOffset: 1, hour: 20, trigger: 'health',   emotion: 'calm',       note: 'Long bath, letting the stress go' },
          { dayOffset: 2, hour: 7,  trigger: 'exercise',  emotion: 'calm',       note: 'Gentle recovery swim' },
          { dayOffset: 2, hour: 15, trigger: 'social',    emotion: 'energized',  note: 'Post-gym smoothie with friends' },
          { dayOffset: 3, hour: 6,  trigger: 'exercise',  emotion: 'energized',  note: 'Trail run, nature therapy' },
          { dayOffset: 3, hour: 17, trigger: 'alone',    emotion: 'calm',       note: 'Stretching on the porch, birds chirping' },
          { dayOffset: 4, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'CrossFit, new PR on deadlift' },
          { dayOffset: 4, hour: 13, trigger: 'work',     emotion: 'neutral',    note: 'Meetings but manageable' },
          { dayOffset: 5, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Saturday long run with running club' },
          { dayOffset: 5, hour: 14, trigger: 'health',   emotion: 'energized',  note: 'Tried a new healthy recipe, nailed it' },
          { dayOffset: 6, hour: 9,  trigger: 'health',   emotion: 'calm',       note: 'Restful Sunday, active recovery' },
        ],
      },
      {
        name: 'wellness-b-work-dip',
        moments: [
          { dayOffset: 0, hour: 6,  trigger: 'exercise',  emotion: 'energized',  note: 'Morning gym, strong start' },
          { dayOffset: 0, hour: 10, trigger: 'work',     emotion: 'frustrated', note: 'Project got cancelled after weeks of effort' },
          { dayOffset: 0, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Evening yoga, needed the reset' },
          { dayOffset: 1, hour: 7,  trigger: 'health',   emotion: 'calm',       note: 'Green smoothie and meditation' },
          { dayOffset: 1, hour: 14, trigger: 'work',     emotion: 'anxious',    note: 'Reassigned to unfamiliar project' },
          { dayOffset: 2, hour: 6,  trigger: 'exercise',  emotion: 'energized',  note: 'Cycling to work, wind in face' },
          { dayOffset: 2, hour: 16, trigger: 'work',     emotion: 'neutral',    note: 'Starting to figure out the new project' },
          { dayOffset: 3, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Weightlifting, stress moving through my body' },
          { dayOffset: 3, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Running club meetup, great energy' },
          { dayOffset: 4, hour: 6,  trigger: 'exercise',  emotion: 'calm',       note: 'Rest day walk, keeping it gentle' },
          { dayOffset: 4, hour: 15, trigger: 'work',     emotion: 'calm',       note: 'Finally made progress, feeling better' },
          { dayOffset: 5, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Park workout with a friend' },
          { dayOffset: 5, hour: 13, trigger: 'health',   emotion: 'energized',  note: 'Farmers market haul, excited to cook' },
          { dayOffset: 6, hour: 10, trigger: 'family',   emotion: 'calm',       note: 'Family hike, everyone together' },
        ],
      },
    ],
  },

  'delayed-crash': {
    label: 'Delayed Crash',
    description: 'Stress feels controlled in the moment, crashes arrive 24-48h later',
    arcs: [
      {
        name: 'delayed-crash-a-lagged-collapse',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Handled a heavy workload, felt in control', tags: ['workload'] },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'neutral',    note: 'Meetings were dense but manageable' },
          { dayOffset: 1, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Woke up exhausted, no energy to do anything' },
          { dayOffset: 1, hour: 18, trigger: 'health',   emotion: 'anxious',    note: 'Headache won\'t go away, body is protesting' },
          { dayOffset: 2, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Pushed through another packed day', tags: ['workload'] },
          { dayOffset: 2, hour: 14, trigger: 'work',     emotion: 'neutral',    note: 'Stayed composed but felt something building' },
          { dayOffset: 3, hour: 9,  trigger: 'alone',    emotion: 'frustrated', note: 'Everything hit at once, could barely get out of bed' },
          { dayOffset: 3, hour: 19, trigger: 'exercise',  emotion: 'calm',       note: 'Forced a walk, it helped somewhat' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Back to autopilot mode', tags: ['workload'] },
          { dayOffset: 4, hour: 20, trigger: 'alone',    emotion: 'anxious',    note: 'Weekend but too drained to enjoy it' },
          { dayOffset: 5, hour: 10, trigger: 'exercise',  emotion: 'calm',       note: 'Long walk finally cleared my head' },
          { dayOffset: 5, hour: 17, trigger: 'social',    emotion: 'neutral',    note: 'Met friends but could not fully engage' },
          { dayOffset: 6, hour: 9,  trigger: 'alone',    emotion: 'frustrated', note: 'Dreading Monday already, the cycle repeats' },
        ],
      },
      {
        name: 'delayed-crash-b-accumulation',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Started the week fresh actually' },
          { dayOffset: 0, hour: 15, trigger: 'work',     emotion: 'neutral',    note: 'Afternoon got intense, lots of context switching', tags: ['context-switching'] },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Meetings all day, stayed composed', tags: ['meetings'] },
          { dayOffset: 1, hour: 20, trigger: 'work',     emotion: 'neutral',    note: 'Worked late but still felt okay' },
          { dayOffset: 2, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Hit a wall this morning, brain fog', tags: ['crash'] },
          { dayOffset: 2, hour: 14, trigger: 'health',   emotion: 'frustrated', note: 'Stomach issues, stress leaking into my body' },
          { dayOffset: 3, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Recovered enough to push through' },
          { dayOffset: 3, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Gym session, first good feeling in days' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Intense sprint to close the week', tags: ['deadline'] },
          { dayOffset: 4, hour: 19, trigger: 'alone',    emotion: 'frustrated', note: 'Collapsed on the couch, zero motivation' },
          { dayOffset: 5, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Expected to bounce back on Saturday, did not happen', tags: ['crash'] },
          { dayOffset: 5, hour: 16, trigger: 'exercise',  emotion: 'neutral',    note: 'Tried to run but legs felt like lead' },
          { dayOffset: 6, hour: 10, trigger: 'family',   emotion: 'calm',       note: 'Family visit helped more than I expected' },
        ],
      },
    ],
  },

  'false-recovery': {
    label: 'False Recovery',
    description: 'Passive rest feels like recovery but next-day baseline drops; active recovery actually works',
    arcs: [
      {
        name: 'false-recovery-a-scrolling-trap',
        moments: [
          // Cycle 1: work stress → passive rest → decline → real recovery
          { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'frustrated', note: 'Overwhelmed from minute one', tags: ['deadline'] },
          { dayOffset: 0, hour: 20, trigger: 'alone',    emotion: 'neutral',    note: 'Scrolling through my phone to zone out', tags: ['passive-rest'] },
          { dayOffset: 1, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Did not sleep well, woke up worse than yesterday' },
          { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'energized',  note: 'Finally dragged myself to the gym, huge difference' },
          // Cycle 2: recovered → passive rest again → decline → real recovery
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Clear-headed after yesterday\'s workout' },
          { dayOffset: 2, hour: 20, trigger: 'alone',    emotion: 'neutral',    note: 'Netflix and couch, thought I earned it', tags: ['passive-rest'] },
          { dayOffset: 3, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Woke up restless, the Netflix did not help' },
          { dayOffset: 3, hour: 18, trigger: 'social',    emotion: 'energized',  note: 'Drinks with friends, actually laughed for the first time all week' },
          // Cycle 3: recovered → passive rest AGAIN → decline → real recovery
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Felt genuinely better after real connection' },
          { dayOffset: 4, hour: 20, trigger: 'alone',    emotion: 'neutral',    note: 'Thought I would try relaxing at home again', tags: ['passive-rest'] },
          { dayOffset: 5, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Same crash, passive rest just does not work for me' },
          { dayOffset: 5, hour: 16, trigger: 'exercise',  emotion: 'energized',  note: 'Afternoon bike ride finally broke the cycle' },
          { dayOffset: 6, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Thought I recovered but feel off again today' },
          { dayOffset: 6, hour: 15, trigger: 'social',    emotion: 'energized',  note: 'Sunday brunch with friends saved the day' },
        ],
      },
      {
        name: 'false-recovery-b-couch-cycle',
        moments: [
          // Cycle 1: stress → passive rest → decline → real recovery
          { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Week started with urgent emails', tags: ['urgent'] },
          { dayOffset: 0, hour: 21, trigger: 'alone',    emotion: 'neutral',    note: 'Stayed up late watching videos to forget about it', tags: ['passive-rest'] },
          { dayOffset: 1, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Headache and low energy, the videos made it worse' },
          { dayOffset: 1, hour: 19, trigger: 'alone',    emotion: 'neutral',    note: 'Tried reading but kept checking my phone', tags: ['passive-rest'] },
          // Cycle 2: more passive rest → decline → real recovery
          { dayOffset: 2, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Third day feeling progressively worse' },
          { dayOffset: 2, hour: 18, trigger: 'social',    emotion: 'energized',  note: 'Colleague invited me for a walk, best part of the week' },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Felt genuinely better, focused morning' },
          { dayOffset: 3, hour: 20, trigger: 'alone',    emotion: 'neutral',    note: 'Just want to do nothing', tags: ['passive-rest'] },
          // Cycle 3: passive rest → decline → real recovery
          { dayOffset: 4, hour: 8,  trigger: 'alone',    emotion: 'anxious',    note: 'Can not settle, restless, nothing helped' },
          { dayOffset: 4, hour: 18, trigger: 'exercise',  emotion: 'energized',  note: 'Partner convinced me to go for a run, grateful for the push' },
          { dayOffset: 5, hour: 8,  trigger: 'alone',    emotion: 'frustrated', note: 'Expected rest to help but still feel flat' },
          { dayOffset: 5, hour: 15, trigger: 'social',    emotion: 'energized',  note: 'Friends invited me out, saved the day' },
          { dayOffset: 6, hour: 9,  trigger: 'exercise',  emotion: 'energized',  note: 'Sunday run, energy is actually back' },
          { dayOffset: 6, hour: 17, trigger: 'health',   emotion: 'calm',       note: 'Cooked a real meal, early night' },
        ],
      },
    ],
  },

  'context-split': {
    label: 'Context Split',
    description: 'Same trigger (work) produces opposite emotions depending on context (morning solo vs afternoon meetings)',
    arcs: [
      {
        name: 'context-split-a-morning-vs-afternoon',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Deep work block, headphones on, productive', tags: ['deep-work'] },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'anxious',    note: 'Back-to-back afternoon meetings, energy tanked', tags: ['afternoon-meetings'] },
          { dayOffset: 0, hour: 20, trigger: 'alone',    emotion: 'calm',       note: 'Quiet evening, decompressing' },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Morning coding session, in the zone', tags: ['deep-work'] },
          { dayOffset: 1, hour: 14, trigger: 'work',     emotion: 'frustrated', note: 'Project review meeting, lots of criticism', tags: ['afternoon-meetings'] },
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'energized',  note: 'Creative brainstorm, fun collaboration', tags: ['brainstorm'] },
          { dayOffset: 2, hour: 14, trigger: 'work',     emotion: 'anxious',    note: 'Sprint planning, everything feels urgent', tags: ['afternoon-meetings'] },
          { dayOffset: 2, hour: 19, trigger: 'exercise',  emotion: 'calm',       note: 'Evening run, needed the release' },
          { dayOffset: 3, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Morning focus time, clear progress', tags: ['deep-work'] },
          { dayOffset: 3, hour: 15, trigger: 'work',     emotion: 'frustrated', note: 'Another long afternoon meeting, no decisions made', tags: ['afternoon-meetings'] },
          { dayOffset: 4, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Wrapping up deliverables solo', tags: ['deep-work'] },
          { dayOffset: 4, hour: 13, trigger: 'social',    emotion: 'energized',  note: 'Lunch with the team, great energy', tags: ['lunch'] },
          { dayOffset: 5, hour: 9,  trigger: 'exercise',  emotion: 'energized',  note: 'Saturday morning run' },
          { dayOffset: 6, hour: 10, trigger: 'family',   emotion: 'calm',       note: 'Relaxed Sunday with family' },
        ],
      },
      {
        name: 'context-split-b-meetings-drain',
        moments: [
          { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Started the week with planning, focused', tags: ['deep-work'] },
          { dayOffset: 0, hour: 15, trigger: 'work',     emotion: 'frustrated', note: 'Midweek review pulled forward, stressful', tags: ['afternoon-meetings'] },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'energized',  note: 'Pair programming, enjoying the flow', tags: ['deep-work'] },
          { dayOffset: 1, hour: 14, trigger: 'work',     emotion: 'anxious',    note: 'Unexpected stakeholder meeting, no prep time', tags: ['afternoon-meetings'] },
          { dayOffset: 1, hour: 19, trigger: 'partner',   emotion: 'calm',       note: 'Cooked together, good reset' },
          { dayOffset: 2, hour: 8,  trigger: 'work',     emotion: 'calm',       note: 'Solo research, interesting problem', tags: ['deep-work'] },
          { dayOffset: 2, hour: 15, trigger: 'work',     emotion: 'anxious',    note: 'Design review, felt put on the spot', tags: ['afternoon-meetings'] },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Documentation day, quiet and steady', tags: ['deep-work'] },
          { dayOffset: 3, hour: 14, trigger: 'work',     emotion: 'frustrated', note: 'Retrospective turned into blame session', tags: ['afternoon-meetings'] },
          { dayOffset: 3, hour: 19, trigger: 'exercise',  emotion: 'energized',  note: 'Gym session, worked out the frustration' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Light day, tying up loose ends', tags: ['deep-work'] },
          { dayOffset: 4, hour: 14, trigger: 'work',     emotion: 'neutral',    note: 'Quick sync, painless for once' },
          { dayOffset: 5, hour: 10, trigger: 'social',    emotion: 'energized',  note: 'Coffee with friends' },
          { dayOffset: 6, hour: 9,  trigger: 'health',   emotion: 'calm',       note: 'Meal prep and recovery day' },
        ],
      },
    ],
  },

  'silent-drift': {
    label: 'Silent Drift',
    description: 'No obvious negative trigger but baseline gradually declining, positive activities losing effectiveness',
    arcs: [
      {
        name: 'silent-drift-a-flattening',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Standard day, nothing remarkable' },
          { dayOffset: 0, hour: 18, trigger: 'exercise',  emotion: 'neutral',    note: 'Went to the gym, felt okay I guess' },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Meetings but whatever' },
          { dayOffset: 1, hour: 20, trigger: 'alone',    emotion: 'neutral',    note: 'Evening in, scrolling' },
          { dayOffset: 2, hour: 8,  trigger: 'social',    emotion: 'neutral',    note: 'Coffee with a friend, it was fine' },
          { dayOffset: 2, hour: 18, trigger: 'work',     emotion: 'neutral',    note: 'Wrapped up some tasks' },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Another day, another meeting' },
          { dayOffset: 3, hour: 19, trigger: 'partner',   emotion: 'neutral',    note: 'Dinner together, quiet night' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Felt a flash of anxiety out of nowhere' },
          { dayOffset: 4, hour: 19, trigger: 'alone',    emotion: 'anxious',    note: 'Can not settle, restless but do not know why' },
          { dayOffset: 5, hour: 10, trigger: 'exercise',  emotion: 'neutral',    note: 'Ran but it felt mechanical' },
          { dayOffset: 5, hour: 17, trigger: 'social',    emotion: 'calm',       note: 'Met friends, managed to enjoy it a little' },
          { dayOffset: 6, hour: 10, trigger: 'alone',    emotion: 'neutral',    note: 'Just existing today' },
        ],
      },
      {
        name: 'silent-drift-b-fading-highs',
        moments: [
          { dayOffset: 0, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Great morning workout' },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Good focus day' },
          { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Average day, getting by' },
          { dayOffset: 1, hour: 18, trigger: 'social',    emotion: 'energized',  note: 'Spontaneous dinner invite, felt good' },
          { dayOffset: 2, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Plodding along' },
          { dayOffset: 2, hour: 19, trigger: 'exercise',  emotion: 'calm',       note: 'Evening yoga, slightly better' },
          { dayOffset: 3, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Head down, doing the work' },
          { dayOffset: 3, hour: 18, trigger: 'partner',   emotion: 'calm',       note: 'Nice chat over dinner' },
          { dayOffset: 4, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'End-of-week pressure kicked in' },
          { dayOffset: 4, hour: 19, trigger: 'alone',    emotion: 'neutral',    note: 'Too tired to go out, stayed in' },
          { dayOffset: 5, hour: 9,  trigger: 'exercise',  emotion: 'calm',       note: 'Morning walk, decent enough' },
          { dayOffset: 5, hour: 16, trigger: 'family',   emotion: 'energized',  note: 'Family gathering, actually felt happy' },
          { dayOffset: 6, hour: 10, trigger: 'health',   emotion: 'calm',       note: 'Restful day, cooking and reading' },
        ],
      },
    ],
  },
};

const VALID_PERSONALITIES = Object.keys(PERSONALITIES);

function bucketForHour(hour) {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function dateStr(date) {
  return date.toISOString().slice(0, 10);
}

function generateWeekMoments(weekStartDate, arcIndex, personality) {
  const arcs = PERSONALITIES[personality].arcs;
  const arc = arcs[arcIndex % arcs.length];
  return arc.moments.map((m) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + m.dayOffset);
    d.setHours(m.hour, Math.floor(Math.random() * 50), 0, 0);
    return {
      date: d,
      dateStr: dateStr(d),
      trigger: m.trigger,
      emotion: m.emotion,
      note: m.note,
      tags: m.tags || [],
      timeBucket: bucketForHour(m.hour),
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { ownerIds, weeks, personality } = req.body || {};

  if (!Array.isArray(ownerIds) || ownerIds.length === 0) {
    return res.status(400).json({ error: 'ownerIds array required' });
  }
  if (!weeks || weeks < 1 || weeks > 8) {
    return res.status(400).json({ error: 'weeks must be 1-8' });
  }
  if (!personality || !VALID_PERSONALITIES.includes(personality)) {
    return res.status(400).json({
      error: `personality required — one of: ${VALID_PERSONALITIES.join(', ')}`,
    });
  }

  const results = [];

  for (const ownerId of ownerIds) {
    try {
      // ── Clear existing moment + aggregate data for this user ──
      // Delete the moments list (timeline)
      await redis(['DEL', redisKey('moments', ownerId)]);
      // Delete daily aggregate keys
      const dailyKeys = await keys(redisKey('daily', ownerId, '*')) || [];
      if (dailyKeys.length) {
        const delBatch = 20;
        for (let i = 0; i < dailyKeys.length; i += delBatch) {
          await pipeline(dailyKeys.slice(i, i + delBatch).map(k => ['DEL', k]));
        }
      }
      // Clear any cached report so it regenerates cleanly
      await redis(['DEL', redisKey('weekly_report', ownerId)]);

      const cmds = [];
      let totalMoments = 0;
      const daysSet = new Set();

      // Ensure owner is in the owners set
      cmds.push(['SADD', redisKey('owners'), ownerId]);

      for (let w = 0; w < weeks; w++) {
        // Week start: go back (weeks - w) weeks from today (Monday-based)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() - mondayOffset);
        thisMonday.setHours(0, 0, 0, 0);

        const weekStart = new Date(thisMonday);
        weekStart.setDate(thisMonday.getDate() - (weeks - 1 - w) * 7);

        const moments = generateWeekMoments(weekStart, w, personality);

        for (const m of moments) {
          // Skip moments in the future
          if (m.date > now) continue;

          const dailyKey = redisKey('daily', ownerId, m.dateStr);
          const pairKey = `${m.trigger}|${m.emotion}`;

          // Daily aggregate (what the pattern engine reads)
          cmds.push(['HINCRBY', dailyKey, 'total', '1']);
          cmds.push(['HINCRBY', dailyKey, `trigger:${m.trigger}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `emotion:${m.emotion}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `pair:${pairKey}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `time:${m.timeBucket}`, '1']);
          cmds.push(['HSET', dailyKey, 'date', m.dateStr]);
          cmds.push(['EXPIRE', dailyKey, String(AGGREGATE_TTL)]);

          // Tag aggregates
          if (m.tags && m.tags.length) {
            for (const tag of m.tags) {
              cmds.push(['HINCRBY', dailyKey, `tag:${tag}`, '1']);
            }
          }

          // Individual moment (what the timeline screen reads)
          const momentObj = {
            id: randomUUID(),
            ownerId,
            trigger: m.trigger,
            emotion: m.emotion,
            note: m.note || '',
            timestamp: m.date.toISOString(),
            isAnonymous: false,
            ...(m.tags && m.tags.length ? { tags: m.tags } : {}),
          };
          cmds.push(['RPUSH', redisKey('moments', ownerId), JSON.stringify(momentObj)]);

          totalMoments++;
          daysSet.add(m.dateStr);
        }
      }

      // Increment global counter
      cmds.push(['INCRBY', redisKey('counter', 'moments_logged'), String(totalMoments)]);

      // Execute in batches (Upstash pipeline limit ~50 per batch)
      const BATCH = 50;
      for (let i = 0; i < cmds.length; i += BATCH) {
        await pipeline(cmds.slice(i, i + BATCH));
      }

      results.push({
        ownerId,
        ok: true,
        moments: totalMoments,
        days: daysSet.size,
        weeks,
        personality,
        arcs: Array.from({ length: weeks }, (_, i) => PERSONALITIES[personality].arcs[i % PERSONALITIES[personality].arcs.length].name),
      });
    } catch (err) {
      results.push({ ownerId, ok: false, error: err.message });
    }
  }

  return res.status(200).json({ ok: true, results });
}
