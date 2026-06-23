import { EMOTION_SCORE, coordinatesToLegacy } from "@triggermap/shared/constants/emotions";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { bucketForTimestamp, getWeeklyAggregates } from "../services/aggregationService.js";
import { getMomentsKey } from "../services/momentService.js";
import { redis } from "../services/redisClient.js";
import { generateWeeklyReport } from "../services/patternEngine.js";

export const LLM_AGGREGATE_WINDOW_DAYS = 45;
export const RAW_FALLBACK_MAX_ACTIVE_DAYS = 45;
export const RAW_FALLBACK_SILENT_ACTIVE_DAYS = 7;
export const RAW_FALLBACK_MAX_RECENT_MOMENTS = 15;

const LEGACY_EMOTION_ALIASES = {
  stressed: "anxious",
  stress: "anxious",
  worried: "anxious",
  nervous: "anxious",
  tense: "anxious",
  angry: "frustrated",
  irritated: "frustrated",
  annoyed: "frustrated",
  sad: "low",
  tired: "flat",
  numb: "disconnected",
  happy: "energized",
  good: "energized",
  excited: "excited",
  peaceful: "peaceful",
  relaxed: "calm",
  okay: "neutral",
  ok: "neutral",
  meh: "neutral",
};

function cleanKey(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_")
    : null;
}

