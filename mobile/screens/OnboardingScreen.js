import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";

const slides = [
  {
    icon: "🎯",
    title: "Track what triggers\nyour emotions",
    body: "Tap a trigger, pick how it made you feel, done.\nOne moment takes under 5 seconds.",
  },
  {
    icon: "📊",
    title: "Discover your\npatterns",
    body: "TriggerMap connects your triggers and emotions over time, surfacing patterns you might not notice on your own.",
  },
  {
    icon: "🔒",
    title: "Private by default",
    body: "Everything stays on your device unless you sign in.\nNo account required to start logging.",
  },
];

export function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAppSession();
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  async function finish() {
    if (loading) return;
    setLoading(true);
    try {
      await completeOnboarding();
      router.replace("/(tabs)/log");
    } catch {
      setLoading(false);
    }
  }

  function handleNext() {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  }

  function handleSkip() {
    finish();
  }

  const isLast = currentIndex === slides.length - 1;

  return (
    <ScreenShell scroll={false}>
      <View style={styles.top}>
        <Text style={styles.brand}>TriggerMap</Text>
        {!isLast && (
          <Pressable onPress={handleSkip} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: screenWidth }]}>
            <Text style={styles.slideIcon}>{item.icon}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          setCurrentIndex(index);
        }}
        style={styles.list}
        getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
      />

      <View style={styles.dots} accessibilityRole="tablist">
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} accessibilityRole="tab" accessibilityLabel={`Slide ${i + 1} of ${slides.length}`} accessibilityState={{ selected: i === currentIndex }} />
        ))}
      </View>

      <PrimaryButton
        label={isLast ? (loading ? "Starting\u2026" : "Start logging") : "Continue"}
        onPress={handleNext}
        disabled={loading}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  brand: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  skip: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  list: {
    flexGrow: 0,
    marginHorizontal: -20,
  },
  slide: {
    justifyContent: "center",
    gap: 18,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  slideIcon: {
    fontSize: 52,
  },
  slideTitle: {
    color: palette.text,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700",
  },
  slideBody: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 24,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.glassBorder,
  },
  dotActive: {
    backgroundColor: palette.accent,
    width: 24,
  },
});