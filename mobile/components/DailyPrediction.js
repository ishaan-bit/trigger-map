import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getDailyPrediction, saveDailyPrediction } from "@/services/deviceService";
import { palette, radius } from "@/utils/theme";

const OPTIONS = [
  { key: "calm", emoji: "\uD83C\uDF43", label: "Calm" },
  { key: "neutral", emoji: "\u2696\uFE0F", label: "Neutral" },
  { key: "anxious", emoji: "\u26A1", label: "Anxious" },
  { key: "frustrated", emoji: "\uD83D\uDCA2", label: "Frustrated" },
  { key: "energized", emoji: "\u2600\uFE0F", label: "Energized" },
];

export function DailyPrediction({ onVisibilityChange }) {
  const [prediction, setPrediction] = useState(undefined);

  useEffect(() => {
    getDailyPrediction().then((p) => setPrediction(p));
  }, []);

  const isVisible = prediction === null;

  useEffect(() => {
    if (onVisibilityChange) onVisibilityChange(isVisible);
  }, [isVisible, onVisibilityChange]);

  if (!isVisible) return null;

  async function handlePick(key) {
    setPrediction(key);
    await saveDailyPrediction(key);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How do you think today will feel?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.options}
      >
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            onPress={() => handlePick(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={`Predict ${opt.label}`}
          >
            <Text style={styles.emoji}>{opt.emoji}</Text>
            <Text style={styles.label}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  title: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  options: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  option: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    minWidth: 62,
  },
  optionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  emoji: { fontSize: 22 },
  label: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "600",
  },
});
