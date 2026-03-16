import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { ScreenShell } from "@/components/ScreenShell";
import { TriggerTile } from "@/components/TriggerTile";
import { Tooltip } from "@/components/Tooltip";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";

export function TriggerSelectionScreen() {
  const router = useRouter();
  const { loadTimeline } = useAppSession();
  const [todayCount, setTodayCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadTimeline()
        .then((moments) => {
          if (!active) return;
          const today = new Date().toDateString();
          const count = moments.filter(
            (m) => new Date(m.timestamp).toDateString() === today
          ).length;
          setTodayCount(count);
        })
        .catch(() => {});
      return () => { active = false; };
    }, [loadTimeline])
  );

  return (
    <ScreenShell scroll={false}>
      <View style={styles.top}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Quick log</Text>
          <Text style={styles.prompt}>What triggered{"\n"}this moment?</Text>
          <Text style={styles.hint}>
            {todayCount > 0
              ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
              : "Tap a trigger to start logging"}
          </Text>
        </View>

        <Tooltip
          id="log_tooltip"
          text="Logging a few moments each day reveals your emotional patterns."
        />

        <View style={styles.grid}>
          {TRIGGERS.map((trigger) => (
            <TriggerTile
              key={trigger}
              label={trigger}
              onPress={() => router.push(`/emotion?trigger=${trigger}`)}
            />
          ))}
        </View>
      </View>

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
    marginTop: 8,
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
    gap: 10,
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