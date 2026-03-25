import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TimelineGroup } from "@/components/TimelineGroup";
import { EditMomentModal } from "@/components/EditMomentModal";
import { MicroInsight } from "@/components/MicroInsight";
import { MoodWeather } from "@/components/MoodWeather";
import { EmotionGarden } from "@/components/EmotionGarden";
import { Tooltip } from "@/components/Tooltip";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { getRelativeDayLabel } from "@/utils/date";
import { generateMicroInsights } from "@/utils/microInsights";
import { palette, radius } from "@/utils/theme";

const EMOTION_COLORS = {
  calm: palette.success,
  neutral: palette.muted,
  anxious: palette.warning,
  frustrated: palette.danger,
  energized: palette.accent,
};

const MERGE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Merge duplicate entries: if same trigger + emotion within 30 min → group into one entry with count
 */
function mergeSimilarMoments(moments) {
  if (!moments?.length) return [];
  const merged = [];
  for (const m of moments) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.trigger === m.trigger &&
      last.emotion === m.emotion &&
      Math.abs(new Date(last.timestamp).getTime() - new Date(m.timestamp).getTime()) < MERGE_WINDOW_MS
    ) {
      if (!last._grouped) {
        last._grouped = [last.id];
        last._count = 1;
      }
      last._grouped.push(m.id);
      last._count += 1;
      // Keep earliest timestamp
      if (new Date(m.timestamp) < new Date(last.timestamp)) {
        last.timestamp = m.timestamp;
      }
      // Merge notes
      if (m.note && !last.note) last.note = m.note;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

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
  const { t } = useLanguage();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMoment, setEditingMoment] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const dayGroups = useMemo(() => {
    const merged = mergeSimilarMoments(moments);
    return groupByDay(merged);
  }, [moments]);
  const microInsights = useMemo(() => generateMicroInsights(moments), [moments]);

  // Identify the newest moment for highlighting
  const newestMomentId = useMemo(() => {
    if (!moments.length) return null;
    return moments.reduce((newest, m) =>
      new Date(m.timestamp) > new Date(newest.timestamp) ? m : newest
    , moments[0]).id;
  }, [moments]);

  const loadTimelineRef = useRef(loadTimeline);
  loadTimelineRef.current = loadTimeline;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await loadTimelineRef.current();
      const loaded = Array.isArray(result) ? result : [];
      setMoments(loaded);
      // Highlight the newest moment briefly when timeline loads
      if (loaded.length > 0) {
        const newest = loaded.reduce((acc, m) =>
          new Date(m.timestamp) > new Date(acc.timestamp) ? m : acc
        , loaded[0]);
        setHighlightId(newest.id);
        highlightAnim.setValue(1);
        Animated.timing(highlightAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => setHighlightId(null));
      }
    } catch {
      setMoments([]);
      setError("Unable to load timeline. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [highlightAnim]);

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
      loadingTitle={t("timeline.loadingTitle")}
      loadingMessage={t("timeline.loadingMessage")}
      timeoutMessage={t("timeline.timeoutMessage")}
      onRetry={load}
      scroll
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>{t("timeline.kicker")}</Text>
        <Text style={styles.title}>{t("timeline.title")}</Text>
        <Text style={styles.subtitle}>
          {moments.length
            ? (moments.length !== 1 ? t("timeline.subtitleWithCountPlural", { count: moments.length }) : t("timeline.subtitleWithCount", { count: moments.length }))
            : t("timeline.subtitleEmpty")}
        </Text>
      </View>

      {/* Emotional weather ribbon */}
      <MoodWeather moments={moments} />

      {/* Today's emotion garden */}
      <EmotionGarden moments={moments} />

      <Tooltip
        id="timeline_tooltip"
        text={t("timeline.tooltip")}
        hidden={microInsights.length > 0}
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
          <Text style={styles.stateTitle}>{t("timeline.unavailable")}</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <PrimaryButton label="Retry" onPress={load} />
        </View>
      ) : null}

      {!error && dayGroups.map(([dayLabel, dayMoments]) => (
        <View key={dayLabel} style={styles.daySection}>
          <Text style={styles.dayHeader}>{dayLabel}</Text>
          <View style={styles.timelineConnector}>
            {dayMoments.map((moment, idx) => {
              const emotionColor = EMOTION_COLORS[moment.emotion] || palette.muted;
              const isLast = idx === dayMoments.length - 1;
              const isHighlighted = moment.id === highlightId;
              const cardBorderColor = isHighlighted
                ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [palette.glassBorder, emotionColor] })
                : undefined;
              const cardShadowOpacity = isHighlighted
                ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] })
                : undefined;
              return (
                <View key={moment.id} style={styles.timelineItem}>
                  {/* Connector dot + line */}
                  <View style={styles.connectorColumn}>
                    <View style={[styles.connectorDot, { backgroundColor: emotionColor }]} />
                    {!isLast && <View style={[styles.connectorLine, { backgroundColor: `${emotionColor}40` }]} />}
                  </View>
                  <Animated.View style={[styles.timelineCardWrap, isHighlighted && {
                    borderColor: cardBorderColor,
                    borderWidth: 1.5,
                    borderRadius: radius.md,
                    shadowColor: emotionColor,
                    shadowOpacity: cardShadowOpacity,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 12,
                    elevation: 4,
                  }]}>
                    <TimelineGroup
                      moment={moment}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      groupCount={moment._count}
                    />
                  </Animated.View>
                </View>
              );
            })}
          </View>
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
    gap: 6,
    marginTop: 10,
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
    lineHeight: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  daySection: {
    gap: 4,
  },
  timelineConnector: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  connectorColumn: {
    width: 20,
    alignItems: "center",
    paddingTop: 18,
  },
  connectorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    marginTop: 2,
  },
  timelineCardWrap: {
    flex: 1,
    paddingBottom: 8,
  },
  microInsights: {
    gap: 8,
  },
  dayHeader: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: palette.glassBorder,
  },
  stateCard: {
    borderRadius: radius.md,
    padding: 20,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 10,
  },
  stateTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  stateBody: {
    color: palette.textSecondary,
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
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 260,
    marginBottom: 8,
  },
});