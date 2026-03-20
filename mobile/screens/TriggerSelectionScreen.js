import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { ScreenShell } from "@/components/ScreenShell";
import { TriggerTile } from "@/components/TriggerTile";
import { Tooltip } from "@/components/Tooltip";
import { DailyPrediction } from "@/components/DailyPrediction";
import { MoodWeather } from "@/components/MoodWeather";
import { StreakOrb } from "@/components/StreakOrb";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";
import { STAGGER_DELAY } from "@/utils/designSystem";

/** Stagger-in wrapper */
function StaggerIn({ index, children, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay: index * STAGGER_DELAY,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const PROMPTS = [
  "What just happened?",
  "What pulled you here?",
  "What's on your mind?",
];

function getPrompt(count) {
  if (count >= 3) return "Back again, good habit.";
  return PROMPTS[count % PROMPTS.length];
}

export function TriggerSelectionScreen() {
  const router = useRouter();
  const { loadTimeline } = useAppSession();
  const [todayCount, setTodayCount] = useState(0);
  const [moments, setMoments] = useState([]);
  const [predictionDone, setPredictionDone] = useState(true);
  const loadTimelineRef = useRef(loadTimeline);
  loadTimelineRef.current = loadTimeline;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      loadTimelineRef.current()
        .then((result) => {
          if (!active) return;
          const all = Array.isArray(result) ? result : [];
          setMoments(all);
          const today = new Date().toDateString();
          const count = all.filter(
            (m) => new Date(m.timestamp).toDateString() === today
          ).length;
          setTodayCount(count);
        })
        .catch(() => {});
      return () => { active = false; };
    }, [fadeAnim])
  );

  return (
    <ScreenShell scroll edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.top, { opacity: fadeAnim }]}>
        <StaggerIn index={0}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Quick log</Text>
            <Text style={styles.prompt}>{getPrompt(todayCount)}</Text>
            <Text style={styles.hint}>
              {todayCount > 0
                ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
                : "Tap a trigger to start logging"}
            </Text>
          </View>
        </StaggerIn>

        {/* Emotional weather forecast */}
        <StaggerIn index={1}>
          <MoodWeather moments={moments} />
        </StaggerIn>

        {/* Streak tracker */}
        <StaggerIn index={2}>
          <StreakOrb moments={moments} />
        </StaggerIn>

        <Tooltip
          id="log_tooltip"
          text="Logging a few moments each day reveals your emotional patterns."
          hidden={!predictionDone}
        />

        <StaggerIn index={3}>
          <DailyPrediction onVisibilityChange={(vis) => setPredictionDone(!vis)} />
        </StaggerIn>

        <View style={styles.grid}>
          {TRIGGERS.map((trigger, i) => (
            <StaggerIn key={trigger} index={4 + i} style={styles.gridItem}>
              <TriggerTile
                label={trigger}
                onPress={() => router.push(`/emotion?trigger=${trigger}`)}
              />
            </StaggerIn>
          ))}
        </View>
      </Animated.View>

      <StaggerIn index={4 + TRIGGERS.length}>
        <View style={styles.bottomCard}>
          <Text style={styles.bottomEmoji}>
            {moments.length >= 10 ? "🌟" : todayCount >= 3 ? "✨" : todayCount > 0 ? "🔥" : "🌱"}
          </Text>
          <Text style={styles.bottomText}>
            {moments.length >= 10
              ? "Strong week so far. Your patterns are getting sharper."
              : todayCount >= 3
                ? "Nice pattern data building up. Check your report later."
                : moments.length >= 5
                  ? "Good momentum this week. Keep going for richer insights."
                  : todayCount > 0
                    ? `${3 - todayCount} more today to strengthen this week's observations.`
                    : "Each moment you log sharpens your weekly pattern report."}
          </Text>
        </View>
      </StaggerIn>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  top: {
    flex: 1,
    gap: 20,
  },
  header: {
    gap: 6,
    marginTop: 10,
    marginBottom: 0,
  },
  kicker: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  prompt: {
    color: palette.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  hint: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
    paddingBottom: 4,
  },
  gridItem: {
    width: "30%",
  },
  bottomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  bottomEmoji: {
    fontSize: 18,
  },
  bottomText: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});