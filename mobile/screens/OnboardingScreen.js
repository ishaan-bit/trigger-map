import { useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDE_WIDTH = SCREEN_WIDTH - 40;

const slides = [
  {
    icon: "🎯",
    title: "Track what triggers\nyour emotions",
    body: "Tap a trigger, pick how it made you feel, done.\nOne moment takes under 5 seconds.",
  },
  {
    icon: "📊",
    title: "Discover your\npatterns",
    body: "TriggerMap spots recurring connections between triggers and emotions so you can understand yourself better.",
  },
  {
    icon: "🔒",
    title: "Private by default",
    body: "Your data stays on your device until you choose to create an account.\nNo sign-up required to start.",
  },
];

export function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAppSession();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  function handleNext() {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      completeOnboarding().then(() => router.replace("/(tabs)/log"));
    }
  }

  function handleSkip() {
    completeOnboarding().then(() => router.replace("/(tabs)/log"));
  }

  function renderSlide({ item }) {
    return (
      <View style={styles.slide}>
        <Text style={styles.slideIcon}>{item.icon}</Text>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideBody}>{item.body}</Text>
      </View>
    );
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
        renderItem={renderSlide}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
        style={styles.list}
        getItemLayout={(_, index) => ({ length: SLIDE_WIDTH, offset: SLIDE_WIDTH * index, index })}
      />

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <PrimaryButton
        label={isLast ? "Start logging" : "Continue"}
        onPress={handleNext}
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
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  skip: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    flexGrow: 0,
  },
  slide: {
    width: SLIDE_WIDTH,
    justifyContent: "center",
    gap: 18,
    paddingVertical: 32,
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
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
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