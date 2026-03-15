import { StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

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
    borderRadius: 16,
    backgroundColor: "rgba(123,201,216,0.06)",
    borderWidth: 1,
    borderColor: "rgba(123,201,216,0.15)",
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
