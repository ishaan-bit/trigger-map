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

      <View style={styles.header}>
        <Text style={styles.kicker}>Quick log</Text>
        <Text style={styles.prompt}>What triggered{"\n"}this moment?</Text>
        <Text style={styles.hint}>
          {todayCount > 0
            ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
            : "Tap a trigger to start"}
        </Text>
      </View>

      <Tooltip
        id="log_tooltip"
        text="Logging moments regularly helps reveal patterns."
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
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
    paddingBottom: 8,
  },
});