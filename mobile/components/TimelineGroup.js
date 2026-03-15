import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

const TRIGGER_ICONS = {
  work: "�", social: "👥", money: "💰", family: "🏠", exercise: "🏃",
  health: "💊", sleep: "😴", partner: "💛", alone: "🧘", other: "📌",
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

export function TimelineGroup({ moment, onEdit, onDelete }) {
  function handleDelete() {
    Alert.alert("Delete moment?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(moment) },
    ]);
  }

  const emotionColor = EMOTION_COLORS[moment.emotion] || palette.muted;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{TRIGGER_ICONS[moment.trigger] || "📌"}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.trigger}>{moment.trigger}</Text>
            <View style={[styles.emotionBadge, { backgroundColor: `${emotionColor}22` }]}>
              <Text style={styles.emotionIcon}>{EMOTION_ICONS[moment.emotion] || "•"}</Text>
              <Text style={[styles.emotionLabel, { color: emotionColor }]}>{moment.emotion}</Text>
            </View>
          </View>
          {moment.note ? <Text style={styles.note} numberOfLines={1}>{moment.note}</Text> : null}
        </View>
        <Text style={styles.time}>
          {new Date(moment.timestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
      {(onEdit || onDelete) ? (
        <View style={styles.actions}>
          {onEdit ? (
            <Pressable style={styles.actionBtn} onPress={() => onEdit(moment)} hitSlop={8}>
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionLabel}>Edit</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable style={styles.actionBtn} onPress={handleDelete} hitSlop={8}>
              <Text style={styles.actionIcon}>🗑️</Text>
              <Text style={styles.actionLabel}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
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
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emotionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  emotionIcon: {
    fontSize: 12,
  },
  emotionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  note: {
    color: "#8396ad",
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(197,214,235,0.06)",
    paddingHorizontal: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  actionIcon: {
    fontSize: 13,
  },
  actionLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
});