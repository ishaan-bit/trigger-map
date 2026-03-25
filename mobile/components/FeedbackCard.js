import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";
import { useLanguage } from "@/i18n/LanguageContext";

const EMOTION_ICONS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
};

const EMOTION_CARD_TINTS = {
  calm:       { bg: "rgba(94, 230, 160, 0.40)",  border: "rgba(94, 230, 160, 0.55)",  iconBg: "rgba(94, 230, 160, 0.35)" },
  neutral:    { bg: "rgba(148, 180, 224, 0.40)",  border: "rgba(148, 180, 224, 0.52)", iconBg: "rgba(148, 180, 224, 0.35)" },
  anxious:    { bg: "rgba(255, 179, 71, 0.40)",   border: "rgba(255, 179, 71, 0.55)",  iconBg: "rgba(255, 179, 71, 0.35)" },
  frustrated: { bg: "rgba(255, 107, 122, 0.40)",  border: "rgba(255, 107, 122, 0.55)", iconBg: "rgba(255, 107, 122, 0.35)" },
  energized:  { bg: "rgba(86, 208, 224, 0.40)",   border: "rgba(86, 208, 224, 0.55)",  iconBg: "rgba(86, 208, 224, 0.35)" },
};

const DEFAULT_CARD_TINT = EMOTION_CARD_TINTS.neutral;

/** Emotion-aware acknowledgment messages — the app echoes back what it heard */
const EMOTION_ECHOES = {
  calm: [
    "A calm moment — let that settle in.",
    "Stillness noted. Your body remembers this.",
    "That quiet feeling matters more than you think.",
  ],
  neutral: [
    "Steady ground. Not every moment needs to be loud.",
    "Noted — even the in-between matters.",
    "Sometimes neutral is exactly enough.",
  ],
  anxious: [
    "That tension you're carrying — we see it.",
    "Anxiety logged. Naming it is already a step.",
    "You showed up even when it felt heavy.",
  ],
  frustrated: [
    "Frustration acknowledged. You didn't push it away.",
    "That friction is real — and now it's visible.",
    "Logged. Frustration loses power when it's seen.",
  ],
  energized: [
    "That spark — hold onto it.",
    "Energy captured. This is the fuel you come back to.",
    "Momentum logged. Remember what brought you here.",
  ],
};

const ECHO_KEYS = {
  calm: ["calm1", "calm2", "calm3"],
  neutral: ["neutral1", "neutral2", "neutral3"],
  anxious: ["anxious1", "anxious2", "anxious3"],
  frustrated: ["frustrated1", "frustrated2", "frustrated3"],
  energized: ["energized1", "energized2", "energized3"],
};

function getEcho(emotion, t) {
  const keys = ECHO_KEYS[emotion] || ECHO_KEYS.neutral;
  const key = keys[Math.floor(Math.random() * keys.length)];
  return t("feedback.echoes." + key);
}

/**
 * Emotionally alive feedback card shown after logging a moment.
 * Echoes back what the user felt, not just "keep tracking".
 */
export function FeedbackCard({ feedback, trigger, emotion, onDismiss }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { t } = useLanguage();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    // Subtle glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        if (onDismiss) onDismiss();
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim, glowAnim, onDismiss]);

  const icon = EMOTION_ICONS[emotion] || "💫";
  const cardTint = EMOTION_CARD_TINTS[emotion] || DEFAULT_CARD_TINT;

  // Use backend pattern feedback if available, otherwise echo the emotion
  const { patternFeedback, smartReflectionPrompt, pairCount } = feedback || {};
  let message;
  if (patternFeedback) {
    message = patternFeedback;
  } else if (pairCount >= 3) {
    message = t("feedback.patternForming", { trigger: t("triggers." + trigger) || trigger, emotion: t("emotions." + emotion) || emotion, count: pairCount });
  } else {
    message = getEcho(emotion, t);
  }

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.03, 0.08],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: cardTint.bg, borderColor: cardTint.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Animated.View style={[styles.glowBg, { opacity: glowOpacity }]} />
      <View style={[styles.iconWrap, { backgroundColor: cardTint.iconBg }]}>
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
    gap: 14,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: "rgba(86, 208, 224, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(86, 208, 224, 0.40)",
    overflow: "hidden",
  },
  glowBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.accent,
    borderRadius: radius.lg,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(86, 208, 224, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 22,
  },
  textWrap: {
    flex: 1,
    gap: 8,
  },
  message: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  reflection: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
});
