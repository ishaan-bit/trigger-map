import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getDailyPrediction, saveDailyPrediction } from "@/services/deviceService";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";

const OPTIONS = [
  { key: "calm", emoji: "🍃", label: "Calm" },
  { key: "neutral", emoji: "⚖️", label: "Neutral" },
  { key: "anxious", emoji: "⚡", label: "Anxious" },
  { key: "frustrated", emoji: "💢", label: "Frustrated" },
  { key: "energized", emoji: "☀️", label: "Energized" },
];

export function DailyPrediction({ onVisibilityChange }) {
  const [prediction, setPrediction] = useState(undefined);
  const { t } = useLanguage();

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
      <Text style={styles.title}>{t("prediction.title")}</Text>
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
            accessibilityLabel={t("emotions." + opt.key)}
          >
            <Text style={styles.emoji}>{opt.emoji}</Text>
            <Text style={styles.label}>{t("emotions." + opt.key)}</Text>
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
    backgroundColor: "rgba(86, 208, 224, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(86, 208, 224, 0.35)",
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
