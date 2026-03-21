const WEATHER_MAP = {
  clear:     { icon: "\u2600\uFE0F", label: "Clear skies",  color: "#5ee6a0", desc: "Mostly calm, your recent moments feel settled." },
  clearing:  { icon: "\u{1F324}\uFE0F", label: "Clearing up",  color: "#5ee6a0", desc: "Leaning positive, more calm than tension today." },
  neutral:   { icon: "\u{1F324}\uFE0F", label: "Partly clear", color: "#9eb0c9", desc: "A steady mix, nothing pulling too hard in any direction." },
  overcast:  { icon: "\u{1F327}\uFE0F", label: "Overcast",     color: "#ffb347", desc: "Some tension showing up. Be gentle with yourself." },
  turbulent: { icon: "\u26C8\uFE0F",    label: "Turbulent",    color: "#ff6b7a", desc: "Frustration running high, something is grinding." },
  electric:  { icon: "\u26A1",          label: "Electric",     color: "#a78bfa", desc: "High energy, you're riding a wave right now." },
  mixed:     { icon: "\u{1F326}\uFE0F", label: "Changeable",   color: "#c084fc", desc: "Emotions shifting, your inner weather is restless today." },
  quiet:     { icon: "\u{1F319}",       label: "Still night",  color: "#9eb0c9", desc: "Not much data yet today, log a moment to see your forecast." },
};

const SCORE = { frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5 };

function recencyWeight(ageMs) {
  const hours = ageMs / 3_600_000;
  if (hours < 2) return 1.5;
  if (hours < 6) return 1.2;
  return 1.0;
}

function computeWeather(moments) {
  if (!moments?.length) return WEATHER_MAP.quiet;
  const now = Date.now();
  const recent = moments.filter(
    (m) => now - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000
  );
  if (recent.length === 0) return WEATHER_MAP.quiet;

  let totalWeight = 0;
  let weightedSum = 0;
  const counts = {};
  for (const m of recent) {
    const w = recencyWeight(now - new Date(m.timestamp).getTime());
    weightedSum += (SCORE[m.emotion] || 3) * w;
    totalWeight += w;
    counts[m.emotion] = (counts[m.emotion] || 0) + 1;
  }
  const avg = weightedSum / totalWeight;

  const distinctEmotions = Object.keys(counts).length;
  if (recent.length >= 8 && distinctEmotions >= 4) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] - (sorted[1]?.[1] || 0) <= 1) return WEATHER_MAP.mixed;
  }

  if (counts.energized && counts.energized >= recent.length * 0.5) return WEATHER_MAP.electric;
  if (avg >= 4.0) return WEATHER_MAP.clear;
  if (avg >= 3.3) return WEATHER_MAP.clearing;
  if (avg >= 2.6) return WEATHER_MAP.neutral;
  if (avg >= 1.8) return WEATHER_MAP.overcast;
  return WEATHER_MAP.turbulent;
}

export function MoodWeather({ moments }) {
  const weather = computeWeather(moments);
  const showBreathe = weather === WEATHER_MAP.overcast || weather === WEATHER_MAP.turbulent;

  return (
    <div
      className="weatherRibbon sceneIn"
      style={{ borderColor: `${weather.color}30` }}
    >
      <div className="weatherShimmer" style={{ background: `linear-gradient(90deg, transparent, ${weather.color}0a, transparent)` }} />
      <span className="weatherIcon">{weather.icon}</span>
      <div className="weatherCopy">
        <strong className="weatherLabel" style={{ color: weather.color }}>{weather.label}</strong>
        <p className="weatherDesc">{weather.desc}</p>
      </div>
      {showBreathe && (
        <div className="weatherBreatheRow">
          <div className="weatherBreatheDot" style={{ backgroundColor: weather.color }} />
          <span className="weatherBreatheText">Breathe with the dot</span>
        </div>
      )}
    </div>
  );
}
