import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, BackHandler, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import {
  createEmotionCoordinates,
  coordinatesToLegacy,
  derivedEmotionLabel,
  EMOTION_AXIS_STEPS,
  emotionRegionKey,
} from "@triggermap/shared/constants/emotions";
import { ScreenShell } from "@/components/ScreenShell";
import { FeedbackCard } from "@/components/FeedbackCard";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { getRelevantTags, recordTagUsage } from "@/utils/adaptiveTags";
import { emotionColor } from "@/utils/emotionModel";
import { palette, radius } from "@/utils/theme";
import { tap, selection, success as hapticSuccess } from "@/utils/haptics";

function showToast(message) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}

function showError(title, message) {
  Alert.alert(title, message);
}

function translateEmotionLabel(t, key) {
  const translated = t(`emotions.${key}`);
  if (translated !== `emotions.${key}`) return translated;
  return key.replace(/_/g, " ");
}

function AxisSlider({ question, helper, leftLabel, rightLabel, value, onChange, gradientColors, accentColor }) {
  const [trackWidth, setTrackWidth] = useState(1);

  const updateFromLocation = (locationX) => {
    const nextX = Math.max(0, Math.min(trackWidth, locationX));
    const rawValue = (nextX / trackWidth) * 2 - 1;
    onChange(rawValue);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => updateFromLocation(event.nativeEvent.locationX),
      onPanResponderMove: (event) => updateFromLocation(event.nativeEvent.locationX),
    })
  ).current;

  const thumbLeft = ((value + 1) / 2) * trackWidth;

  return (
    <View style={styles.sliderCard}>
      <View style={styles.sliderHeadingRow}>
        <Text style={styles.sliderQuestion}>{question}</Text>
        <Text style={[styles.sliderHelper, { color: accentColor }]}>{helper}</Text>
      </View>
      <View
        style={styles.sliderTrackWrap}
        onLayout={(event) => setTrackWidth(Math.max(event.nativeEvent.layout.width, 1))}
        {...panResponder.panHandlers}
      >
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.sliderTrack} />
        <View style={styles.sliderTrackOverlay} />
        {EMOTION_AXIS_STEPS.map((step) => (
          <View
            key={step}
            style={[
              styles.sliderStop,
              {
                left: `${((step + 1) / 2) * 100}%`,
              },
            ]}
          />
        ))}
        <Animated.View style={[styles.sliderThumbShadow, { left: thumbLeft - 20, shadowColor: accentColor }]} />
        <View style={[styles.sliderThumb, { left: thumbLeft - 15, borderColor: accentColor }]}>
          <View style={[styles.sliderThumbCore, { backgroundColor: accentColor }]} />
        </View>
      </View>
      <View style={styles.sliderLabelsRow}>
        <Text style={styles.sliderEdgeLabel}>{leftLabel}</Text>
        <Text style={styles.sliderEdgeLabel}>{rightLabel}</Text>
      </View>
    </View>
  );
}

