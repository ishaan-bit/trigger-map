import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";
import { tap } from "@/utils/haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * SpotlightOverlay — renders a dimmed full-screen overlay with a message card.
 *
 * Props:
 *   visible    — show/hide
 *   message    — main text to display
 *   cta        — button label (optional, shows "Got it" by default)
 *   onDismiss  — called when user taps CTA or overlay
 *   position   — "center" | "top" | "bottom" (where the card appears)
 *   emoji      — optional emoji to show above text
 *   secondary  — optional secondary text below message
 *   skipLabel  — optional skip button label (shows at top-right)
 *   onSkip     — called when skip is tapped
 */
export function SpotlightOverlay({
  visible,
  message,
  cta,
  onDismiss,
  position = "center",
  emoji,
  secondary,
  skipLabel,
  onSkip,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setMounted(false);
      });
    }
  }, [visible, opacity, cardScale, mounted]);

  const handleDismiss = useCallback(() => {
    tap();
    onDismiss?.();
  }, [onDismiss]);

  const handleSkip = useCallback(() => {
    tap();
    onSkip?.();
  }, [onSkip]);

  if (!mounted) return null;

  const cardAlignment =
    position === "top" ? styles.cardTop :
    position === "bottom" ? styles.cardBottom :
    styles.cardCenter;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      <Pressable style={styles.backdrop} onPress={handleDismiss} />

      {skipLabel ? (
        <Pressable style={styles.skipButton} onPress={handleSkip} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skipText}>{skipLabel}</Text>
        </Pressable>
      ) : null}

      <Animated.View style={[styles.card, cardAlignment, { transform: [{ scale: cardScale }] }]}>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={styles.message}>{message}</Text>
        {secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}
        {cta ? (
          <Pressable style={styles.ctaButton} onPress={handleDismiss} accessibilityRole="button">
            <Text style={styles.ctaText}>{cta}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * GuidedTooltip — a small contextual tooltip that points at a specific area.
 * Simpler than SpotlightOverlay, no dimming. Auto-dismisses.
 *
 * Props:
 *   visible   — show/hide
 *   text      — tooltip text
 *   onDismiss — called on dismiss
 *   position  — "above" | "below" (relative to content)
 *   delay     — ms before showing (default 300)
 *   duration  — ms before auto-dismiss (default 4000, 0 = manual only)
 */
export function GuidedTooltip({
  visible,
  text,
  onDismiss,
  position = "below",
  delay = 300,
  duration = 4000,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (visible) {
      const showTimer = setTimeout(() => {
        setShow(true);
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start(() => {
          if (duration > 0) {
            timerRef.current = setTimeout(() => {
              Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
                setShow(false);
                onDismiss?.();
              });
            }, duration);
          }
        });
      }, delay);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(timerRef.current);
      };
    } else {
      opacity.setValue(0);
      setShow(false);
    }
  }, [visible, opacity, delay, duration, onDismiss]);

  function dismiss() {
    clearTimeout(timerRef.current);
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShow(false);
      onDismiss?.();
    });
  }

  if (!show) return null;

  return (
    <Animated.View style={[styles.tooltip, position === "above" && styles.tooltipAbove, { opacity }]}>
      <Pressable onPress={dismiss} style={styles.tooltipInner} accessibilityRole="button">
        <Text style={styles.tooltipText}>{text}</Text>
        <Text style={styles.tooltipDismiss}>✓</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 8, 16, 0.82)",
  },
  skipButton: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 1001,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  skipText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    position: "absolute",
    left: 28,
    right: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    backgroundColor: "rgba(14, 22, 40, 0.95)",
    borderWidth: 1,
    borderColor: palette.glassBorder,
    alignItems: "center",
    gap: 16,
  },
  cardCenter: {
    top: SCREEN_H * 0.3,
  },
  cardTop: {
    top: SCREEN_H * 0.12,
  },
  cardBottom: {
    bottom: SCREEN_H * 0.15,
  },
  emoji: {
    fontSize: 40,
  },
  message: {
    color: palette.text,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    textAlign: "center",
  },
  secondary: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  ctaButton: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  ctaText: {
    color: "#060a12",
    fontSize: 15,
    fontWeight: "700",
  },

  /* Guided tooltip */
  tooltip: {
    marginTop: 6,
  },
  tooltipAbove: {
    marginTop: 0,
    marginBottom: 6,
  },
  tooltipInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: "rgba(13, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  tooltipText: {
    flex: 1,
    color: palette.accent,
    fontSize: 13,
    lineHeight: 18,
  },
  tooltipDismiss: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
