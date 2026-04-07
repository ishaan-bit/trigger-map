import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";

export function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAppSession();
  const { advance } = useOnboarding();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  async function finish() {
    if (loading) return;
    setLoading(true);
    try {
      await completeOnboarding();
      advance("framing_shown");
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

  const slides = [
    { icon: "🎯", title: t("onboarding.slide1Title"), body: t("onboarding.slide1Body") },
    { icon: "📊", title: t("onboarding.slide2Title"), body: t("onboarding.slide2Body") },
    { icon: "🔒", title: t("onboarding.slide3Title"), body: t("onboarding.slide3Body") },
  ];

  const isLast = currentIndex === slides.length - 1;

  return (
    <ScreenShell scroll={false}>
      <View style={styles.top}>
        <Text style={styles.brand}>{t("onboarding.brand")}</Text>
        {!isLast && (
          <Pressable onPress={handleSkip} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>{t("onboarding.skip")}</Text>
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
        label={isLast ? (loading ? t("onboarding.starting") : t("onboarding.startLogging")) : t("onboarding.continue")}
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
  },
  list: {
    flexGrow: 0,
    marginHorizontal: -20,
  },
  slide: {
    justifyContent: "center",
    gap: 18,
    paddingVertical: 32,
    paddingHorizontal: 20,
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