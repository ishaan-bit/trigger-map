import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getDailyPrediction, saveDailyPrediction } from "@/services/deviceService";
import { palette, radius } from "@/utils/theme";

const OPTIONS = [
  { key: "calm", emoji: "🍃", label: "Calm" },
  { key: "neutral", emoji: "⚖️", label: "Neutral" },
  { key: "stressful", emoji: "⚡", label: "Stressful" },
];

export function DailyPrediction() {
  const [prediction, setPrediction] = useState(undefined); // undefined = loading

  useEffect(() => {
    getDailyPrediction().then((p) => setPrediction(p));
  }, []);

  if (prediction !== null && prediction !== undefined) return null; // already predicted today
  if (prediction === undefined) return null; // still loading

  async function handlePick(key) {
    setPrediction(key);
    await saveDailyPrediction(key);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How do you think today will feel?</Text>
      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <Pressable key={opt.key} style={styles.option} onPress={() => handlePick(opt.key)}>
            <Text style={styles.emoji}>{opt.emoji}</Text>
            <Text style={styles.label}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: 16,
    gap: 12,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  title: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  options: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  option: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
  },
  emoji: { fontSize: 20 },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "600",
  },
});
