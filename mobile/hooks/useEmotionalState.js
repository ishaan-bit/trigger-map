import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAppSession } from "@/hooks/useAppSession";
import { palette } from "@/utils/theme";

const EMOTION_PALETTE = {
  calm:      { primary: palette.success,  glow: "rgba(94, 230, 160, 0.07)",  glowDeep: "rgba(94, 230, 160, 0.04)" },
  neutral:   { primary: palette.accent,   glow: "rgba(86, 208, 224, 0.05)",  glowDeep: "rgba(86, 208, 224, 0.03)" },
  anxious:   { primary: palette.warning,  glow: "rgba(255, 179, 71, 0.07)",  glowDeep: "rgba(255, 179, 71, 0.04)" },
  frustrated:{ primary: palette.danger,   glow: "rgba(255, 107, 122, 0.07)", glowDeep: "rgba(255, 107, 122, 0.04)" },
  energized: { primary: palette.purple,   glow: "rgba(167, 139, 250, 0.07)", glowDeep: "rgba(167, 139, 250, 0.04)" },
};

const DEFAULT_PALETTE = EMOTION_PALETTE.neutral;

const EmotionalStateContext = createContext({
  dominantEmotion: null,
  emotionColor: palette.accent,
  glowColor: DEFAULT_PALETTE.glow,
  glowDeepColor: DEFAULT_PALETTE.glowDeep,
  momentCount: 0,
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

export function EmotionalStateProvider({ children }) {
  const { loadTimeline } = useAppSession();
  const [state, setState] = useState({
    dominantEmotion: null,
    momentCount: 0,
  });
  const loadRef = useRef(loadTimeline);
  loadRef.current = loadTimeline;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRef.current()
        .then((moments) => {
          if (!active) return;
          const all = Array.isArray(moments) ? moments : [];
          setState({
            dominantEmotion: computeDominantEmotion(all),
            momentCount: all.length,
          });
        })
        .catch(() => {});
      return () => { active = false; };
    }, [])
  );

  const value = useMemo(() => {
    const ep = EMOTION_PALETTE[state.dominantEmotion] || DEFAULT_PALETTE;
    return {
      dominantEmotion: state.dominantEmotion,
      emotionColor: ep.primary,
      glowColor: ep.glow,
      glowDeepColor: ep.glowDeep,
      momentCount: state.momentCount,
    };
  }, [state]);

  return (
    <EmotionalStateContext.Provider value={value}>
      {children}
    </EmotionalStateContext.Provider>
  );
}

export function useEmotionalState() {
  return useContext(EmotionalStateContext);
}
