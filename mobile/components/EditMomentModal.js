import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { palette, radius } from "@/utils/theme";

const TRIGGER_ICONS = {
  work: "🏢", social: "👥", money: "💰", family: "🏠", exercise: "🏃",
  health: "💊", sleep: "😴", partner: "💛", alone: "🧘", other: "📌",
};

const EMOTION_ICONS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
};

export function EditMomentModal({ visible, moment, onSave, onClose }) {
  const [trigger, setTrigger] = useState(moment?.trigger || "");
  const [emotion, setEmotion] = useState(moment?.emotion || "");
  const [note, setNote] = useState(moment?.note || "");
  const [saving, setSaving] = useState(false);

  // Sync state whenever a different moment is opened for editing
  useEffect(() => {
    if (moment) {
      setTrigger(moment.trigger);
      setEmotion(moment.emotion);
      setNote(moment.note || "");
    }
  }, [moment]);

  async function handleSave() {
    if (!trigger || !emotion || saving) return;
    setSaving(true);
    try {
      await onSave(moment.id, { trigger, emotion, note });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setTrigger("");
    setEmotion("");
    setNote("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Edit moment</Text>
            <Pressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={s.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
            {/* Trigger selector */}
            <Text style={s.sectionLabel}>Trigger</Text>
            <View style={s.chipGrid}>
              {TRIGGERS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTrigger(t)}
                  style={[s.chip, trigger === t && s.chipActive]}
                >
                  <Text style={s.chipIcon}>{TRIGGER_ICONS[t] || "📌"}</Text>
                  <Text style={[s.chipText, trigger === t && s.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            {/* Emotion selector */}
            <Text style={s.sectionLabel}>Emotion</Text>
            <View style={s.chipGrid}>
              {EMOTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setEmotion(e)}
                  style={[s.chip, emotion === e && s.chipActive]}
                >
                  <Text style={s.chipIcon}>{EMOTION_ICONS[e] || "•"}</Text>
                  <Text style={[s.chipText, emotion === e && s.chipTextActive]}>{e}</Text>
                </Pressable>
              ))}
            </View>

            {/* Note input */}
            <Text style={s.sectionLabel}>Note (optional)</Text>
            <TextInput
              multiline
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
              placeholder="What happened right before this?"
              placeholderTextColor={palette.muted}
              style={s.input}
            />
          </ScrollView>

          {/* Footer buttons */}
          <View style={s.footer}>
            <Pressable style={s.cancelBtn} onPress={handleClose}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.saveBtn, (!trigger || !emotion) && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!trigger || !emotion || saving}
            >
              <Text style={s.saveText}>{saving ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.glassBorder,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  closeIcon: {
    color: palette.muted,
    fontSize: 20,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  sectionLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  chipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  chipIcon: {
    fontSize: 16,
  },
  chipText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: palette.text,
  },
  input: {
    minHeight: 80,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: palette.glassBorder,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  cancelText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.accentStrong,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
