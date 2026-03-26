import { useEffect, useRef, useState } from "react";
import { Alert, Animated, BackHandler, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { ScreenShell } from "@/components/ScreenShell";
import { FeedbackCard } from "@/components/FeedbackCard";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { getRelevantTags, recordTagUsage } from "@/utils/adaptiveTags";
import { palette, radius } from "@/utils/theme";
import { tapToCoordinates, emotionColor, shortLabel, coordinatesToPosition } from "@/utils/emotionModel";
import { coordinatesToLegacy } from "@triggermap/shared/constants/emotions";
import { tap, selection, success as hapticSuccess } from "@/utils/haptics";
import * as Haptics from "expo-haptics";

const FIELD_SIZE = 280;

function showToast(message) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}

function showError(title, message) {
  Alert.alert(title, message);
}

export function EmotionSelectionScreen() {
  const { trigger } = useLocalSearchParams();
  const router = useRouter();
  const { saveMoment } = useAppSession();
  const { t, lang } = useLanguage();

  // Continuous emotion state
  const [coords, setCoords] = useState(null); // { valence, arousal, intensity }
  const [label, setLabel] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [adaptiveTags, setAdaptiveTags] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [saved, setSaved] = useState(false);

  // Animations
  const dotScale = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;
  const labelAnim = useRef(new Animated.Value(0)).current;
  const tagSectionAnim = useRef(new Animated.Value(0)).current;
  const saveButtonScale = useRef(new Animated.Value(1)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;

  // Derived legacy emotion for tag loading
  const legacyEmotion = coords ? coordinatesToLegacy(coords.valence, coords.arousal) : null;

  // Load adaptive tags when emotion coordinates change
  useEffect(() => {
    if (!legacyEmotion || !trigger) {
      setAdaptiveTags([]);
      return;
    }
    let active = true;
    getRelevantTags(trigger, legacyEmotion).then((tags) => {
      if (active) {
        setAdaptiveTags(tags);
        setSelectedTags([]);
        tagSectionAnim.setValue(0);
        Animated.spring(tagSectionAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => { active = false; };
  }, [legacyEmotion, trigger, tagSectionAnim]);

  function handleFieldTap(event) {
    const { locationX, locationY } = event.nativeEvent;
    const newCoords = tapToCoordinates(locationX, locationY, FIELD_SIZE);
    const newLabel = shortLabel(newCoords.valence, newCoords.arousal);

    setCoords(newCoords);
    setLabel(newLabel);

    // Haptic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Animate dot appearance
    dotScale.setValue(0);
    dotOpacity.setValue(1);
    Animated.spring(dotScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();

    // Animate ripple
    rippleScale.setValue(0.3);
    rippleOpacity.setValue(0.5);
    Animated.parallel([
      Animated.timing(rippleScale, { toValue: 2.5, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(rippleOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Animate label
    labelAnim.setValue(0);
    Animated.timing(labelAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }

  function toggleTag(tag) {
    selection();
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_TAGS_PER_MOMENT) return prev;
      return [...prev, tag];
    });
  }

  async function handleSave() {
    if (!coords || saving || saved) return;
    try {
      setSaving(true);
      Animated.sequence([
        Animated.timing(saveButtonScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
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

      if (selectedTags.length > 0 && legacyEmotion) {
        recordTagUsage(trigger, legacyEmotion, selectedTags).catch(() => null);
      }

      setSaved(true);
      setFeedback({
        patternFeedback: response?.patternFeedback || null,
        smartReflectionPrompt: response?.smartReflectionPrompt || null,
        pairCount: response?.pairCount || 0,
      });

      hapticSuccess();
      showToast("Moment logged ✓");
      setTimeout(() => router.replace("/(tabs)/timeline"), 3000);
    } catch {
      showError(t("emotion.saveFailed"), t("emotion.saveFailedMessage"));
    } finally {
      setSaving(false);
    }
  }

  // Post-save animations
  const orbScale = useRef(new Animated.Value(0)).current;
  const orbGlow = useRef(new Animated.Value(0)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!saved) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/(tabs)/timeline");
      return true;
    });
    return () => handler.remove();
  }, [saved, router]);

  if (saved && feedback) {
    const color = coords ? emotionColor(coords.valence, coords.arousal) : palette.accent;
    if (orbScale._value === 0) {
      const makeRipple = (anim, delay) =>
        Animated.loop(Animated.sequence([
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
      position: "absolute", top: 40 + 90 - 60, width: 120, height: 120, borderRadius: 60,
      borderWidth: 1.5, borderColor: color,
      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
    });

    return (
      <ScreenShell scroll>
        <View style={styles.feedbackWrap}>
          <Animated.View style={makeRippleStyle(ripple1)} />
          <Animated.View style={makeRippleStyle(ripple2)} />
          <Animated.View style={makeRippleStyle(ripple3)} />
          <Animated.View style={[styles.feedbackOrb, { backgroundColor: color, transform: [{ scale: orbScale }], opacity: orbOpacity }]} />
          <Animated.View style={[styles.feedbackOrbInner, { backgroundColor: color, transform: [{ scale: orbScale }] }]} />
          <Animated.View style={{ transform: [{ scale: orbScale }] }}>
            <Text style={styles.feedbackEmoji}>{label || "✓"}</Text>
          </Animated.View>
          <Text style={[styles.feedbackTitle, { color }]}>{t("emotion.heardYou")}</Text>
          <FeedbackCard feedback={feedback} trigger={trigger} emotion={legacyEmotion || "neutral"} />
          <Pressable style={styles.goTimelineBtn} onPress={() => { tap(); router.replace("/(tabs)/timeline"); }} accessibilityRole="button">
            <Text style={styles.goTimelineText}>{t("emotion.goTimeline")}</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  // Dot position on the field
  const dotPos = coords ? coordinatesToPosition(coords.valence, coords.arousal, FIELD_SIZE) : null;
  const dotColor = coords ? emotionColor(coords.valence, coords.arousal) : palette.accent;

  return (
    <ScreenShell scroll>
      <Pressable style={styles.backButton} onPress={() => { tap(); router.back(); }} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={palette.text} />
        <Text style={styles.backLabel}>{t("common.back")}</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.kicker}>{t(`triggers.${trigger}`) !== `triggers.${trigger}` ? t(`triggers.${trigger}`) : trigger}</Text>
        <Text style={styles.prompt}>{t("emotion.prompt")}</Text>
        <Text style={styles.hint}>{t("emotion.tapAnywhere") || "Tap anywhere to mark how you feel"}</Text>
      </View>

      {/* ── Circular emotion field ── */}
      <View style={styles.fieldContainer}>
        {/* Anchor labels */}
        <Text style={[styles.anchor, styles.anchorTop]}>{t("emotion.anchor.energized") || "energized"}</Text>
        <Text style={[styles.anchor, styles.anchorRight]}>{t("emotion.anchor.calm") || "calm"}</Text>
        <Text style={[styles.anchor, styles.anchorBottom]}>{t("emotion.anchor.low") || "low"}</Text>
        <Text style={[styles.anchor, styles.anchorLeft]}>{t("emotion.anchor.tense") || "tense"}</Text>

        <Pressable style={styles.field} onPress={handleFieldTap}>
          {/* Gradient zones using layered semi-transparent views */}
          <View style={[styles.fieldQuadrant, styles.fieldTopLeft]} />
          <View style={[styles.fieldQuadrant, styles.fieldTopRight]} />
          <View style={[styles.fieldQuadrant, styles.fieldBottomLeft]} />
          <View style={[styles.fieldQuadrant, styles.fieldBottomRight]} />

          {/* Center label */}
          <View style={styles.fieldCenter}>
            <Text style={styles.fieldCenterLabel}>{t("emotion.neutral") || "neutral"}</Text>
          </View>

          {/* Crosshair guides */}
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />

          {/* Ripple animation on tap */}
          {dotPos && (
            <Animated.View style={[styles.tapRipple, {
              left: dotPos.x - 30, top: dotPos.y - 30,
              backgroundColor: dotColor,
              transform: [{ scale: rippleScale }],
              opacity: rippleOpacity,
            }]} />
          )}

          {/* Placed dot */}
          {dotPos && (
            <Animated.View style={[styles.dot, {
              left: dotPos.x - 12, top: dotPos.y - 12,
              backgroundColor: dotColor,
              transform: [{ scale: dotScale }],
              opacity: dotOpacity,
              shadowColor: dotColor,
            }]} />
          )}
        </Pressable>
      </View>

      {/* Derived label */}
      {label && (
        <Animated.View style={[styles.derivedLabelWrap, { opacity: labelAnim, transform: [{ translateY: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          <Text style={[styles.derivedLabel, { color: dotColor }]}>{label}</Text>
        </Animated.View>
      )}

      {/* Contributing tags */}
      {coords && adaptiveTags.length > 0 && (
        <Animated.View style={[styles.tagSection, {
          opacity: tagSectionAnim,
          transform: [{ translateY: tagSectionAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }]}>
          <Text style={styles.tagLabel}>{t("emotion.whatContributed") || "What contributed?"}</Text>
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
                  style={({ pressed }) => [styles.tagChip, active && styles.tagChipActive, atMax && styles.tagChipDisabled, pressed && !atMax && styles.tagChipPressed]}
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
          disabled={!coords || saving}
          onPress={handleSave}
          style={({ pressed }) => [styles.saveButton, !coords && styles.saveButtonDisabled, pressed && coords && styles.saveButtonPressed]}
        >
          <Text style={[styles.saveButtonText, !coords && styles.saveButtonTextDisabled]}>
            {saving ? t("emotion.saving") : t("emotion.saveMoment")}
          </Text>
        </Pressable>
      </Animated.View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 6, paddingRight: 12, marginTop: 4,
  },
  backLabel: { color: palette.text, fontSize: 15, fontWeight: "600" },
  header: { gap: 6, marginTop: 10 },
  kicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  prompt: { color: palette.text, fontSize: 26, lineHeight: 32, fontWeight: "700" },
  hint: { color: palette.textSecondary, fontSize: 13, fontWeight: "500", marginTop: 2 },

  // ── Circular emotion field ──
  fieldContainer: {
    alignItems: "center", justifyContent: "center", marginVertical: 20, position: "relative",
    width: FIELD_SIZE + 60, height: FIELD_SIZE + 60, alignSelf: "center",
  },
  field: {
    width: FIELD_SIZE, height: FIELD_SIZE, borderRadius: FIELD_SIZE / 2,
    backgroundColor: "rgba(13, 20, 36, 0.85)",
    borderWidth: 1, borderColor: palette.glassBorder,
    overflow: "hidden", position: "relative",
  },
  fieldQuadrant: { position: "absolute", width: FIELD_SIZE / 2, height: FIELD_SIZE / 2 },
  fieldTopLeft: { top: 0, left: 0, backgroundColor: "rgba(255, 107, 122, 0.10)" },
  fieldTopRight: { top: 0, right: 0, backgroundColor: "rgba(86, 208, 224, 0.10)" },
  fieldBottomLeft: { bottom: 0, left: 0, backgroundColor: "rgba(167, 139, 250, 0.10)" },
  fieldBottomRight: { bottom: 0, right: 0, backgroundColor: "rgba(94, 230, 160, 0.10)" },
  fieldCenter: {
    position: "absolute", top: FIELD_SIZE / 2 - 10, left: 0, right: 0, alignItems: "center",
  },
  fieldCenterLabel: { color: palette.muted, fontSize: 10, fontWeight: "600", opacity: 0.6 },
  crosshairH: {
    position: "absolute", top: FIELD_SIZE / 2, left: 20, right: 20,
    height: 1, backgroundColor: "rgba(148, 180, 224, 0.08)",
  },
  crosshairV: {
    position: "absolute", left: FIELD_SIZE / 2, top: 20, bottom: 20,
    width: 1, backgroundColor: "rgba(148, 180, 224, 0.08)",
  },
  anchor: {
    position: "absolute", color: palette.muted, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.5,
  },
  anchorTop: { top: 0, left: 0, right: 0, textAlign: "center" },
  anchorRight: { right: 0, top: FIELD_SIZE / 2 + 20, transform: [{ rotate: "0deg" }] },
  anchorBottom: { bottom: 0, left: 0, right: 0, textAlign: "center" },
  anchorLeft: { left: 0, top: FIELD_SIZE / 2 + 20 },
  dot: {
    position: "absolute", width: 24, height: 24, borderRadius: 12,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 6,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
  },
  tapRipple: {
    position: "absolute", width: 60, height: 60, borderRadius: 30,
  },
  derivedLabelWrap: { alignItems: "center", marginTop: -8 },
  derivedLabel: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3, textTransform: "capitalize" },

  // ── Tags & note (unchanged) ──
  tagSection: { gap: 10 },
  tagLabel: { color: palette.accent, fontSize: 13, fontWeight: "600" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm,
    borderWidth: 1, borderColor: palette.glassBorder, backgroundColor: palette.glass,
  },
  tagChipActive: { borderColor: palette.accent, backgroundColor: palette.accentStrong },
  tagChipDisabled: { opacity: 0.35 },
  tagChipPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  tagText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  tagTextActive: { color: palette.text },
  tagTextDisabled: { color: palette.muted },
  noteCard: {
    padding: 16, borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder, gap: 8,
  },
  noteLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  input: { minHeight: 72, color: palette.text, textAlignVertical: "top", fontSize: 15, lineHeight: 22 },
  saveButton: {
    minHeight: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: palette.accentStrong, shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  saveButtonDisabled: { backgroundColor: palette.glass, shadowOpacity: 0, elevation: 0 },
  saveButtonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  saveButtonText: { color: palette.text, fontSize: 16, fontWeight: "700" },
  saveButtonTextDisabled: { color: palette.textSecondary },
  feedbackWrap: {
    flex: 1, justifyContent: "center", alignItems: "center", gap: 18, paddingTop: 80, paddingBottom: 40,
  },
  goTimelineBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: radius.pill, backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accentMedium,
  },
  goTimelineText: { color: palette.accent, fontSize: 14, fontWeight: "700" },
  feedbackOrb: { position: "absolute", top: 40, width: 180, height: 180, borderRadius: 90 },
  feedbackOrbInner: { width: 80, height: 80, borderRadius: 40, opacity: 0.2, marginBottom: -20 },
  feedbackEmoji: { fontSize: 24, fontWeight: "700", color: palette.text, marginBottom: 4 },
  feedbackTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
});