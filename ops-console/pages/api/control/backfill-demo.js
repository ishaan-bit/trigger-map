import { requireAuth } from '../../../lib/auth.js';
import { pipeline, redisKey } from '../../../lib/redis.js';

/**
 * POST /api/control/backfill-demo
 *
 * Body: { ownerIds: string[], weeks: number }
 *
 * Generates curated demo moments for the specified accounts going back
 * `weeks` weeks from today.  Data is written directly to Redis daily
 * aggregates (same format the mobile app produces) so that the full
 * insight pipeline works on it.
 */

const AGGREGATE_TTL = 60 * 60 * 24 * 45;

const TRIGGERS = ['work', 'family', 'partner', 'social', 'alone', 'exercise', 'travel', 'health', 'money'];
const EMOTIONS = ['frustrated', 'anxious', 'neutral', 'calm', 'energized'];

// Curated narrative arcs — each defines a weekly "story shape".
// Arcs are cycled through for multi-week backfills.
const WEEKLY_ARCS = [
  {
    name: 'work-stress-exercise-regulator',
    moments: [
      { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Back-to-back meetings before I could think' },
      { dayOffset: 0, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: '30-min run after work, head finally quiet' },
      { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Deadline moved up with no warning' },
      { dayOffset: 1, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Great lunch chat with a colleague' },
      { dayOffset: 2, hour: 10, trigger: 'work',     emotion: 'frustrated', note: 'Presentation prep, nothing felt ready' },
      { dayOffset: 2, hour: 19, trigger: 'exercise',  emotion: 'energized',  note: 'Gym session with a friend' },
      { dayOffset: 3, hour: 8,  trigger: 'work',     emotion: 'anxious',    note: 'Morning Slack blitz' },
      { dayOffset: 3, hour: 20, trigger: 'social',    emotion: 'energized',  note: 'Friday dinner with friends' },
      { dayOffset: 4, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Morning coffee on the balcony' },
      { dayOffset: 4, hour: 16, trigger: 'health',   emotion: 'calm',       note: 'Cooked a proper meal for the first time in days' },
      { dayOffset: 5, hour: 11, trigger: 'family',   emotion: 'neutral',    note: 'Video call with parents' },
      { dayOffset: 6, hour: 8,  trigger: 'work',     emotion: 'frustrated', note: 'Monday inbox already overwhelming' },
      { dayOffset: 6, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Evening walk cleared my head' },
    ],
  },
  {
    name: 'social-energy-money-worry',
    moments: [
      { dayOffset: 0, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Standard day, nothing special' },
      { dayOffset: 0, hour: 20, trigger: 'partner',   emotion: 'calm',       note: 'Quiet evening together' },
      { dayOffset: 1, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Coffee with an old friend' },
      { dayOffset: 1, hour: 21, trigger: 'money',     emotion: 'anxious',    note: 'Saw rent increase notice' },
      { dayOffset: 2, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Early morning jog, felt alive' },
      { dayOffset: 2, hour: 14, trigger: 'work',     emotion: 'calm',       note: 'Productive deep-work block' },
      { dayOffset: 3, hour: 10, trigger: 'money',     emotion: 'frustrated', note: 'Budget planning stress' },
      { dayOffset: 3, hour: 19, trigger: 'social',    emotion: 'energized',  note: 'Board game night with friends' },
      { dayOffset: 4, hour: 11, trigger: 'alone',    emotion: 'calm',       note: 'Journaling in the park' },
      { dayOffset: 5, hour: 9,  trigger: 'family',   emotion: 'energized',  note: 'Sibling visit, lots of laughs' },
      { dayOffset: 5, hour: 17, trigger: 'health',   emotion: 'neutral',    note: 'Tried a new recipe, turned out okay' },
      { dayOffset: 6, hour: 8,  trigger: 'work',     emotion: 'anxious',    note: 'Big presentation tomorrow' },
      { dayOffset: 6, hour: 19, trigger: 'exercise',  emotion: 'calm',       note: 'Yoga session before bed' },
    ],
  },
  {
    name: 'partner-friction-travel-reset',
    moments: [
      { dayOffset: 0, hour: 8,  trigger: 'work',     emotion: 'neutral',    note: 'Quiet start to the week' },
      { dayOffset: 0, hour: 20, trigger: 'partner',   emotion: 'frustrated', note: 'Argument over household chores' },
      { dayOffset: 1, hour: 9,  trigger: 'work',     emotion: 'anxious',    note: 'Distracted, still thinking about last night' },
      { dayOffset: 1, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Long walk helped process things' },
      { dayOffset: 2, hour: 12, trigger: 'social',    emotion: 'energized',  note: 'Lunch with a close friend' },
      { dayOffset: 2, hour: 21, trigger: 'partner',   emotion: 'calm',       note: 'Good conversation, cleared the air' },
      { dayOffset: 3, hour: 10, trigger: 'travel',    emotion: 'energized',  note: 'Road trip planned for the weekend!' },
      { dayOffset: 3, hour: 15, trigger: 'work',     emotion: 'calm',       note: 'Wrapped up a big project' },
      { dayOffset: 4, hour: 9,  trigger: 'travel',    emotion: 'energized',  note: 'On the road, windows down' },
      { dayOffset: 4, hour: 18, trigger: 'partner',   emotion: 'energized',  note: 'Exploring a new town together' },
      { dayOffset: 5, hour: 10, trigger: 'alone',    emotion: 'calm',       note: 'Reading by the lake' },
      { dayOffset: 5, hour: 15, trigger: 'health',   emotion: 'calm',       note: 'Hiking trail, fresh air' },
      { dayOffset: 6, hour: 9,  trigger: 'work',     emotion: 'neutral',    note: 'Back to reality, but feeling recharged' },
    ],
  },
  {
    name: 'health-focus-family-warmth',
    moments: [
      { dayOffset: 0, hour: 7,  trigger: 'exercise',  emotion: 'energized',  note: 'Morning swim, best start in weeks' },
      { dayOffset: 0, hour: 14, trigger: 'work',     emotion: 'neutral',    note: 'Average day at work' },
      { dayOffset: 1, hour: 8,  trigger: 'health',   emotion: 'anxious',    note: 'Doctor appointment, routine checkup' },
      { dayOffset: 1, hour: 19, trigger: 'family',   emotion: 'calm',       note: 'Dinner with parents, felt grounding' },
      { dayOffset: 2, hour: 7,  trigger: 'exercise',  emotion: 'calm',       note: 'Gentle yoga, focusing on breathing' },
      { dayOffset: 2, hour: 12, trigger: 'work',     emotion: 'frustrated', note: 'System outage, firefighting all afternoon' },
      { dayOffset: 3, hour: 10, trigger: 'family',   emotion: 'energized',  note: 'Nephew video call, pure joy' },
      { dayOffset: 3, hour: 17, trigger: 'alone',    emotion: 'calm',       note: 'Afternoon nap, recharging' },
      { dayOffset: 4, hour: 8,  trigger: 'exercise',  emotion: 'energized',  note: 'Personal best on my run!' },
      { dayOffset: 4, hour: 20, trigger: 'social',    emotion: 'energized',  note: 'House party, great energy' },
      { dayOffset: 5, hour: 10, trigger: 'health',   emotion: 'calm',       note: 'Meal prepped for the week' },
      { dayOffset: 5, hour: 15, trigger: 'family',   emotion: 'calm',       note: 'Helped mom with garden' },
      { dayOffset: 6, hour: 9,  trigger: 'work',     emotion: 'calm',       note: 'Organized week ahead, feeling ready' },
      { dayOffset: 6, hour: 18, trigger: 'exercise',  emotion: 'calm',       note: 'Evening stretching routine' },
    ],
  },
];

function bucketForHour(hour) {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function dateStr(date) {
  return date.toISOString().slice(0, 10);
}

function generateWeekMoments(weekStartDate, arcIndex) {
  const arc = WEEKLY_ARCS[arcIndex % WEEKLY_ARCS.length];
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

  const { ownerIds, weeks } = req.body || {};

  if (!Array.isArray(ownerIds) || ownerIds.length === 0) {
    return res.status(400).json({ error: 'ownerIds array required' });
  }
  if (!weeks || weeks < 1 || weeks > 8) {
    return res.status(400).json({ error: 'weeks must be 1-8' });
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

        const moments = generateWeekMoments(weekStart, w);

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
        arcs: Array.from({ length: weeks }, (_, i) => WEEKLY_ARCS[i % WEEKLY_ARCS.length].name),
      });
    } catch (err) {
      results.push({ ownerId, ok: false, error: err.message });
    }
  }

  return res.status(200).json({ ok: true, results });
}
