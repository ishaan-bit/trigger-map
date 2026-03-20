import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
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

const PROMPTS = [
  "What just happened?",
  "What pulled you here?",
  "What's on your mind?",
];

function getPrompt(count) {
  if (count >= 3) return "Back again — good habit.";
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
        <View style={styles.header}>
          <Text style={styles.kicker}>Quick log</Text>
          <Text style={styles.prompt}>{getPrompt(todayCount)}</Text>
          <Text style={styles.hint}>
            {todayCount > 0
              ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
              : "Tap a trigger to start logging"}
          </Text>
        </View>

        {/* Emotional weather forecast */}
        <MoodWeather moments={moments} />

        {/* Streak tracker */}
        <StreakOrb moments={moments} />

        <Tooltip
          id="log_tooltip"
          text="Logging a few moments each day reveals your emotional patterns."
          hidden={!predictionDone}
        />

        <DailyPrediction onVisibilityChange={(vis) => setPredictionDone(!vis)} />

        <View style={styles.grid}>
          {TRIGGERS.map((trigger) => (
            <TriggerTile
              key={trigger}
              label={trigger}
              onPress={() => router.push(`/emotion?trigger=${trigger}`)}
            />
          ))}
        </View>
      </Animated.View>

      <View style={styles.bottomCard}>
        <Text style={styles.bottomEmoji}>
          {todayCount >= 3 ? "✨" : todayCount > 0 ? "🔥" : "🌱"}
        </Text>
        <Text style={styles.bottomText}>
          {todayCount >= 3
            ? "Nice pattern data building up. Check your report later."
            : todayCount > 0
              ? `${3 - todayCount} more to unlock stronger observations this week.`
              : "Each moment you log sharpens your weekly pattern report."}
        </Text>
      </View>
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