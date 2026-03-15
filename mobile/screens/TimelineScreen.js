import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TimelineGroup } from "@/components/TimelineGroup";
import { MicroInsight } from "@/components/MicroInsight";
import { Tooltip } from "@/components/Tooltip";
import { useAppSession } from "@/hooks/useAppSession";
import { getRelativeDayLabel } from "@/utils/date";
import { generateMicroInsights } from "@/utils/microInsights";
import { palette } from "@/utils/theme";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";

function groupByDay(moments) {
  const groups = {};
  for (const moment of moments) {
    const label = getRelativeDayLabel(moment.timestamp);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(moment);
  }
  return Object.entries(groups);
}

export function TimelineScreen() {
  const router = useRouter();
  const { loadTimeline, updateMoment, removeMoment, user, token } = useAppSession();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dayGroups = useMemo(() => groupByDay(moments), [moments]);
  const microInsights = useMemo(() => generateMicroInsights(moments), [moments]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await loadTimeline();
      setMoments(Array.isArray(result) ? result : []);
    } catch {
      setMoments([]);
      setError("Unable to load timeline. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [loadTimeline]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleEdit = useCallback((moment) => {
    const triggerOptions = TRIGGERS.map((t) => ({
      text: t === moment.trigger ? `${t} ✓` : t,
      onPress: () => {
        const emotionOptions = EMOTIONS.map((e) => ({
          text: e === moment.emotion ? `${e} ✓` : e,
          onPress: async () => {
            try {
              await updateMoment(moment.id, { trigger: t, emotion: e });
              await load();
            } catch (err) {
              Alert.alert("Edit failed", err.message);
            }
          },
        }));
        emotionOptions.push({ text: "Cancel", style: "cancel" });
        Alert.alert("Choose emotion", null, emotionOptions);
      },
    }));
    triggerOptions.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Choose trigger", null, triggerOptions);
  }, [updateMoment, load]);

  const handleDelete = useCallback(async (moment) => {
    try {
      await removeMoment(moment.id);
      setMoments((prev) => prev.filter((m) => m.id !== moment.id));
    } catch (err) {
      Alert.alert("Delete failed", err.message);
    }
  }, [removeMoment]);

  return (
    <ScreenShell
      loading={loading}
      loadingTitle="Loading your timeline"
      loadingMessage="Fetching your latest logged moments."
      timeoutMessage="Unable to load timeline. Check connection."
      onRetry={load}
      scroll
    >
      <Image source={require("@/assets/timeline-empty.png")} style={styles.bgImage} resizeMode="cover" accessible={false} />

      <View style={styles.header}>
        <Text style={styles.kicker}>Past 7 days</Text>
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.subtitle}>
          {moments.length
            ? `${moments.length} moment${moments.length !== 1 ? "s" : ""} this week`
            : "Your trigger moments, grouped by day."}
        </Text>
      </View>

      <Tooltip
        id="timeline_tooltip"
        text="Your timeline shows how triggers connect to emotions over time."
      />

      {microInsights.length > 0 ? (
        <View style={styles.microInsights}>
          {microInsights.map((text, idx) => (
            <MicroInsight key={idx} text={text} />
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Timeline unavailable</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <PrimaryButton label="Retry" onPress={load} />
        </View>
      ) : null}

      {!error && dayGroups.map(([dayLabel, dayMoments]) => (
        <View key={dayLabel} style={styles.daySection}>
          <Text style={styles.dayHeader}>{dayLabel}</Text>
          {dayMoments.map((moment) => (
            <TimelineGroup
              key={moment.id}
              moment={moment}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </View>
      ))}

      {!moments.length && !loading && !error ? (
        <View style={[styles.stateCard, styles.emptyStateCard]}>
          <Image
            source={require("@/assets/timeline-empty.png")}
            style={styles.emptyIllustration}
            resizeMode="contain"
            accessible={false}
          />
          <Text style={styles.stateTitle}>No moments yet</Text>
          <Text style={styles.stateBody}>Your timeline will appear after your first saved moment.</Text>
          <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  bgImage: {
    position: "absolute",
    top: 0,
    left: -24,
    right: -24,
    bottom: 0,
    width: undefined,
    height: undefined,
    opacity: 0.04,
  },
  header: {
    gap: 4,
    marginTop: 12,
  },
  kicker: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  daySection: {
    gap: 8,
  },
  microInsights: {
    gap: 8,
  },
  dayHeader: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(197,214,235,0.06)",
  },
  stateCard: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  emptyStateCard: {
    alignItems: "center",
  },
  emptyIllustration: {
    width: 140,
    height: 140,
    marginBottom: 4,
  },
  stateTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  stateBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});