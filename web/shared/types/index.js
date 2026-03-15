/**
 * @typedef {Object} TriggerMoment
 * @property {string} id
 * @property {string} trigger
 * @property {string} emotion
 * @property {string} note
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
 * @property {string} topTrigger
 * @property {string} topEmotion
 * @property {{trigger: string, emotion: string, count: number}} topPair
 * @property {Record<string, number>} triggerFrequency
 * @property {Record<string, number>} emotionFrequency
 * @property {Record<string, Record<string, number>>} correlations
 * @property {Record<string, number>} timeOfDayPatterns
 * @property {Record<string, number>} energyDistribution
 * @property {Array<{date: string, score: number, dominantEmotion: string}>} weeklyEmotionTrajectory
 * @property {number} volatilityScore
 * @property {string} volatilityChange
 * @property {string} mostStableDay
 * @property {DailyAggregateSnapshot[]} dailyAggregates
 * @property {WeeklyAiInsight | null} aiInsight
 * @property {string[]} insights
 * @property {number} totalMoments
 */

export const TYPES = {};