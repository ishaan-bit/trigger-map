/**
 * @typedef {Object} TriggerMoment
 * @property {string} id
 * @property {string} trigger
 * @property {string} emotion - discrete legacy label (calm|neutral|anxious|frustrated|energized)
 * @property {number} [valence] - continuous, -1 (unpleasant) to +1 (pleasant)
 * @property {number} [arousal] - continuous, -1 (low energy) to +1 (high energy)
 * @property {number} [intensity] - continuous, 0 (center) to 1 (edge)
 * @property {string} [derivedLabel] - human-readable Plutchik label from coordinates
 * @property {string} note
 * @property {string[]} [tags]
 * @property {string} timestamp
 * @property {string} ownerId
 * @property {boolean} isAnonymous
 */

/**
 * @typedef {Object} DailyAggregateSnapshot
 * @property {string} date
 * @property {number} total
 * @property {Record<string, number>} triggers
 * @property {Record<string, number>} emotions
 * @property {Record<string, number>} pairs
 * @property {Record<string, number>} timeOfDay
 */

/**
 * @typedef {Object} WeeklyAiInsight
 * @property {string} weekStart
 * @property {string} summary
 * @property {string} suggestion
 * @property {string} model
 * @property {string} generatedAt
 */

/**
 * @typedef {Object} WeeklyInsightReport
 * @property {string|null} topTrigger
 * @property {string|null} topEmotion
 * @property {string[]} tiedTriggers
 * @property {string[]} tiedEmotions
 * @property {boolean} hasDominantTrigger
 * @property {boolean} hasDominantEmotion
 * @property {{trigger: string, emotion: string, count: number}} topPair
 * @property {Record<string, number>} triggerFrequency
 * @property {Record<string, number>} emotionFrequency
 * @property {Record<string, Record<string, number>>} correlations
 * @property {Record<string, number>} timeOfDayPatterns
 * @property {Record<string, number>} energyDistribution
 * @property {Array<{trigger: string, emotion: string, count: number}>} regulators
 * @property {Array<{trigger: string, emotion: string, count: number}>} frictionZones
 * @property {Array<{trigger: string, emotion: string, count: number}>} pairings
 * @property {number} triggerConcentration
 * @property {number} emotionConcentration
 * @property {Array<{date: string, score: number, dominantEmotion: string}>} weeklyEmotionTrajectory
 * @property {number|null} volatilityScore
 * @property {string|null} mostStableDay
 * @property {string|null} trajectoryNote
 * @property {string|null} busiestTime
 * @property {Object} dataQuality
 * @property {DailyAggregateSnapshot[]} dailyAggregates
 * @property {WeeklyAiInsight | null} aiInsight
 * @property {number} totalMoments
 */

export const TYPES = {};