import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

const EMOTION_ICONS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
};

/**
 * Lightweight feedback card shown after logging a moment.
 * Displays pattern feedback + smart reflection prompt from the backend.
 */
export function FeedbackCard({ feedback, trigger, emotion, onDismiss }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        if (onDismiss) onDismiss();
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim, onDismiss]);

  if (!feedback) return null;

  const { patternFeedback, smartReflectionPrompt, pairCount } = feedback;
  const icon = EMOTION_ICONS[emotion] || "💫";

  // Build the message
  let message = "";
  if (patternFeedback) {
    message = patternFeedback;
  } else if (pairCount >= 2) {
    message = `You've felt ${emotion} in ${trigger} situations ${pairCount} times this week.`;
  } else {
    message = `Logged — ${trigger} + ${emotion}. Keep tracking to uncover patterns.`;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.message}>{message}</Text>
        {smartReflectionPrompt ? (
          <Text style={styles.reflection}>{smartReflectionPrompt}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: "rgba(86, 208, 224, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(86, 208, 224, 0.18)",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(86, 208, 224, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 20,
  },
  textWrap: {
    flex: 1,
    gap: 6,
  },
  message: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  reflection: {
    color: palette.accent,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
