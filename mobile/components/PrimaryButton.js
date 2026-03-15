import { Pressable, StyleSheet, Text } from "react-native";
import { palette } from "@/utils/theme";

export function PrimaryButton({ label, onPress, disabled = false, secondary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, secondary ? styles.secondaryLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  primaryButton: {
    backgroundColor: palette.accentStrong,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  secondaryLabel: {
    color: "#dbe3ef",
  },
});