import { getWeeklyPairCount } from "./aggregationService.js";

export async function generateImmediateFeedback(ownerId, moment) {
  const pairCount = await getWeeklyPairCount(ownerId, moment.trigger, moment.emotion);
  const patternFeedback = pairCount >= 3
    ? `Pattern detected: ${capitalize(moment.trigger)} triggered ${moment.emotion} several times this week.`
    : null;

  let smartReflectionPrompt = null;
  if (moment.trigger === "exercise" && moment.emotion === "calm") {
    smartReflectionPrompt = "You often feel calmer after exercise. Was anything different about today?";
  } else if (pairCount >= 4) {
    smartReflectionPrompt = `You've logged ${moment.emotion} after ${moment.trigger} ${pairCount} times this week. What usually happens right before it?`;
  }

  return {
    pairCount,
    patternFeedback,
    smartReflectionPrompt,
  };
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}