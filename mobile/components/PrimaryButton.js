import { Pressable, StyleSheet, Text } from "react-native";
import { palette, radius } from "@/utils/theme";

export function PrimaryButton({ label, onPress, disabled = false, secondary = false, danger = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : danger ? styles.dangerButton : styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel, danger && styles.dangerLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  primaryButton: {
    backgroundColor: palette.accentStrong,
    shadowColor: palette.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  secondaryButton: {
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  dangerButton: {
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: "rgba(255,107,122,0.30)",
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryLabel: {
    color: palette.textSecondary,
  },
  dangerLabel: {
    color: palette.danger,
  },
});