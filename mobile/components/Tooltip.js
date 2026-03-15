import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette } from "@/utils/theme";

const PREFIX = "triggermap.tooltip.seen.";

export function Tooltip({ id, text }) {
  const [visible, setVisible] = useState(false);
  const opacity = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(`${PREFIX}${id}`).then((seen) => {
      if (!active || seen) return;
      setVisible(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
    return () => { active = false; };
  }, [id, opacity]);

  function dismiss() {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    AsyncStorage.setItem(`${PREFIX}${id}`, "1");
  }

  if (!visible) return null;

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
  container: {
    marginVertical: -8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(123,201,216,0.12)",
    borderWidth: 1,
    borderColor: "rgba(123,201,216,0.20)",
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
