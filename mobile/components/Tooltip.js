import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette, radius } from "@/utils/theme";

const PREFIX = "triggermap.tooltip.seen.";

const AUTO_DISMISS_MS = 4000;

export function Tooltip({ id, text, hidden = false }) {
  const [visible, setVisible] = useState(false);
  const opacity = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (hidden) return;
    let active = true;
    let timer;
    AsyncStorage.getItem(`${PREFIX}${id}`).then((seen) => {
      if (!active || seen) return;
      setVisible(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        if (!active) return;
        timer = setTimeout(() => {
          if (!active) return;
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            if (active) setVisible(false);
          });
          AsyncStorage.setItem(`${PREFIX}${id}`, "1");
        }, AUTO_DISMISS_MS);
      });
    });
    return () => { active = false; clearTimeout(timer); };
  }, [id, opacity, hidden]);

  function dismiss() {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    AsyncStorage.setItem(`${PREFIX}${id}`, "1");
  }

  if (!visible || hidden) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.content}>
        <Text style={styles.text}>{text}</Text>
        <Pressable onPress={dismiss} hitSlop={12} accessibilityRole="button">
          <Text style={styles.dismiss}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {},

  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: "rgba(13, 20, 36, 0.90)",
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  text: {
    flex: 1,
    color: palette.accent,
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
