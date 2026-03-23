import { requireAuth } from '../../../lib/auth.js';
import { pipeline, redisKey } from '../../../lib/redis.js';

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
          { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Back-to-back meetings, no time to breathe' },
          { dayOffset: 0, hour: 13, trigger: 'work',     emotion: 'anxious',    note: 'Deadline moved up again' },
          { dayOffset: 0, hour: 21, trigger: 'alone',    emotion: 'frustrated', note: 'Too tired to do anything, just staring at the wall' },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'anxious',    note: 'Woke up already dreading the day' },
          { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'neutral',    note: 'Forced myself to walk, felt nothing' },
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'frustrated', note: 'More firefighting, zero progress on actual work' },
          { dayOffset: 2, hour: 20, trigger: 'partner',   emotion: 'frustrated', note: 'Snapped over something small' },
          { dayOffset: 3, hour: 10, trigger: 'work',     emotion: 'anxious',    note: 'Performance review coming up' },
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
          { dayOffset: 0, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Morning run, best way to start the week' },
          { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Productive deep-work block' },
          { dayOffset: 1, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Standard day, knocked out my tasks' },
          { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Evening walk, watching the sunset' },
          { dayOffset: 2, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Good feedback on my presentation' },
          { dayOffset: 2, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Lunch with a colleague, great conversation' },
          { dayOffset: 3, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'New personal best on my run' },
          { dayOffset: 3, hour: 15, trigger: 'work',     emotion: 'frustrated', note: 'Annoying blocker, but sorted it out' },
          { dayOffset: 4, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Reading with coffee, quiet morning' },
          { dayOffset: 4, hour: 16, trigger: 'family',   emotion: 'energized',  note: 'Video call with sister, catching up' },
          { dayOffset: 5, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Saturday long run, feeling alive' },
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

          cmds.push(['HINCRBY', dailyKey, 'total', '1']);
          cmds.push(['HINCRBY', dailyKey, `trigger:${m.trigger}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `emotion:${m.emotion}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `pair:${pairKey}`, '1']);
          cmds.push(['HINCRBY', dailyKey, `time:${m.timeBucket}`, '1']);
          cmds.push(['HSET', dailyKey, 'date', m.dateStr]);
          cmds.push(['EXPIRE', dailyKey, String(AGGREGATE_TTL)]);

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
