import { EMOTION_CARD_TINTS } from "../lib/designSystem";

const EMOTION_ECHOES = {
  // Positive valence
  calm:        ["A calm moment \u2014 let that settle in.", "Stillness noted. Your body remembers this."],
  peaceful:    ["Peace observed. Hold onto that.", "That gentleness \u2014 it matters."],
  content:     ["Contentment logged. That\u2019s enough.", "Quiet satisfaction \u2014 noted."],
  grateful:    ["Gratitude captured. That shifts things.", "Something good happened. We see it."],
  energized:   ["That spark \u2014 hold onto it.", "Energy captured."],
  excited:     ["That spark \u2014 hold onto it.", "Momentum logged. Remember what brought you here."],
  // Neutral
  neutral:     ["Steady ground. Not every moment needs to be loud.", "Sometimes neutral is exactly enough."],
  alert:       ["Heightened awareness \u2014 noted.", "Something has your attention."],
  flat:        ["Flatness logged. That\u2019s data too.", "Low energy noted."],
  restless:    ["Restlessness captured.", "That tension is visible now."],
  disconnected:["Disconnection logged.", "You showed up even when distant."],
  // Negative valence
  anxious:     ["That tension \u2014 we see it.", "Anxiety logged. Naming it is already a step."],
  overwhelmed: ["Overwhelm acknowledged.", "The pressure is visible now."],
  uneasy:      ["Unease noted. You didn\u2019t push it away.", "Something\u2019s off \u2014 and now it\u2019s on record."],
  frustrated:  ["Frustration acknowledged.", "That friction is real \u2014 and now it\u2019s visible."],
  heavy:       ["Heaviness logged.", "Naming it helps."],
  low:         ["Low energy noted.", "Even this matters."],
};

/** Map any derived label to a legacy emotion key for tint lookup */
function tintKey(label) {
  const map = {
    calm: "calm", peaceful: "calm", content: "calm", grateful: "calm",
    energized: "energized", excited: "energized",
    neutral: "neutral", alert: "neutral", flat: "neutral", restless: "neutral", disconnected: "neutral",
    anxious: "anxious", overwhelmed: "frustrated", uneasy: "anxious",
    frustrated: "frustrated", heavy: "frustrated", low: "frustrated",
  };
  return map[label] || "neutral";
}

function getEcho(emotion) {
  const echoes = EMOTION_ECHOES[emotion] || EMOTION_ECHOES.neutral;
  return echoes[Math.floor(Math.random() * echoes.length)];
}

export function FeedbackCard({ feedback, trigger, emotion }) {
  const legacy = tintKey(emotion);
  const tint = EMOTION_CARD_TINTS[legacy] || EMOTION_CARD_TINTS.neutral;
  const { patternFeedback, smartReflectionPrompt, pairCount } = feedback || {};

  let message;
  if (patternFeedback) {
    message = patternFeedback;
  } else if (pairCount >= 3) {
    message = `${trigger} + ${emotion} \u2014 ${pairCount} times this week. A pattern is forming.`;
  } else {
    message = getEcho(emotion);
  }

  return (
    <div className="feedbackCardWeb" style={{ backgroundColor: tint.bg, borderColor: tint.border }}>
      <div className="feedbackCardIcon" style={{ backgroundColor: tint.iconBg }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{emotion.slice(0, 3)}</span>
      </div>
      <div className="feedbackCardBody">
        <p className="feedbackCardMsg">{message}</p>
        {smartReflectionPrompt ? (
          <p className="feedbackCardReflection">{smartReflectionPrompt}</p>
        ) : null}
      </div>
    </div>
  );
}
