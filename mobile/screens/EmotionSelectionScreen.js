import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { ScreenShell } from "@/components/ScreenShell";
import { EmotionChip } from "@/components/EmotionChip";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";

function showToast(message) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}

function showError(title, message) {
  Alert.alert(title, message);
}

export function EmotionSelectionScreen() {
  const { trigger } = useLocalSearchParams();
  const router = useRouter();
  const { saveMoment } = useAppSession();
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selectedEmotion || saving) return;
    try {
      setSaving(true);
      await saveMoment({ trigger, emotion: selectedEmotion, note });
      showToast("Moment logged");
      router.back();
    } catch {
      showError("Save failed", "Could not log this moment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell scroll>

      <View style={styles.header}>
        <Text style={styles.kicker}>{trigger}</Text>
        <Text style={styles.prompt}>How did it{"\n"}affect you?</Text>
        <Text style={styles.hint}>Choose an emotion, add an optional note, then save</Text>
      </View>

      <View style={styles.emotionWrap}>
        {EMOTIONS.map((entry) => (
          <EmotionChip
            key={entry}
            label={entry}
            active={selectedEmotion === entry}
            onPress={() => setSelectedEmotion(entry)}
          />
        ))}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteLabel}>Note (optional)</Text>
        <TextInput
          multiline
          numberOfLines={3}
          onChangeText={setNote}
          placeholder="What happened right before this?"
          placeholderTextColor={palette.muted}
          style={styles.input}
          value={note}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save moment"
        disabled={!selectedEmotion || saving}
        onPress={handleSave}
        style={({ pressed }) => [
          styles.saveButton,
          !selectedEmotion && styles.saveButtonDisabled,
          pressed && selectedEmotion && styles.saveButtonPressed,
        ]}
      >
        <Text style={[styles.saveButtonText, !selectedEmotion && styles.saveButtonTextDisabled]}>
          {saving ? "Saving..." : "Log moment"}
        </Text>
      </Pressable>
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
  emotionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  noteCard: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 8,
  },
  noteLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 72,
    color: palette.text,
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 22,
  },
  saveButton: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentStrong,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveButtonDisabled: {
    backgroundColor: palette.glass,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  saveButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  saveButtonTextDisabled: {
    color: palette.muted,
  },
});