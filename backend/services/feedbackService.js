import { getWeeklyPairCount } from "./aggregationService.js";

export async function generateImmediateFeedback(ownerId, moment, lang = "en") {
  const pairCount = await getWeeklyPairCount(ownerId, moment.trigger, moment.emotion);
  const hi = lang === "hi";
  const patternFeedback = pairCount >= 3
    ? (hi
        ? `पैटर्न मिला: ${capitalize(moment.trigger)} ने इस हफ़्ते कई बार ${moment.emotion} ट्रिगर किया।`
        : `Pattern detected: ${capitalize(moment.trigger)} triggered ${moment.emotion} several times this week.`)
    : null;

  let smartReflectionPrompt = null;
  if (moment.trigger === "exercise" && moment.emotion === "calm") {
    smartReflectionPrompt = hi
      ? "आप व्यायाम के बाद अक्सर शांत महसूस करते हैं। क्या आज कुछ अलग था?"
      : "You often feel calmer after exercise. Was anything different about today?";
  } else if (pairCount >= 4) {
    smartReflectionPrompt = hi
      ? `आपने इस हफ़्ते ${moment.trigger} के बाद ${pairCount} बार ${moment.emotion} लॉग किया। आमतौर पर ठीक पहले क्या होता है?`
      : `You've logged ${moment.emotion} after ${moment.trigger} ${pairCount} times this week. What usually happens right before it?`;
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