import { useState, useEffect } from "react";

const OPTIONS = [
  { key: "calm",       emoji: "\u{1F343}", label: "Calm" },
  { key: "steady",     emoji: "\u2696\uFE0F", label: "Steady" },
  { key: "uneasy",     emoji: "\u{1F32C}\uFE0F", label: "Uneasy" },
  { key: "energized",  emoji: "\u26A1",     label: "Energized" },
  { key: "heavy",      emoji: "\u{1F4A2}",  label: "Heavy" },
];

const STORAGE_KEY = "triggermap_daily_prediction";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function DailyPrediction() {
  const [prediction, setPrediction] = useState(undefined);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === getTodayKey()) {
          setPrediction(parsed.value);
          return;
        }
      }
      setPrediction(null);
    } catch {
      setPrediction(null);
    }
  }, []);

  if (prediction !== null) return null;

  function handlePick(key) {
    setPrediction(key);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayKey(), value: key }));
    } catch { /* quota */ }
  }

  return (
    <div className="predictionCard sceneIn">
      <p className="predictionTitle">How do you think today will feel?</p>
      <div className="predictionOptions">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="predictionOption"
            onClick={() => handlePick(opt.key)}
            aria-label={`Predict ${opt.label}`}
          >
            <span className="predictionEmoji">{opt.emoji}</span>
            <span className="predictionLabel">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
