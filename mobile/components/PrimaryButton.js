import { Pressable, StyleSheet, Text } from "react-native";
import { palette, radius } from "@/utils/theme";

export function PrimaryButton({ label, onPress, disabled = false, secondary = false, danger = false, outline = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline ? styles.outlineButton : secondary ? styles.secondaryButton : danger ? styles.dangerButton : styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        pressed && !disabled && (secondary || outline) && styles.secondaryPressed,
      ]}
    >
      <Text style={[styles.label, (secondary || outline) && styles.secondaryLabel, outline && styles.outlineLabel, danger && styles.dangerLabel]}>{label}</Text>
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
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  secondaryPressed: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accentMedium,
  },
  label: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  outlineButton: {
    backgroundColor: palette.glass,
    borderWidth: 1.5,
    borderColor: palette.accentMedium,
  },
  secondaryLabel: {
    color: palette.textSecondary,
  },
  outlineLabel: {
    color: palette.accent,
  },
  dangerLabel: {
    color: palette.danger,
  },
});