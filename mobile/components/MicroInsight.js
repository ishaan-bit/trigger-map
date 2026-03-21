import { StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

export function MicroInsight({ text }) {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>💡</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(13, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  icon: {
    fontSize: 16,
    marginTop: 1,
  },
  text: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
