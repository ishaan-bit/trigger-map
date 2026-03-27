import { EMOTION_STYLES } from "../lib/designSystem";
import { derivedEmotionLabel, coordinatesToLegacy } from "@triggermap/shared/constants/emotions";

const BLOOM = {
  calm:       { seed: "\u{1F33F}", bloom: "\u{1F338}", color: "#5ee6a0" },
  neutral:    { seed: "\u{1F331}", bloom: "\u{1F33C}", color: "#9eb0c9" },
  anxious:    { seed: "\u{1F342}", bloom: "\u{1F341}", color: "#ffb347" },
  frustrated: { seed: "\u{1FAA8}", bloom: "\u{1F525}", color: "#ff6b7a" },
  energized:  { seed: "\u26A1",    bloom: "\u{1F33B}", color: "#a78bfa" },
};

/** Get the legacy emotion key for bloom lookup (supports both old and new formats) */
function bloomKey(m) {
  if (m.valence != null && m.arousal != null) {
    return coordinatesToLegacy(m.valence, m.arousal);
  }
  return m.emotion || "neutral";
}

/** Get display label (derived for new, discrete for old) */
function displayLabel(m) {
  if (m.valence != null && m.arousal != null) {
    return derivedEmotionLabel(m.valence, m.arousal);
  }
  return m.emotion || "neutral";
}

function getTodayBlooms(moments) {
  if (!moments?.length) return [];
  const today = new Date().toDateString();
  const todayMoments = moments.filter(
    (m) => new Date(m.timestamp).toDateString() === today
  );
  const now = Date.now();
  return todayMoments
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, 8)
    .map((m) => ({
      emotion: bloomKey(m),
      label: displayLabel(m),
      isMature: now - new Date(m.timestamp).getTime() > 3_600_000,
    }));
}

export function EmotionGarden({ moments }) {
  const todayBlooms = getTodayBlooms(moments);
  if (todayBlooms.length === 0) return null;

  return (
    <div className="gardenWrap sceneIn">
      <div className="gardenHeader">
        <span className="gardenTitle">Today&rsquo;s garden</span>
        <span className="gardenCount">{todayBlooms.length} bloom{todayBlooms.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="gardenRow">
        {todayBlooms.map((b, i) => {
          const meta = BLOOM[b.emotion] || BLOOM.neutral;
          const eStyle = EMOTION_STYLES[b.emotion] || EMOTION_STYLES.neutral;
          const icon = b.isMature ? meta.bloom : meta.seed;
          return (
            <div
              key={`${b.emotion}-${i}`}
              className={`bloomSlot ${i === todayBlooms.length - 1 ? "bloomSlotNewest" : ""}`}
              style={{
                backgroundColor: eStyle.bg,
                borderColor: eStyle.border,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <span className="bloomIcon">{icon}</span>
              <div className="bloomGlow" style={{ backgroundColor: eStyle.color }} />
              <span className="bloomLabel" style={{ color: eStyle.color }}>{b.label}</span>
            </div>
          );
        })}
        {todayBlooms.length < 6 && Array.from({ length: Math.min(3, 6 - todayBlooms.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="bloomSlotEmpty">
            <span className="bloomEmptyDot">&middot;</span>
          </div>
        ))}
      </div>
    </div>
  );
}
