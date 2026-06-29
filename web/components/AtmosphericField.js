/**
 * AtmosphericField (web) — the living emotional atmosphere behind every screen.
 *
 * Web port of mobile/components/AtmosphericField.js. Four large soft-edged
 * radial-gradient blobs slowly drift, breathe and scale, their hue driven by the
 * current dominant emotion (AURORA triad). A radial vignette deepens the edges so
 * foreground glass reads with depth. Pure CSS transform/opacity animation (no
 * blur filters) keeps it cheap on iOS Safari; respects prefers-reduced-motion.
 * pointer-events:none — it never intercepts touch.
 */
import { useEmotionalState } from "../hooks/useEmotionalState";
import { AURORA } from "../lib/emotionModel";

export function AtmosphericField({ emotion, intensity = 1 }) {
  const { dominantEmotion } = useEmotionalState();
  const key = emotion || dominantEmotion || "neutral";
  const hues = AURORA[key] || AURORA.neutral;

  const blobs = [
    { cls: "atmoBlobA", color: hues[0], op: 0.18 * intensity },
    { cls: "atmoBlobB", color: hues[1], op: 0.15 * intensity },
    { cls: "atmoBlobC", color: hues[2], op: 0.13 * intensity },
    { cls: "atmoBlobD", color: hues[0], op: 0.12 * intensity },
  ];

  return (
    <div className="atmoField" aria-hidden="true">
      {blobs.map((b, i) => (
        <div
          key={i}
          className={`atmoBlob ${b.cls}`}
          style={{ "--blob-color": b.color, "--blob-op": b.op }}
        />
      ))}
      <div className="atmoVignette" />
    </div>
  );
}

export default AtmosphericField;
