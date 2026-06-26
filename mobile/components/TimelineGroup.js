import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius } from "@/utils/theme";
import { warning } from "@/utils/haptics";
import { useLanguage } from "@/i18n/LanguageContext";
import { emotionColor as getEmotionColorFromCoords } from "@/utils/emotionModel";
import { coordinatesToLegacy } from "@triggermap/shared/constants/emotions";
import { TRIGGER_COLORS } from "@/utils/designSystem";

const TRIGGER_ICONS = {
  work: "🏢", social: "👥", money: "💰", family: "🏠", exercise: "🏃",
  health: "💊", sleep: "😴", partner: "💛", alone: "🧘", travel: "📍", other: "📌",
};

const EMOTION_COLORS = {
  calm: palette.success,
  neutral: palette.muted,
  anxious: palette.warning,
  frustrated: palette.danger,
  energized: palette.accent,
};

const EMOTION_ICONS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
};

export function TimelineGroup({ moment, onEdit, onDelete, groupCount }) {
  const { t, lang } = useLanguage();
  const triggerLabel = t("triggers." + moment.trigger) || moment.trigger;
  const triggerColor = TRIGGER_COLORS[moment.trigger] || palette.accent;
  // New-model moments store valence/arousal and may carry no legacy `emotion`
  // string — resolve a legacy key from coordinates so the label never renders
  // as "Undefined" (mirrors the fallback in localStore.buildLocalReport).
  const hasCoords = typeof moment.valence === "number" && typeof moment.arousal === "number";
  const legacyEmotion = moment.emotion || (hasCoords ? coordinatesToLegacy(moment.valence, moment.arousal) : "neutral");
  const displayEmotion = moment.derivedLabel || legacyEmotion;
  const translated = t("emotions." + displayEmotion);
  const emotionLabel = translated && translated !== "emotions." + displayEmotion ? translated : displayEmotion;
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const contributionTags = moment.contributionTags?.length ? moment.contributionTags : (moment.tags || []);
  const visibleTags = contributionTags.slice(0, 3);
  const extraTagCount = Math.max(0, contributionTags.length - visibleTags.length);

  function handleDelete() {
    warning();
    Alert.alert(t("timeline.deleteConfirmTitle"), t("timeline.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("timeline.delete"), style: "destructive", onPress: () => onDelete(moment) },
    ]);
  }

  const emotionColor = hasCoords
    ? getEmotionColorFromCoords(moment.valence, moment.arousal)
    : (EMOTION_COLORS[legacyEmotion] || palette.muted);

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: emotionColor }]}>
      {/* Luminous glass sheen + hairline top highlight (matches the app shell). */}
      <LinearGradient
        colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.012)", "rgba(0,0,0,0)"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.topHighlight} pointerEvents="none" />

      <View style={styles.row}>
        {/* Trigger-coloured icon disc + soft halo (no SVG → no Android box). */}
        <View style={styles.iconArea}>
          <View style={[styles.halo, { backgroundColor: triggerColor + "1f" }]} pointerEvents="none" />
          <View style={[styles.iconDisc, { borderColor: triggerColor + "66", shadowColor: triggerColor }]}>
            <Text style={styles.icon}>{TRIGGER_ICONS[moment.trigger] || "📌"}</Text>
          </View>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.trigger}>{triggerLabel}</Text>
            <View style={[styles.emotionBadge, { backgroundColor: `${emotionColor}28` }]}>
              <Text style={styles.emotionIcon}>{EMOTION_ICONS[moment.emotion] || EMOTION_ICONS[legacyEmotion] || "•"}</Text>
              <Text style={[styles.emotionLabel, { color: emotionColor }]}>{emotionLabel}</Text>
            </View>
            {groupCount > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>×{groupCount}</Text>
              </View>
            )}
          </View>
          {moment.note ? <Text style={styles.note} numberOfLines={2}>{moment.note}</Text> : null}
          {visibleTags.length ? (
            <View style={styles.tagRow}>
              {visibleTags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tag}</Text>
                </View>
              ))}
              {extraTagCount > 0 ? (
                <View style={styles.tagPill}>
                  <Text style={styles.tagPillText}>+{extraTagCount}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={styles.time}>
          {new Date(moment.timestamp).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
      {(onEdit || onDelete) ? (
        <View style={styles.actions}>
          {onEdit ? (
            <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]} onPress={() => onEdit(moment)} hitSlop={8}>
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionLabel}>{t("timeline.edit")}</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]} onPress={handleDelete} hitSlop={8}>
              <Text style={styles.actionIcon}>🗑️</Text>
              <Text style={[styles.actionLabel, { color: palette.danger }]}>{t("timeline.delete")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 10,
    overflow: "hidden",
    position: "relative",
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: radius.md,
    right: radius.md,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconArea: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  iconDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 13, 24, 0.5)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 7,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trigger: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  emotionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  emotionIcon: {
    fontSize: 12,
  },
  emotionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  note: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(86, 208, 224, 0.25)",
  },
  tagPillText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  time: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 20,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: palette.glassBorder,
    paddingHorizontal: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  actionIcon: {
    fontSize: 13,
  },
  actionLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  actionPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  countText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
  },
});
