import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { ScreenShell } from "@/components/ScreenShell";
import { EmotionChip } from "@/components/EmotionChip";
import { FeedbackCard } from "@/components/FeedbackCard";
import { useAppSession } from "@/hooks/useAppSession";
import { getRelevantTags, recordTagUsage } from "@/utils/adaptiveTags";
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
  const [selectedTags, setSelectedTags] = useState([]);
  const [adaptiveTags, setAdaptiveTags] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [saved, setSaved] = useState(false);

  // Animations
  const tagSectionAnim = useRef(new Animated.Value(0)).current;
  const saveButtonScale = useRef(new Animated.Value(1)).current;

  // Load adaptive tags when emotion changes
  useEffect(() => {
    if (!selectedEmotion || !trigger) {
      setAdaptiveTags([]);
      return;
    }
    let active = true;
    getRelevantTags(trigger, selectedEmotion).then((tags) => {
      if (active) {
        setAdaptiveTags(tags);
        setSelectedTags([]);
        // Animate tags section in
        tagSectionAnim.setValue(0);
        Animated.spring(tagSectionAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => { active = false; };
  }, [selectedEmotion, trigger, tagSectionAnim]);

  function toggleTag(tag) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_TAGS_PER_MOMENT) return prev;
      return [...prev, tag];
    });
  }

  async function handleSave() {
    if (!selectedEmotion || saving || saved) return;
    try {
      setSaving(true);
      // Pulse the save button
      Animated.sequence([
        Animated.timing(saveButtonScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
        Animated.timing(saveButtonScale, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start();

      const payload = { trigger, emotion: selectedEmotion, note };
      if (selectedTags.length > 0) payload.tags = selectedTags;
      const response = await saveMoment(payload);

      // Record tag usage for adaptive learning
      if (selectedTags.length > 0) {
        recordTagUsage(trigger, selectedEmotion, selectedTags).catch(() => null);
      }

      // Show feedback card instead of immediately going back
      setSaved(true);
      setFeedback({
        patternFeedback: response?.patternFeedback || null,
        smartReflectionPrompt: response?.smartReflectionPrompt || null,
        pairCount: response?.pairCount || 0,
      });

      showToast("Moment logged ✓");

      // Auto-navigate back after feedback display
      setTimeout(() => router.back(), 3000);
    } catch {
      showError("Save failed", "Could not log this moment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (saved && feedback) {
    return (
      <ScreenShell scroll>
        <View style={styles.feedbackWrap}>
          <Text style={styles.feedbackCheckmark}>✓</Text>
          <Text style={styles.feedbackTitle}>Moment logged</Text>
          <FeedbackCard
            feedback={feedback}
            trigger={trigger}
            emotion={selectedEmotion}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell scroll>

      <View style={styles.header}>
        <Text style={styles.kicker}>{trigger}</Text>
        <Text style={styles.prompt}>How did it{"\n"}affect you?</Text>
        <Text style={styles.hint}>Choose an emotion, then refine with tags</Text>
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

      {selectedEmotion && adaptiveTags.length > 0 && (
        <Animated.View style={[styles.tagSection, {
          opacity: tagSectionAnim,
          transform: [{ translateY: tagSectionAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }]}>
          <Text style={styles.tagLabel}>
            What about this felt {selectedEmotion}?
          </Text>
          <View style={styles.tagWrap}>
            {adaptiveTags.map((tag) => {
              const active = selectedTags.includes(tag);
              const atMax = selectedTags.length >= MAX_TAGS_PER_MOMENT && !active;
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  disabled={atMax}
                  accessibilityRole="button"
                  accessibilityLabel={`${active ? "Deselect" : "Select"} ${tag} tag`}
                  style={({ pressed }) => [
                    styles.tagChip,
                    active && styles.tagChipActive,
                    atMax && styles.tagChipDisabled,
                    pressed && !atMax && styles.tagChipPressed,
                  ]}
                >
                  <Text style={[styles.tagText, active && styles.tagTextActive, atMax && styles.tagTextDisabled]}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      )}

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

      <Animated.View style={{ transform: [{ scale: saveButtonScale }] }}>
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
      </Animated.View>
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
  tagSection: {
    gap: 10,
  },
  tagLabel: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
  },
  tagChipActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  tagChipDisabled: {
    opacity: 0.35,
  },
  tagChipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  tagText: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  tagTextActive: {
    color: palette.accent,
  },
  tagTextDisabled: {
    color: palette.muted,
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
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingTop: 60,
  },
  feedbackCheckmark: {
    fontSize: 48,
    color: palette.success,
    fontWeight: "700",
  },
  feedbackTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "700",
  },
});