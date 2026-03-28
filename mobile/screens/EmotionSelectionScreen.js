import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Alert, Animated, BackHandler, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import {
  coordinatesToLegacy,
  derivedEmotionLabel,
  emotionRegionKey,
} from "@triggermap/shared/constants/emotions";
import { ScreenShell } from "@/components/ScreenShell";
import { EmotionPad } from "@/components/EmotionPad";
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

export function EmotionSelectionScreen() {
  const { trigger } = useLocalSearchParams();
  const router = useRouter();
  const { saveMoment } = useAppSession();
  const { t, lang } = useLanguage();

  const [emotionCoords, setEmotionCoords] = useState({ valence: 0, arousal: 0, intensity: 0 });
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

  const regionKey = useMemo(
    () => emotionRegionKey(emotionCoords.valence, emotionCoords.arousal),
    [emotionCoords.valence, emotionCoords.arousal]
  );
  const legacyEmotion = useMemo(
    () => coordinatesToLegacy(emotionCoords.valence, emotionCoords.arousal),
    [emotionCoords.valence, emotionCoords.arousal]
  );
  const derivedLabelKey = useMemo(
    () => derivedEmotionLabel(emotionCoords.valence, emotionCoords.arousal),
    [emotionCoords.valence, emotionCoords.arousal]
  );
  const derivedLabel = translateEmotionLabel(t, derivedLabelKey);
  const accentColor = emotionColor(emotionCoords.valence, emotionCoords.arousal);
  const contextForTags = useMemo(
    () => ({
      emotion: legacyEmotion,
      regionKey,
      valence: emotionCoords.valence,
      arousal: emotionCoords.arousal,
    }),
    [emotionCoords.valence, emotionCoords.arousal, legacyEmotion, regionKey]
  );

  const handleEmotionChange = useCallback((valence, arousal, intensity) => {
    setHasInteracted(true);
    setEmotionCoords({ valence, arousal, intensity });
  }, []);

  useEffect(() => {
    // Snap key based on rounded coordinates for haptic feedback at region transitions
    const rv = Math.round(emotionCoords.valence * 2) / 2;
    const ra = Math.round(emotionCoords.arousal * 2) / 2;
    const snapKey = `${rv}:${ra}`;
    if (!hasInteracted || previousSnapKey.current === snapKey) return;
    previousSnapKey.current = snapKey;
    Haptics.selectionAsync().catch(() => null);
  }, [emotionCoords.valence, emotionCoords.arousal, hasInteracted]);

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
        valence: emotionCoords.valence,
        arousal: emotionCoords.arousal,
        intensity: emotionCoords.intensity,
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
        <Text style={styles.hint}>{t("emotion.padHint") !== "emotion.padHint" ? t("emotion.padHint") : "Tap or drag to place how you feel"}</Text>
      </View>

      <EmotionPad
        value={emotionCoords}
        onChange={handleEmotionChange}
        accentColor={accentColor}
        derivedLabel={derivedLabel}
        regionLabel={t(`emotion.regions.${regionKey}`)}
        t={t}
      />

      <Text style={styles.summaryBody}>{t("emotion.liveSummary", { emotion: derivedLabel.toLowerCase(), trigger: triggerLabel.toLowerCase() })}</Text>

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
  summaryBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21, paddingHorizontal: 4 },
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
