import { EMOTION_CARD_TINTS } from "../lib/designSystem";

const EMOTION_EMOJIS = {
  calm: "\u{1F60C}", neutral: "\u{1F610}", anxious: "\u{1F630}", frustrated: "\u{1F624}", energized: "\u26A1",
};

const EMOTION_ECHOES = {
  calm: [
    "A calm moment \u2014 let that settle in.",
    "Stillness noted. Your body remembers this.",
    "That quiet feeling matters more than you think.",
  ],
  neutral: [
    "Steady ground. Not every moment needs to be loud.",
    "Noted \u2014 even the in-between matters.",
    "Sometimes neutral is exactly enough.",
  ],
  anxious: [
    "That tension you\u2019re carrying \u2014 we see it.",
    "Anxiety logged. Naming it is already a step.",
    "You showed up even when it felt heavy.",
  ],
  frustrated: [
    "Frustration acknowledged. You didn\u2019t push it away.",
    "That friction is real \u2014 and now it\u2019s visible.",
    "Logged. Frustration loses power when it\u2019s seen.",
  ],
  energized: [
    "That spark \u2014 hold onto it.",
    "Energy captured. This is the fuel you come back to.",
    "Momentum logged. Remember what brought you here.",
  ],
};

function getEcho(emotion) {
  const echoes = EMOTION_ECHOES[emotion] || EMOTION_ECHOES.neutral;
  return echoes[Math.floor(Math.random() * echoes.length)];
}

export function FeedbackCard({ feedback, trigger, emotion }) {
  const icon = EMOTION_EMOJIS[emotion] || "\u{1F4AB}";
  const tint = EMOTION_CARD_TINTS[emotion] || EMOTION_CARD_TINTS.neutral;
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
        <span>{icon}</span>
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
