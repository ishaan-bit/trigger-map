import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "./useSession";
import { resolveEmotion } from "../lib/emotionModel";

// Dominant-emotion palette — primary tint + soft ambient glows.
const EMOTION_PALETTE = {
  calm: { primary: "#5ee6a0", glow: "rgba(94, 230, 160, 0.08)", glowDeep: "rgba(94, 230, 160, 0.05)" },
  neutral: { primary: "#56d0e0", glow: "rgba(86, 208, 224, 0.06)", glowDeep: "rgba(86, 208, 224, 0.04)" },
  anxious: { primary: "#ffb347", glow: "rgba(255, 179, 71, 0.08)", glowDeep: "rgba(255, 179, 71, 0.05)" },
  frustrated: { primary: "#ff6b7a", glow: "rgba(255, 107, 122, 0.08)", glowDeep: "rgba(255, 107, 122, 0.05)" },
  energized: { primary: "#a78bfa", glow: "rgba(167, 139, 250, 0.08)", glowDeep: "rgba(167, 139, 250, 0.05)" },
};
const DEFAULT_PALETTE = EMOTION_PALETTE.neutral;

const SCORE = { frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5 };

const EmotionalStateContext = createContext({
  dominantEmotion: null,
  dominantTrigger: null,
  emotionalTrend: null,
  emotionColor: DEFAULT_PALETTE.primary,
  glowColor: DEFAULT_PALETTE.glow,
  glowDeepColor: DEFAULT_PALETTE.glowDeep,
  momentCount: 0,
  refresh: () => {},
});

function computeDominantEmotion(moments) {
  if (!moments?.length) return null;
  const now = Date.now();
  const recent = moments.filter((m) => now - new Date(m.timestamp).getTime() < 48 * 60 * 60 * 1000);
  if (!recent.length) return null;

  let totalWeight = 0;
  let weightedSum = 0;
  for (const m of recent) {
    const ageH = (now - new Date(m.timestamp).getTime()) / 3_600_000;
    const w = ageH < 2 ? 1.5 : ageH < 6 ? 1.2 : 1.0;
    weightedSum += (SCORE[resolveEmotion(m)] || 3) * w;
    totalWeight += w;
  }
  const avg = weightedSum / totalWeight;
  if (avg >= 4.0) return "calm";
  if (avg >= 3.3) return "energized";
  if (avg >= 2.6) return "neutral";
  if (avg >= 1.8) return "anxious";
  return "frustrated";
}

function computeDominantTrigger(moments) {
  if (!moments?.length) return null;
  const now = Date.now();
  const recent = moments.filter((m) => m.trigger && now - new Date(m.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000);
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
  const avg = (arr) => arr.reduce((s, m) => s + (SCORE[resolveEmotion(m)] || 3), 0) / arr.length;
  const diff = avg(recent) - avg(older);
  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}

export function EmotionalStateProvider({ children }) {
  const { loadTimeline, ready } = useSession();
  const [state, setState] = useState({
    dominantEmotion: null,
    dominantTrigger: null,
    emotionalTrend: null,
    momentCount: 0,
  });
  const loadRef = useRef(loadTimeline);
  loadRef.current = loadTimeline;

  const doRefresh = useCallback(() => {
    if (typeof loadRef.current !== "function") return;
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

  // Refresh once the session is ready, and whenever the tab regains focus.
  useEffect(() => {
    if (ready) doRefresh();
  }, [ready, doRefresh]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") doRefresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  return <EmotionalStateContext.Provider value={value}>{children}</EmotionalStateContext.Provider>;
}

export function useEmotionalState() {
  return useContext(EmotionalStateContext);
}
