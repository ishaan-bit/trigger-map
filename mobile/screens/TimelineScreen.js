import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TimelineGroup } from "@/components/TimelineGroup";
import { EditMomentModal } from "@/components/EditMomentModal";
import { MicroInsight } from "@/components/MicroInsight";
import { Tooltip } from "@/components/Tooltip";
import { useAppSession } from "@/hooks/useAppSession";
import { getRelativeDayLabel } from "@/utils/date";
import { generateMicroInsights } from "@/utils/microInsights";
import { palette } from "@/utils/theme";

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
  const [editingMoment, setEditingMoment] = useState(null);

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
    setEditingMoment(moment);
  }, []);

  const handleSaveEdit = useCallback(async (momentId, updates) => {
    try {
      await updateMoment(momentId, updates);
      setEditingMoment(null);
      await load();
    } catch (err) {
      Alert.alert("Edit failed", err.message);
    }
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>No moments yet</Text>
          <Text style={styles.emptyBody}>
            Start logging triggers and emotions to see{"\n"}your timeline come to life.
          </Text>
          <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
        </View>
      ) : null}

      <EditMomentModal
        visible={!!editingMoment}
        moment={editingMoment}
        onSave={handleSaveEdit}
        onClose={() => setEditingMoment(null)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    paddingBottom: 32,
    gap: 14,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 4,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 260,
    marginBottom: 8,
  },
});