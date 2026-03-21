const TIER_MAP = {
  spark:     { icon: "\u{1F56F}\uFE0F", color: "#9eb0c9", message: "A spark lit. Keep it going." },
  building:  { icon: "\u{1F525}",        color: "#ffb347", message: "Building momentum." },
  strong:    { icon: "\u{1F525}",        color: "#ff6b7a", message: "Strong habit forming." },
  legendary: { icon: "\u2726",           color: "#a78bfa", message: "Legendary awareness streak." },
};

function computeStreak(moments) {
  if (!moments?.length) return 0;
  const dateSet = new Set();
  for (const m of moments) {
    dateSet.add(new Date(m.timestamp).toDateString());
  }
  const dates = [...dateSet].map((d) => new Date(d)).sort((a, b) => b - a);
  if (dates.length === 0) return 0;

  const today = new Date();
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (dates[0].toDateString() !== todayStr && dates[0].toDateString() !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i - 1] - dates[i]) / 86_400_000;
    if (Math.round(diff) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function StreakOrb({ moments }) {
  const streak = computeStreak(moments);
  if (streak < 1) return null;

  const tier = streak >= 14 ? "legendary" : streak >= 7 ? "strong" : streak >= 3 ? "building" : "spark";
  const tierMeta = TIER_MAP[tier];

  return (
    <div className="streakOrbWrap sceneIn">
      <div className="streakOrbGlow" style={{ backgroundColor: tierMeta.color }} />
      <div className="streakOrbContent">
        <span className="streakOrbIcon">{tierMeta.icon}</span>
        <div className="streakOrbText">
          <span className="streakOrbCount" style={{ color: tierMeta.color }}>{streak}-day streak</span>
          <span className="streakOrbSub">{tierMeta.message}</span>
        </div>
      </div>
    </div>
  );
}