export function EmotionSelectionScreen() {
  const { trigger } = useLocalSearchParams();
  const router = useRouter();
  const { saveMoment } = useAppSession();
  const { t, lang } = useLanguage();

  const [sliderValues, setSliderValues] = useState({ feel: 0, energy: 0 });
  const [selectedTags, setSelectedTags] = useState([]);
  const [adaptiveTags, setAdaptiveTags] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [saved, setSaved] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const tagSectionAnim = useRef(new Animated.Value(0)).current;
  const saveButtonScale = useRef(new Animated.Value(1)).current;
  const orbScale = useRef(new Animated.Value(0)).current;
  const orbGlow = useRef(new Animated.Value(0)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const previousSnapKey = useRef("0:0");

  const coords = useMemo(
    () => createEmotionCoordinates(sliderValues.feel, sliderValues.energy),
    [sliderValues.feel, sliderValues.energy]
  );
  const regionKey = useMemo(
    () => emotionRegionKey(coords.valence, coords.arousal),
    [coords.arousal, coords.valence]
  );
  const legacyEmotion = useMemo(
    () => coordinatesToLegacy(coords.valence, coords.arousal),
    [coords.arousal, coords.valence]
  );
  const derivedLabelKey = useMemo(
    () => derivedEmotionLabel(coords.valence, coords.arousal),
    [coords.arousal, coords.valence]
  );
  const derivedLabel = translateEmotionLabel(t, derivedLabelKey);
  const accentColor = emotionColor(coords.valence, coords.arousal);
  const contextForTags = useMemo(
    () => ({
      emotion: legacyEmotion,
      regionKey,
      valence: coords.valence,
      arousal: coords.arousal,
    }),
    [coords.arousal, coords.valence, legacyEmotion, regionKey]
  );

  useEffect(() => {
    const snapKey = `${coords.valence}:${coords.arousal}`;
    if (!hasInteracted || previousSnapKey.current === snapKey) return;
    previousSnapKey.current = snapKey;
    Haptics.selectionAsync().catch(() => null);
  }, [coords.arousal, coords.valence, hasInteracted]);

  useEffect(() => {
    if (!hasInteracted || !trigger) {
      setAdaptiveTags([]);
      return;
    }

    let active = true;
    getRelevantTags(trigger, contextForTags).then((tags) => {
      if (!active) return;
      setAdaptiveTags(tags);
      setSelectedTags([]);
      tagSectionAnim.setValue(0);
      Animated.spring(tagSectionAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      active = false;
    };
  }, [contextForTags, hasInteracted, tagSectionAnim, trigger]);

  useEffect(() => {
    if (!saved) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/(tabs)/timeline");
      return true;
    });
    return () => handler.remove();
  }, [saved, router]);

  const updateAxis = (axis, value) => {
    setHasInteracted(true);
    setSliderValues((current) => ({ ...current, [axis]: value }));
  };

  function toggleTag(tag) {
    selection();
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((entry) => entry !== tag);
      if (prev.length >= MAX_TAGS_PER_MOMENT) return prev;
      return [...prev, tag];
    });
  }

  async function handleSave() {
    if (!hasInteracted || saving || saved) return;

    try {
      setSaving(true);
      Animated.sequence([
        Animated.timing(saveButtonScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
        Animated.timing(saveButtonScale, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start();

      const payload = {
        trigger,
        valence: coords.valence,
        arousal: coords.arousal,
        intensity: coords.intensity,
        note,
        lang,
      };
      if (selectedTags.length > 0) payload.tags = selectedTags;

      const response = await saveMoment(payload);

      if (selectedTags.length > 0) {
        recordTagUsage(trigger, contextForTags, selectedTags).catch(() => null);
      }

      setSaved(true);
      setFeedback({
        patternFeedback: response?.patternFeedback || null,
        smartReflectionPrompt: response?.smartReflectionPrompt || null,
        pairCount: response?.pairCount || 0,
      });

      hapticSuccess();
      showToast(t("emotion.savedToast") !== "emotion.savedToast" ? t("emotion.savedToast") : "Moment logged");
      setTimeout(() => router.replace("/(tabs)/timeline"), 3000);
    } catch {
      showError(t("emotion.saveFailed"), t("emotion.saveFailedMessage"));
    } finally {
      setSaving(false);
    }
  }

  if (saved && feedback) {
    if (orbScale._value === 0) {
      const makeRipple = (anim, delay) => Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));

      Animated.parallel([
        Animated.sequence([
          Animated.spring(orbScale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
          Animated.loop(Animated.sequence([
            Animated.timing(orbGlow, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(orbGlow, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])),
        ]),
        makeRipple(ripple1, 0),
        makeRipple(ripple2, 800),
        makeRipple(ripple3, 1600),
      ]).start();
    }

    const orbOpacity = orbGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] });
    const makeRippleStyle = (anim) => ({
      position: "absolute",
      top: 70,
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 1.5,
      borderColor: accentColor,
      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
    });

    return (
      <ScreenShell scroll>
        <View style={styles.feedbackWrap}>
          <Animated.View style={makeRippleStyle(ripple1)} />
          <Animated.View style={makeRippleStyle(ripple2)} />
          <Animated.View style={makeRippleStyle(ripple3)} />
          <Animated.View style={[styles.feedbackOrb, { backgroundColor: accentColor, transform: [{ scale: orbScale }], opacity: orbOpacity }]} />
          <Animated.View style={[styles.feedbackOrbInner, { backgroundColor: accentColor, transform: [{ scale: orbScale }] }]} />
          <Animated.View style={{ transform: [{ scale: orbScale }] }}>
            <Text style={styles.feedbackEmoji}>{derivedLabel}</Text>
          </Animated.View>
          <Text style={[styles.feedbackTitle, { color: accentColor }]}>{t("emotion.heardYou")}</Text>
          <FeedbackCard feedback={feedback} trigger={trigger} emotion={legacyEmotion || "neutral"} />
          <Pressable style={styles.goTimelineBtn} onPress={() => { tap(); router.replace("/(tabs)/timeline"); }} accessibilityRole="button">
            <Text style={styles.goTimelineText}>{t("emotion.goTimeline")}</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  const canSave = hasInteracted && !saving;
  const triggerLabel = t(`triggers.${trigger}`) !== `triggers.${trigger}` ? t(`triggers.${trigger}`) : trigger;
  const tagHint = t("emotion.tagHint", { count: MAX_TAGS_PER_MOMENT });

  return (
    <ScreenShell scroll>
      <Pressable style={styles.backButton} onPress={() => { tap(); router.back(); }} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={palette.text} />
        <Text style={styles.backLabel}>{t("common.back")}</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.kicker}>{triggerLabel}</Text>
        <Text style={styles.prompt}>{t("emotion.prompt")}</Text>
        <Text style={styles.hint}>{t("emotion.hint")}</Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryLabelRow}>
          <Text style={styles.summaryEyebrow}>{t("emotion.liveRead")}</Text>
          <Text style={[styles.summaryRegion, { color: accentColor }]}>{t(`emotion.regions.${regionKey}`)}</Text>
        </View>
        <Text style={[styles.summaryEmotion, { color: accentColor }]}>{derivedLabel}</Text>
        <Text style={styles.summaryBody}>{t("emotion.liveSummary", { emotion: derivedLabel.toLowerCase(), trigger: triggerLabel.toLowerCase() })}</Text>
      </View>

      <AxisSlider
        question={t("emotion.axisFeelQuestion")}
        helper={t("emotion.axisFeelHelper")}
        leftLabel={t("emotion.axisFeelLeft")}
        rightLabel={t("emotion.axisFeelRight")}
        value={sliderValues.feel}
        onChange={(value) => updateAxis("feel", value)}
        gradientColors={["rgba(255,107,122,0.95)", "rgba(255,179,71,0.85)", "rgba(94,230,160,0.95)"]}
        accentColor={sliderValues.feel >= 0 ? palette.success : palette.danger}
      />

      <AxisSlider
        question={t("emotion.axisEnergyQuestion")}
        helper={t("emotion.axisEnergyHelper")}
        leftLabel={t("emotion.axisEnergyLeft")}
        rightLabel={t("emotion.axisEnergyRight")}
        value={sliderValues.energy}
        onChange={(value) => updateAxis("energy", value)}
        gradientColors={["rgba(167,139,250,0.95)", "rgba(127,168,212,0.85)", "rgba(86,208,224,0.95)"]}
        accentColor={sliderValues.energy >= 0 ? palette.accent : palette.purple}
      />

      {hasInteracted && adaptiveTags.length > 0 && (
        <Animated.View style={[styles.tagSection, {
          opacity: tagSectionAnim,
          transform: [{ translateY: tagSectionAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }]}>
          <View style={styles.tagHeaderRow}>
            <Text style={styles.tagLabel}>{t("emotion.whatContributed")}</Text>
            <Text style={styles.tagHint}>{tagHint !== "emotion.tagHint" ? tagHint : `Pick up to ${MAX_TAGS_PER_MOMENT}`}</Text>
          </View>
          <View style={styles.tagWrap}>
            {adaptiveTags.map((tag) => {
              const active = selectedTags.includes(tag);
              const atMax = selectedTags.length >= MAX_TAGS_PER_MOMENT && !active;
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  disabled={atMax}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.tagChip, active && [styles.tagChipActive, { borderColor: accentColor }], atMax && styles.tagChipDisabled, pressed && !atMax && styles.tagChipPressed]}
                >
                  <Text style={[styles.tagText, active && styles.tagTextActive, atMax && styles.tagTextDisabled]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "android" ? "padding" : "height"}>
        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>{t("emotion.noteLabel")}</Text>
          <TextInput
            multiline
            numberOfLines={3}
            onChangeText={setNote}
            placeholder={t("emotion.notePlaceholder")}
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={note}
            maxFontSizeMultiplier={1.2}
          />
        </View>
      </KeyboardAvoidingView>

      <Animated.View style={{ transform: [{ scale: saveButtonScale }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save moment"
          disabled={!canSave}
          onPress={handleSave}
          style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, pressed && canSave && styles.saveButtonPressed, canSave && { backgroundColor: accentColor }]}
        >
          <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
            {saving ? t("emotion.saving") : t("emotion.saveMoment")}
          </Text>
        </Pressable>
      </Animated.View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
    marginTop: 4,
  },
  backLabel: { color: palette.text, fontSize: 15, fontWeight: "600" },
  header: { gap: 8, marginTop: 10 },
  kicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  prompt: { color: palette.text, fontSize: 28, lineHeight: 34, fontWeight: "800" },
  hint: { color: palette.textSecondary, fontSize: 14, lineHeight: 21 },
  summaryCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 6,
  },
  summaryLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  summaryEyebrow: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  summaryRegion: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  summaryEmotion: { fontSize: 28, lineHeight: 32, fontWeight: "800", textTransform: "capitalize" },
  summaryBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21 },
  sliderCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 16,
  },
  sliderHeadingRow: { gap: 4 },
  sliderQuestion: { color: palette.text, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  sliderHelper: { fontSize: 13, fontWeight: "600" },
  sliderTrackWrap: {
    height: 52,
    justifyContent: "center",
    position: "relative",
  },
  sliderTrack: {
    height: 16,
    borderRadius: radius.pill,
  },
  sliderTrackOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 18,
    bottom: 18,
    backgroundColor: "rgba(6, 10, 18, 0.12)",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sliderStop: {
    position: "absolute",
    top: 17,
    marginLeft: -1,
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  sliderThumbShadow: {
    position: "absolute",
    top: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  sliderThumb: {
    position: "absolute",
    top: 11,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.surface,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sliderThumbCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  sliderLabelsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sliderEdgeLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  tagSection: { marginTop: 18, gap: 10 },
  tagHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  tagLabel: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  tagHint: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
  },
  tagChipActive: { backgroundColor: palette.accentSoft },
  tagChipDisabled: { opacity: 0.35 },
  tagChipPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  tagText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  tagTextActive: { color: palette.text },
  tagTextDisabled: { color: palette.muted },
  noteCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 8,
  },
  noteLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  input: { minHeight: 72, color: palette.text, textAlignVertical: "top", fontSize: 15, lineHeight: 22 },
  saveButton: {
    minHeight: 54,
    marginTop: 20,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveButtonDisabled: { backgroundColor: palette.glass, shadowOpacity: 0, elevation: 0 },
  saveButtonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  saveButtonText: { color: palette.text, fontSize: 16, fontWeight: "700" },
  saveButtonTextDisabled: { color: palette.textSecondary },
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
    paddingTop: 80,
    paddingBottom: 40,
  },
  goTimelineBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accentMedium,
  },
  goTimelineText: { color: palette.accent, fontSize: 14, fontWeight: "700" },
  feedbackOrb: { position: "absolute", top: 40, width: 180, height: 180, borderRadius: 90 },
  feedbackOrbInner: { width: 80, height: 80, borderRadius: 40, opacity: 0.2, marginBottom: -20 },
  feedbackEmoji: { fontSize: 24, fontWeight: "700", color: palette.text, marginBottom: 4, textTransform: "capitalize" },
  feedbackTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
});
