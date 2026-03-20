import * as Haptics from "expo-haptics";

/** Light tap — generic selection (chips, tiles, tabs). */
export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Emotion-specific haptic tied to emotional weight.
 * Calm = barely-there, Frustrated = firmer, Energized = crisp.
 */
export function emotionTap(emotion) {
  const map = {
    calm:       Haptics.ImpactFeedbackStyle.Light,
    neutral:    Haptics.ImpactFeedbackStyle.Light,
    anxious:    Haptics.ImpactFeedbackStyle.Medium,
    frustrated: Haptics.ImpactFeedbackStyle.Heavy,
    energized:  Haptics.ImpactFeedbackStyle.Medium,
  };
  Haptics.impactAsync(map[emotion] || Haptics.ImpactFeedbackStyle.Light);
}

/** Success — moment saved, purchase complete. */
export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Warning — destructive confirm (delete data, remove moment). */
export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Soft selection — toggles, switches. */
export function selection() {
  Haptics.selectionAsync();
}
