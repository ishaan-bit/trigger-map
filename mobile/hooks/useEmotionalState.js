import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppSession } from "@/hooks/useAppSession";
import { palette } from "@/utils/theme";

const EMOTION_PALETTE = {
  calm:      { primary: palette.success,  glow: "rgba(94, 230, 160, 0.08)",  glowDeep: "rgba(94, 230, 160, 0.05)" },
  neutral:   { primary: palette.accent,   glow: "rgba(86, 208, 224, 0.06)",  glowDeep: "rgba(86, 208, 224, 0.04)" },
  anxious:   { primary: palette.warning,  glow: "rgba(255, 179, 71, 0.08)",  glowDeep: "rgba(255, 179, 71, 0.05)" },
  frustrated:{ primary: palette.danger,   glow: "rgba(255, 107, 122, 0.08)", glowDeep: "rgba(255, 107, 122, 0.05)" },
  energized: { primary: palette.purple,   glow: "rgba(167, 139, 250, 0.08)", glowDeep: "rgba(167, 139, 250, 0.05)" },
};

const DEFAULT_PALETTE = EMOTION_PALETTE.neutral;

const EmotionalStateContext = createContext({
  dominantEmotion: null,
  dominantTrigger: null,
  emotionalTrend: null,
  emotionColor: palette.accent,
  glowColor: DEFAULT_PALETTE.glow,
  glowDeepColor: DEFAULT_PALETTE.glowDeep,
  momentCount: 0,
  refresh: () => {},
});

const SCORE = { frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5 };

function computeDominantEmotion(moments) {
  if (!moments?.length) return null;
  const now = Date.now();
  const recent = moments.filter(
    (m) => now - new Date(m.timestamp).getTime() < 48 * 60 * 60 * 1000
  );
  if (!recent.length) return null;

  // Weighted average — same logic as MoodWeather
  let totalWeight = 0;
  let weightedSum = 0;
  for (const m of recent) {
    const ageH = (now - new Date(m.timestamp).getTime()) / 3_600_000;
    const w = ageH < 2 ? 1.5 : ageH < 6 ? 1.2 : 1.0;
    weightedSum += (SCORE[m.emotion] || 3) * w;
    totalWeight += w;
  }
  const avg = weightedSum / totalWeight;

  // Map to dominant emotion for palette selection
  if (avg >= 4.0) return "calm";
  if (avg >= 3.3) return "energized";
  if (avg >= 2.6) return "neutral";
  if (avg >= 1.8) return "anxious";
  return "frustrated";
}

function computeDominantTrigger(moments) {
  if (!moments?.length) return null;
  const now = Date.now();
  const recent = moments.filter(
    (m) => m.trigger && now - new Date(m.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
  );
  if (recent.length < 3) return null;
  const counts = {};
  for (const m of recent) counts[m.trigger] = (counts[m.trigger] || 0) + 1;
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || null;
}

function computeTrend(moments) {
  if (!moments?.length) return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const recent = moments.filter((m) => now - new Date(m.timestamp).getTime() < 3 * day);
  const older = moments.filter((m) => {
    const age = now - new Date(m.timestamp).getTime();
    return age >= 3 * day && age < 7 * day;
  });
  if (recent.length < 2 || older.length < 2) return null;
  const avg = (arr) => arr.reduce((s, m) => s + (SCORE[m.emotion] || 3), 0) / arr.length;
  const diff = avg(recent) - avg(older);
  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}

export function EmotionalStateProvider({ children }) {
  const { loadTimeline } = useAppSession();
  const [state, setState] = useState({
    dominantEmotion: null,
    dominantTrigger: null,
    emotionalTrend: null,
    momentCount: 0,
  });
  const loadRef = useRef(loadTimeline);
  loadRef.current = loadTimeline;

  const doRefresh = useCallback(() => {
    loadRef.current()
      .then((moments) => {
        const all = Array.isArray(moments) ? moments : [];
        setState({
          dominantEmotion: computeDominantEmotion(all),
          dominantTrigger: computeDominantTrigger(all),
          emotionalTrend: computeTrend(all),
          momentCount: all.length,
        });
      })
      .catch(() => {});
  }, []);

  // Refresh on every tab focus (works because individual screens re-focus)
  useFocusEffect(
    useCallback(() => {
      doRefresh();
    }, [doRefresh])
  );

  // Also refresh when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") doRefresh();
    });
    return () => sub.remove();
  }, [doRefresh]);

  const value = useMemo(() => {
    const ep = EMOTION_PALETTE[state.dominantEmotion] || DEFAULT_PALETTE;
    return {
      dominantEmotion: state.dominantEmotion,
      dominantTrigger: state.dominantTrigger,
      emotionalTrend: state.emotionalTrend,
      emotionColor: ep.primary,
      glowColor: ep.glow,
      glowDeepColor: ep.glowDeep,
      momentCount: state.momentCount,
      refresh: doRefresh,
    };
  }, [state, doRefresh]);

  return (
    <EmotionalStateContext.Provider value={value}>
      {children}
    </EmotionalStateContext.Provider>
  );
}

export function useEmotionalState() {
  return useContext(EmotionalStateContext);
}
