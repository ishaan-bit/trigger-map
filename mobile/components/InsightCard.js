import { StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

export function InsightCard({ title, body, tone = "default", footer = null, compact = false }) {
  return (
    <View style={[styles.card, tone === "accent" ? styles.accent : null, compact && styles.compact]}>
      <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
      <Text style={[styles.body, compact && styles.compactBody]}>{body}</Text>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  compact: {
    padding: 14,
    borderRadius: 14,
    flex: 1,
    gap: 4,
  },
  accent: {
    backgroundColor: palette.cardGlow,
    borderColor: "rgba(123,201,216,0.18)",
  },
  title: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  compactTitle: {
    fontSize: 10,
  },
  body: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
  },
  compactBody: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  footer: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});