function numeric(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function validIsoTimestamp(moment) {
  const raw = moment?.timestamp || moment?.occurredAt || moment?.date || moment?.createdAt || moment?.loggedAt;
  if (!raw) return null;
  const time = new Date(raw);
  if (!Number.isFinite(time.getTime())) return null;
  return time.toISOString();
}

function normalizeTrigger(moment) {
  const candidates = [
    moment?.trigger,
    moment?.context,
    moment?.domain,
    moment?.category,
    moment?.source,
  ];

  for (const candidate of candidates) {
    const key = cleanKey(candidate);
    if (key && TRIGGERS.includes(key)) return key;
  }

  return "work";
}

function normalizeEmotion(moment, valence, arousal) {
  const candidates = [
    moment?.emotion,
    moment?.derivedLabel,
    moment?.mood,
    moment?.moodLabel,
    moment?.emotionLabel,
    moment?.feeling,
    moment?.label,
  ];

  for (const candidate of candidates) {
    const key = cleanKey(candidate);
    if (!key) continue;
    if (EMOTION_SCORE[key] != null) return key;
    if (LEGACY_EMOTION_ALIASES[key]) return LEGACY_EMOTION_ALIASES[key];
  }

  if (typeof valence === "number" && typeof arousal === "number") {
    return coordinatesToLegacy(valence, arousal);
  }

  return "neutral";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeRawMoment(entry, { ownerId } = {}) {
  let moment = entry;
  if (typeof entry === "string") {
    try {
      moment = JSON.parse(entry);
    } catch {
      return { moment: null, malformed: true };
    }
  }

  if (!moment || typeof moment !== "object" || Array.isArray(moment)) {
    return { moment: null, malformed: true };
  }

  const timestamp = validIsoTimestamp(moment);
  if (!timestamp) {
    return { moment: null, malformed: true };
  }

  const valence = numeric(moment.valence ?? moment.emotionPoint?.valence ?? moment.emotionPoint?.x);
  const arousal = numeric(moment.arousal ?? moment.emotionPoint?.arousal ?? moment.emotionPoint?.y);
  const trigger = normalizeTrigger(moment);
  const emotion = normalizeEmotion(moment, valence, arousal);
  const contributionTags = normalizeStringArray(moment.contributionTags || moment.tags);
  const tags = normalizeStringArray(moment.tags);

  return {
    moment: {
      ...moment,
      ownerId: moment.ownerId || ownerId,
      timestamp,
      trigger,
      emotion,
      derivedLabel: moment.derivedLabel || moment.emotionLabel || emotion,
      ...(typeof valence === "number" ? { valence } : {}),
      ...(typeof arousal === "number" ? { arousal } : {}),
      note: typeof moment.note === "string" ? moment.note : (typeof moment.notes === "string" ? moment.notes : ""),
      contributionTags,
      ...(tags.length ? { tags } : {}),
    },
    malformed: false,
  };
}

export function parseRawMomentEntries(entries = [], { ownerId } = {}) {
  const moments = [];
  let skippedMalformedCount = 0;

  for (const entry of entries || []) {
    const parsed = normalizeRawMoment(entry, { ownerId });
    if (parsed.malformed || !parsed.moment) {
      skippedMalformedCount += 1;
    } else {
      moments.push(parsed.moment);
    }
  }

  moments.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  return {
    rawMomentCount: Array.isArray(entries) ? entries.length : 0,
    rawQualifyingCount: moments.length,
    skippedMalformedCount,
    moments,
  };
}

function emptyAggregate(date) {
  return {
    date,
    total: 0,
    triggers: {},
    emotions: {},
    pairs: {},
    tags: {},
    contributionTags: {},
    timeOfDay: {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    },
    valenceSum: 0,
    arousalSum: 0,
    continuousCount: 0,
  };
}

function increment(record, key) {
  record[key] = (record[key] || 0) + 1;
}

export function buildAggregatesFromRawMoments(moments = []) {
  const byDate = new Map();

  for (const moment of moments) {
    const date = new Date(moment.timestamp).toISOString().slice(0, 10);
    const snapshot = byDate.get(date) || emptyAggregate(date);
    const trigger = moment.trigger || "work";
    const emotion = moment.emotion || "neutral";
    const pairKey = `${trigger}|${emotion}`;

    snapshot.total += 1;
    increment(snapshot.triggers, trigger);
    increment(snapshot.emotions, emotion);
    increment(snapshot.pairs, pairKey);
    increment(snapshot.timeOfDay, bucketForTimestamp(moment.timestamp));

    const tagSet = new Set(normalizeStringArray(moment.tags));
    const contributionTagSet = new Set(normalizeStringArray(moment.contributionTags));

    for (const tag of tagSet) {
      increment(snapshot.tags, tag);
    }
    for (const tag of contributionTagSet) {
      if (!tagSet.has(tag)) increment(snapshot.tags, tag);
      increment(snapshot.contributionTags, tag);
    }

    if (typeof moment.valence === "number" && typeof moment.arousal === "number") {
      snapshot.valenceSum += moment.valence;
      snapshot.arousalSum += moment.arousal;
      snapshot.continuousCount += 1;
    }

    byDate.set(date, snapshot);
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function daysSinceDate(date, now) {
  if (!date) return null;
  return Math.floor((now.getTime() - new Date(date).getTime()) / 86400000);
}

function buildReportFromSnapshots({
  snapshots,
  allSnapshots,
  recentCount,
  totalCount,
  now,
  forceSilent = false,
}) {
  const activeDays = snapshots.filter((snapshot) => Number(snapshot.total || 0) > 0);
  const lastActiveDate = activeDays[activeDays.length - 1]?.date || null;
  const isSilent = forceSilent || (recentCount === 0 && totalCount > 0);
  let silenceWindow = null;
  let effectiveAggregates = snapshots;

  if (isSilent) {
    silenceWindow = {
      isSilent: true,
      daysSinceLastLog: daysSinceDate(lastActiveDate, now),
      lastLogDate: lastActiveDate,
      totalLifetimeMoments: totalCount,
    };
    effectiveAggregates = activeDays.slice(-7);
  }

  return {
    isSilent,
    silenceWindow,
    effectiveAggregates,
    weeklyReport: generateWeeklyReport({
      aggregates: effectiveAggregates,
      allAggregates: allSnapshots,
      silenceWindow,
    }),
  };
}

function sumTotals(snapshots = []) {
  return snapshots.reduce((sum, snapshot) => sum + Number(snapshot.total || 0), 0);
}

function activeSnapshots(snapshots = []) {
  return snapshots.filter((snapshot) => Number(snapshot.total || 0) > 0);
}

function topCountEntries(record = {}, limit = 8) {
  return Object.entries(record || {})
    .sort(([, left], [, right]) => Number(right || 0) - Number(left || 0))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count: Number(count || 0) }));
}

function mergeCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function summarizeSnapshots(snapshots = []) {
  const triggers = {};
  const emotions = {};
  const pairs = {};
  const tags = {};
  const contributionTags = {};
  let total = 0;
  let valenceStart = null;
  let valenceEnd = null;
  let arousalStart = null;
  let arousalEnd = null;

  for (const snapshot of snapshots) {
    total += Number(snapshot.total || 0);
    mergeCounts(triggers, snapshot.triggers);
    mergeCounts(emotions, snapshot.emotions);
    mergeCounts(pairs, snapshot.pairs);
    mergeCounts(tags, snapshot.tags);
    mergeCounts(contributionTags, snapshot.contributionTags);

    const continuousCount = Number(snapshot.continuousCount || 0);
    if (continuousCount > 0) {
      const valence = Number(snapshot.valenceSum || 0) / continuousCount;
      const arousal = Number(snapshot.arousalSum || 0) / continuousCount;
      if (valenceStart == null) valenceStart = valence;
      if (arousalStart == null) arousalStart = arousal;
      valenceEnd = valence;
      arousalEnd = arousal;
    }
  }

  return {
    total,
    triggers: topCountEntries(triggers),
    emotions: topCountEntries(emotions),
    pairs: topCountEntries(pairs),
    tags: topCountEntries(tags, 6),
    contributionTags: topCountEntries(contributionTags, 6),
    valenceArousalTrend: valenceStart == null || valenceEnd == null
      ? null
      : {
          valenceDelta: Number((valenceEnd - valenceStart).toFixed(3)),
          arousalDelta: Number((arousalEnd - arousalStart).toFixed(3)),
        },
  };
}

function dateLowerBound(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return date.toISOString().slice(0, 10);
}

function selectRawFallbackSnapshots(rawAggregates, { now, aggregateWindowDays }) {
  const lowerBound = dateLowerBound(now, aggregateWindowDays);
  const allActive = activeSnapshots(rawAggregates);
  const activeInWindow = allActive.filter((snapshot) => snapshot.date >= lowerBound);

  if (activeInWindow.length > 0) {
    return activeInWindow.slice(-RAW_FALLBACK_MAX_ACTIVE_DAYS);
  }

  return allActive.slice(-RAW_FALLBACK_SILENT_ACTIVE_DAYS);
}

function buildRawFallbackSummary({ raw, rawAggregates, selectedSnapshots, aggregateWindowDays }) {
  const allActive = activeSnapshots(rawAggregates);
  const activeRange = allActive.length
    ? { firstDate: allActive[0].date, lastDate: allActive[allActive.length - 1].date }
    : { firstDate: null, lastDate: null };
  const selectedRange = selectedSnapshots.length
    ? { firstDate: selectedSnapshots[0].date, lastDate: selectedSnapshots[selectedSnapshots.length - 1].date }
    : { firstDate: null, lastDate: null };
  const selectedSummary = summarizeSnapshots(selectedSnapshots);

  return {
    isRawFallback: true,
    totalMomentCount: raw.rawQualifyingCount,
    rawMomentCount: raw.rawMomentCount,
    skippedMalformedCount: raw.skippedMalformedCount,
    aggregateWindowDays,
    activeDateRange: activeRange,
    selectedDateRange: selectedRange,
    activeDaysTotal: allActive.length,
    activeDaysUsed: selectedSnapshots.length,
    recentActivityDates: allActive.slice(-10).map((snapshot) => snapshot.date),
    selectedMomentCount: selectedSummary.total,
    emotionDistribution: selectedSummary.emotions,
    triggerFrequency: selectedSummary.triggers,
    responsePatternFrequency: selectedSummary.pairs,
    repeatedContexts: selectedSummary.contributionTags.length ? selectedSummary.contributionTags : selectedSummary.tags,
    valenceArousalTrend: selectedSummary.valenceArousalTrend,
  };
}

function momentDate(moment) {
  return new Date(moment.timestamp).toISOString().slice(0, 10);
}

function selectMomentsForPromptNotes(moments = [], selectedSnapshots = []) {
  const selectedDates = new Set(selectedSnapshots.map((snapshot) => snapshot.date));
  const scoped = selectedDates.size
    ? moments.filter((moment) => selectedDates.has(momentDate(moment)))
    : moments;
  return scoped.slice(0, RAW_FALLBACK_MAX_RECENT_MOMENTS);
}

function recentRawCount(moments, now) {
  const recentThreshold = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return moments.reduce((sum, moment) => {
    const time = new Date(moment.timestamp).getTime();
    return time >= recentThreshold ? sum + 1 : sum;
  }, 0);
}

function reasonForCounts(rawMomentCount, rawQualifyingCount, minMoments) {
  if (rawMomentCount === 0) return "no-data";
  return `below-threshold (${rawQualifyingCount || 0} < ${minMoments})`;
}

export function buildLlmInsightSourceFromData({
  aggregates = [],
  rawEntries = null,
  minMoments = 1,
  aggregateWindowDays = LLM_AGGREGATE_WINDOW_DAYS,
  now = new Date(),
  ownerId,
} = {}) {
  const aggregateWindowCount = sumTotals(aggregates);
  const aggregateRecentCount = sumTotals(aggregates.slice(-7));
  const aggregateReport = buildReportFromSnapshots({
    snapshots: aggregates,
    allSnapshots: aggregates,
    recentCount: aggregateRecentCount,
    totalCount: aggregateWindowCount,
    now,
  });

  const baseDiagnostics = {
    ownerIdPrefix: ownerId ? ownerId.slice(0, 8) : null,
    aggregateWindowDays,
    aggregateWindowCount,
    rawMomentCount: null,
    rawQualifyingCount: null,
    selectedSource: "none",
    threshold: minMoments,
    skippedMalformedCount: 0,
    status: "pending",
    reason: null,
  };

  if (aggregateReport.weeklyReport.totalMoments >= minMoments) {
    return {
      status: "ready",
      selectedSource: "aggregates",
      weeklyReport: aggregateReport.weeklyReport,
      moments: null,
      diagnostics: {
        ...baseDiagnostics,
        selectedSource: "aggregates",
        status: "ready",
      },
    };
  }

  if (!Array.isArray(rawEntries)) {
    return {
      status: "needs-raw",
      selectedSource: "none",
      weeklyReport: null,
      moments: null,
      diagnostics: baseDiagnostics,
    };
  }

  const raw = parseRawMomentEntries(rawEntries, { ownerId });
  const rawAggregates = buildAggregatesFromRawMoments(raw.moments);
  const selectedRawSnapshots = selectRawFallbackSnapshots(rawAggregates, {
    now,
    aggregateWindowDays,
  });
  const rawReport = buildReportFromSnapshots({
    snapshots: selectedRawSnapshots,
    allSnapshots: selectedRawSnapshots,
    recentCount: recentRawCount(raw.moments, now),
    totalCount: raw.rawQualifyingCount,
    forceSilent: recentRawCount(raw.moments, now) === 0 && raw.rawQualifyingCount > 0,
    now,
  });
  rawReport.weeklyReport.rawFallbackSummary = buildRawFallbackSummary({
    raw,
    rawAggregates,
    selectedSnapshots: selectedRawSnapshots,
    aggregateWindowDays,
  });

  const rawDiagnostics = {
    ...baseDiagnostics,
    rawMomentCount: raw.rawMomentCount,
    rawQualifyingCount: raw.rawQualifyingCount,
    skippedMalformedCount: raw.skippedMalformedCount,
    rawActiveDaysTotal: rawReport.weeklyReport.rawFallbackSummary.activeDaysTotal,
    rawActiveDaysUsed: rawReport.weeklyReport.rawFallbackSummary.activeDaysUsed,
    rawSelectedMomentCount: rawReport.weeklyReport.rawFallbackSummary.selectedMomentCount,
  };

  if (raw.rawQualifyingCount >= minMoments) {
    return {
      status: "ready",
      selectedSource: "raw-fallback",
      weeklyReport: rawReport.weeklyReport,
      moments: selectMomentsForPromptNotes(raw.moments, selectedRawSnapshots),
      diagnostics: {
        ...rawDiagnostics,
        selectedSource: "raw-fallback",
        status: "ready",
      },
    };
  }

  const reason = reasonForCounts(raw.rawMomentCount, raw.rawQualifyingCount, minMoments);
  return {
    status: "skipped",
    selectedSource: "none",
    reason,
    weeklyReport: rawReport.weeklyReport,
    moments: raw.moments,
    diagnostics: {
      ...rawDiagnostics,
      selectedSource: "none",
      status: "skipped",
      reason,
    },
  };
}

export async function loadRawMomentEntries(ownerId) {
  const raw = await redis(["LRANGE", getMomentsKey(ownerId), "0", "-1"]);
  return Array.isArray(raw) ? raw : [];
}

export async function resolveLlmInsightSource(ownerId, { minMoments = 1, aggregateWindowDays = LLM_AGGREGATE_WINDOW_DAYS } = {}) {
  const aggregates = await getWeeklyAggregates(ownerId, aggregateWindowDays);
  const aggregateOnly = buildLlmInsightSourceFromData({
    aggregates,
    minMoments,
    aggregateWindowDays,
    ownerId,
  });

  if (aggregateOnly.status === "ready") {
    return aggregateOnly;
  }

  const rawEntries = await loadRawMomentEntries(ownerId);
  return buildLlmInsightSourceFromData({
    aggregates,
    rawEntries,
    minMoments,
    aggregateWindowDays,
    ownerId,
  });
}
