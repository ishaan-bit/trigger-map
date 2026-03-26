import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
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
import { legacyToCoordinates } from "@triggermap/shared/constants/emotions";
import { emotionColor as getEmotionColor } from "@/utils/emotionModel";
import { tap } from "@/utils/haptics";

const EMOTION_COLORS = {
  calm: palette.success,
  neutral: palette.muted,
  anxious: palette.warning,
  frustrated: palette.danger,
  energized: palette.accent,
};

const MERGE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const TRAJECTORY_SIZE = 260;

/** 2D Emotional Trajectory — plots moments as dots on valence/arousal field */
function EmotionTrajectory({ moments, onTapPoint }) {
  const points = useMemo(() => {
    return moments
      .filter((m) => m.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((m) => {
        const v = typeof m.valence === "number" ? m.valence : (legacyToCoordinates(m.emotion)?.valence || 0);
        const a = typeof m.arousal === "number" ? m.arousal : (legacyToCoordinates(m.emotion)?.arousal || 0);
        return { id: m.id, valence: v, arousal: a, emotion: m.emotion, trigger: m.trigger, note: m.note, tags: m.tags, timestamp: m.timestamp };
      });
  }, [moments]);

  if (points.length < 2) return null;

  const cx = TRAJECTORY_SIZE / 2;
  const cy = TRAJECTORY_SIZE / 2;
  const toX = (v) => cx + v * (cx - 20);
  const toY = (a) => cy - a * (cy - 20);

  return (
    <View style={ts.container}>
      <Text style={ts.heading}>Emotional Trajectory</Text>
      <View style={ts.field}>
        {/* Axis labels */}
        <Text style={[ts.axisLabel, ts.axisTop]}>↑ energized</Text>
        <Text style={[ts.axisLabel, ts.axisBottom]}>↓ low</Text>
        <Text style={[ts.axisLabel, ts.axisLeft]}>← tense</Text>
        <Text style={[ts.axisLabel, ts.axisRight]}>calm →</Text>
        {/* Grid lines */}
        <View style={[ts.gridH, { top: cy }]} />
        <View style={[ts.gridV, { left: cx }]} />
        {/* Connecting lines (trail) */}
        {points.map((pt, idx) => {
          if (idx === 0) return null;
          const prev = points[idx - 1];
          const x1 = toX(prev.valence);
          const y1 = toY(prev.arousal);
          const x2 = toX(pt.valence);
          const y2 = toY(pt.arousal);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const opacity = 0.15 + (idx / points.length) * 0.35;
          return (
            <View key={`line-${idx}`} style={{
              position: "absolute", left: x1, top: y1, width: length, height: 1.5,
              backgroundColor: palette.accent, opacity,
              transform: [{ rotate: `${angle}deg` }], transformOrigin: "0 0",
            }} />
          );
        })}
        {/* Dots */}
        {points.map((pt, idx) => {
          const isLast = idx === points.length - 1;
          const color = getEmotionColor(pt.valence, pt.arousal);
          const size = isLast ? 14 : 8;
          const opacity = 0.3 + (idx / points.length) * 0.7;
          return (
            <Pressable
              key={pt.id}
              onPress={() => onTapPoint?.(pt)}
              style={{
                position: "absolute",
                left: toX(pt.valence) - size / 2,
                top: toY(pt.arousal) - size / 2,
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: color, opacity,
                borderWidth: isLast ? 2 : 0, borderColor: "rgba(255,255,255,0.5)",
                shadowColor: color, shadowOpacity: isLast ? 0.6 : 0, shadowRadius: 6, elevation: isLast ? 4 : 0,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  container: { gap: 8, marginVertical: 8 },
  heading: { color: palette.text, fontSize: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  field: {
    width: TRAJECTORY_SIZE, height: TRAJECTORY_SIZE, alignSelf: "center",
    backgroundColor: "rgba(6, 10, 18, 0.85)", borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.glassBorder, position: "relative", overflow: "hidden",
  },
  axisLabel: { position: "absolute", color: palette.muted, fontSize: 9, fontWeight: "600", opacity: 0.5 },
  axisTop: { top: 4, left: 0, right: 0, textAlign: "center" },
  axisBottom: { bottom: 4, left: 0, right: 0, textAlign: "center" },
  axisLeft: { left: 4, top: TRAJECTORY_SIZE / 2 - 6 },
  axisRight: { right: 4, top: TRAJECTORY_SIZE / 2 - 6, textAlign: "right" },
  gridH: { position: "absolute", left: 20, right: 20, height: 1, backgroundColor: "rgba(148,180,224,0.08)" },
  gridV: { position: "absolute", top: 20, bottom: 20, width: 1, backgroundColor: "rgba(148,180,224,0.08)" },
});

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

function groupByDay(moments, t, lang) {
  const groups = {};
  for (const moment of moments) {
    const label = getRelativeDayLabel(moment.timestamp, t, lang);
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
  const { t, lang } = useLanguage();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMoment, setEditingMoment] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const dayGroups = useMemo(() => {
    const merged = mergeSimilarMoments(moments);
    return groupByDay(merged, t, lang);
  }, [moments, t, lang]);
  const microInsights = useMemo(() => generateMicroInsights(moments, t), [moments, t]);

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
      setError(t("timeline.unavailable"));
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
      Alert.alert(t("timeline.editFailed"), err.message);
    }
  }, [updateMoment, load]);

  const handleDelete = useCallback(async (moment) => {
    try {
      await removeMoment(moment.id);
      setMoments((prev) => prev.filter((m) => m.id !== moment.id));
    } catch (err) {
      Alert.alert(t("timeline.deleteFailed"), err.message);
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

      {/* Trajectory toggle */}
      {moments.length >= 2 && (
        <Pressable
          onPress={() => { tap(); setShowTrajectory((p) => !p); }}
          style={styles.trajectoryToggle}
        >
          <Text style={styles.trajectoryToggleText}>
            {showTrajectory ? "▾ hide trajectory" : "▸ emotional trajectory"}
          </Text>
        </Pressable>
      )}

      {/* 2D Emotional Trajectory */}
      {showTrajectory && moments.length >= 2 && (
        <EmotionTrajectory
          moments={moments}
          onTapPoint={(pt) => {
            tap();
            Alert.alert(
              pt.trigger || "Moment",
              [pt.emotion, pt.note, new Date(pt.timestamp).toLocaleTimeString()].filter(Boolean).join("\n"),
            );
          }}
        />
      )}

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
          <PrimaryButton label={t("report.retry")} onPress={load} />
        </View>
      ) : null}

      {!error && dayGroups.map(([dayLabel, dayMoments]) => (
        <View key={dayLabel} style={styles.daySection}>
          <Text style={styles.dayHeader}>{dayLabel}</Text>
          <View style={styles.timelineConnector}>
            {dayMoments.map((moment, idx) => {
              const emotionColor = (typeof moment.valence === "number")
                ? getEmotionColor(moment.valence, moment.arousal)
                : (EMOTION_COLORS[moment.emotion] || palette.muted);
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
          <Text style={styles.emptyTitle}>{t("timeline.emptyTitle")}</Text>
          <Text style={styles.emptyBody}>
            {t("timeline.emptyBody")}
          </Text>
          <PrimaryButton label={t("report.logMoment")} onPress={() => router.push("/(tabs)/log")} />
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
  trajectoryToggle: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  trajectoryToggleText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});