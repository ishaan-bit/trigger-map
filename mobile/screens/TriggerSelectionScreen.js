import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { ScreenShell } from "@/components/ScreenShell";
import { TriggerTile } from "@/components/TriggerTile";
import { Tooltip } from "@/components/Tooltip";
import { SpotlightOverlay, GuidedTooltip } from "@/components/SpotlightOverlay";
import { MoodWeather } from "@/components/MoodWeather";
import { StreakOrb } from "@/components/StreakOrb";
import { useAppSession } from "@/hooks/useAppSession";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";
import { STAGGER_DELAY } from "@/utils/designSystem";

/** Stagger-in wrapper */
function StaggerIn({ index, children, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay: index * STAGGER_DELAY,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const PROMPTS_EN = [
  "What just happened?",
  "What pulled you here?",
  "What's on your mind?",
];

const EMOTION_PROMPTS_EN = {
  calm: "Steady waters. What's on your mind?",
  neutral: "What just happened?",
  anxious: "Something pulling at you?",
  frustrated: "Name what's grinding.",
  energized: "Riding some energy.",
};

function getPrompt(count, dominantEmotion, t) {
  if (count >= 3) return t("log.prompts.returning");
  if (dominantEmotion && t(`log.prompts.${dominantEmotion}`) !== `log.prompts.${dominantEmotion}`) {
    return t(`log.prompts.${dominantEmotion}`);
  }
  return t(`log.prompts.default${count % 3}`);
}

export function TriggerSelectionScreen() {
  const router = useRouter();
  const { loadTimeline } = useAppSession();
  const { state: obState, advance: obAdvance, skip: obSkip, isCompleted: obCompleted, markNudgeSeen, isNudgeSeen } = useOnboarding();
  const { dominantEmotion, dominantTrigger, emotionalTrend, emotionColor, momentCount } = useEmotionalState();
  const { t } = useLanguage();
  const [todayCount, setTodayCount] = useState(0);
  const [moments, setMoments] = useState([]);
  const [showFraming, setShowFraming] = useState(false);
  const [showTriggerHint, setShowTriggerHint] = useState(false);
  const [showInsightsNudge, setShowInsightsNudge] = useState(false);
  const loadTimelineRef = useRef(loadTimeline);
  loadTimelineRef.current = loadTimeline;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Show framing overlay on first visit after onboarding carousel
  useEffect(() => {
    if (obState === "framing_shown") {
      // Small delay so screen renders first
      const timer = setTimeout(() => setShowFraming(true), 400);
      return () => clearTimeout(timer);
    }
  }, [obState]);

  // Show trigger hint after framing is dismissed (or if state is framing_shown and user returns)
  useEffect(() => {
    if (obState === "framing_shown" && !showFraming) {
      setShowTriggerHint(true);
    }
  }, [obState, showFraming]);

  // Progressive nudge: suggest checking insights after enough data
  useEffect(() => {
    if (!obCompleted || momentCount < 5) return;
    let active = true;
    isNudgeSeen("insights_ready").then((seen) => {
      if (active && !seen) setShowInsightsNudge(true);
    });
    return () => { active = false; };
  }, [obCompleted, momentCount, isNudgeSeen]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      loadTimelineRef.current()
        .then((result) => {
          if (!active) return;
          const all = Array.isArray(result) ? result : [];
          setMoments(all);
          const today = new Date().toDateString();
          const count = all.filter(
            (m) => new Date(m.timestamp).toDateString() === today
          ).length;
          setTodayCount(count);
        })
        .catch(() => {});
      return () => { active = false; };
    }, [fadeAnim])
  );

  return (
    <ScreenShell scroll edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.top, { opacity: fadeAnim }]}>
        <StaggerIn index={0}>
          <View style={styles.header}>
            <Text style={styles.kicker}>{t("log.kicker")}</Text>
            <Text style={styles.prompt}>{getPrompt(todayCount, dominantEmotion, t)}</Text>
            <Text style={styles.hint}>
              {todayCount > 0
                ? (todayCount !== 1 ? t("log.momentCountPlural", { count: todayCount }) : t("log.momentCount", { count: todayCount }))
                : t("log.tapToStart")}
            </Text>
            {/* Persistent value statement — keeps the "why" visible in steady state */}
            <Text style={styles.valueStatement}>{t("log.valueStatement")}</Text>
          </View>
        </StaggerIn>

        {/* Emotional weather forecast */}
        <StaggerIn index={1}>
          <MoodWeather moments={moments} />
        </StaggerIn>

        {/* Streak tracker */}
        <StaggerIn index={2}>
          <StreakOrb moments={moments} />
        </StaggerIn>

        {/* State-aware pattern nudge */}
        {dominantEmotion && momentCount >= 3 ? (
          <StaggerIn index={2}>
            <View style={[styles.patternNudge, { borderLeftColor: emotionColor }]}>
              <View style={[styles.nudgeDot, { backgroundColor: emotionColor }]} />
              <View style={styles.nudgeContent}>
                <Text style={styles.nudgeLabel}>
                  {t("log.trending", { emotion: t(`emotions.${dominantEmotion}`) })}{emotionalTrend === "improving" ? " ↑" : emotionalTrend === "declining" ? " ↓" : ""}
                </Text>
                <Text style={styles.nudgeBody}>
                  {dominantTrigger
                    ? t("log.nudgeTrigger", { trigger: t(`triggers.${dominantTrigger}`) })
                    : emotionalTrend === "improving"
                      ? t("log.nudgeImproving")
                      : emotionalTrend === "declining"
                        ? t("log.nudgeDeclining")
                        : t("log.nudgeBuildPatterns")}
                </Text>
              </View>
            </View>
          </StaggerIn>
        ) : null}

        <Tooltip
          id="log_tooltip"
          text={t("log.tooltip")}
          hidden={obState === "framing_shown"}
        />

        {/* Progressive nudge: check your insights */}
        <GuidedTooltip
          visible={showInsightsNudge}
          text={t("nudge.insightsReady")}
          onDismiss={() => { setShowInsightsNudge(false); markNudgeSeen("insights_ready"); }}
          duration={6000}
          delay={800}
        />

        {/* Guided trigger hint for first-time users */}
        <GuidedTooltip
          visible={showTriggerHint}
          text={t("ftue.whatHappened")}
          onDismiss={() => setShowTriggerHint(false)}
          duration={5000}
        />

        <View style={styles.grid}>
          {TRIGGERS.map((trigger, i) => (
            <StaggerIn key={trigger} index={4 + i} style={styles.gridItem}>
              <TriggerTile
                label={trigger}
                onPress={() => router.push(`/emotion?trigger=${trigger}`)}
              />
            </StaggerIn>
          ))}
        </View>
      </Animated.View>

      <StaggerIn index={4 + TRIGGERS.length}>
        <View style={[styles.bottomCard, dominantEmotion && { borderColor: emotionColor + "40" }]}>
          <Text style={styles.bottomEmoji}>
            {moments.length >= 10 ? "🌟" : todayCount >= 3 ? "✨" : todayCount > 0 ? "🔥" : "🌱"}
          </Text>
          <Text style={styles.bottomText}>
            {moments.length >= 10 && dominantTrigger
              ? t("log.bottomStrong", { trigger: t(`triggers.${dominantTrigger}`), emotion: dominantEmotion ? t(`emotions.${dominantEmotion}`) : t("log.nudgeBuildPatterns") })
              : moments.length >= 10
                ? t("log.bottomStrongGeneral")
                : todayCount >= 3
                  ? t("log.bottom3Today")
                  : moments.length >= 5
                    ? t("log.bottomGoodWeek")
                    : todayCount > 0
                      ? t("log.bottomMoreToday", { count: 3 - todayCount })
                      : t("log.bottomDefault")}
          </Text>
        </View>
      </StaggerIn>

      {/* FTUE framing overlay — shown once after onboarding carousel */}
      <SpotlightOverlay
        visible={showFraming}
        emoji="🎯"
        message={t("ftue.framingMessage")}
        cta={t("ftue.logFirstMoment")}
        onDismiss={() => setShowFraming(false)}
        skipLabel={t("ftue.skipGuide")}
        onSkip={() => { setShowFraming(false); obSkip(); }}
        position="center"
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  top: {
    flex: 1,
    gap: 20,
  },
  header: {
    gap: 6,
    marginTop: 10,
    marginBottom: 0,
  },
  kicker: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textShadowColor: palette.accentGlow,
    textShadowRadius: 12,
  },
  prompt: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.6,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  hint: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  valueStatement: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
    paddingBottom: 4,
  },
  gridItem: {
    width: "30%",
  },
  bottomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(13, 20, 36, 0.90)",
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  bottomEmoji: {
    fontSize: 18,
  },
  bottomText: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  patternNudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderLeftWidth: 3,
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nudgeContent: {
    flex: 1,
    gap: 2,
  },
  nudgeLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  nudgeBody: {
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});