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
 * @typedef {Object} WeeklyInsightReport
 * @property {string} topTrigger
 * @property {string} topEmotion
 * @property {Record<string, number>} triggerFrequency
 * @property {Record<string, number>} emotionFrequency
 * @property {Record<string, Record<string, number>>} correlations
 * @property {Record<string, number>} timeOfDayPatterns
 * @property {string[]} insights
 */

export const TYPES = {};