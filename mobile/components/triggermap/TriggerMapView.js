/**
 * TriggerMapView — the redesigned Trigger Map experience.
 * ───────────────────────────────────────────────────────
 * A single, progressively-revealed narrative spine that leads with MEANING:
 *
 *   1. Headline   — what's happening, in one human line + a calm status orb
 *   2. Barometer  — "is something building?" as a calibrated band (+ divergence)
 *   3. Connected  — what's linked to it (friction) and what steadies you
 *   4. Changes    — what shifted vs before
 *   5. Watch      — emerging signals worth a gentle look
 *   6. Action     — one thing to try, on the same surface (insight → action)
 *   7. Explore    — the full depth (patterns / progress / guidance), demoted
 *
 * Everything is driven by deriveSignalState(report, progress); this component is
 * presentation only. Tone stays calm and non-clinical: patterns from the user's
 * own logs, never a diagnosis.
 */
import { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette, spacing, radius, type } from "@/utils/theme";
import { FadeInView, AppearScale, Pulse, PressableScale } from "@/components/motion";
import { tap } from "@/utils/haptics";
import { PrimaryButton } from "@/components/PrimaryButton";
import { buildHeadline, dormantBody, confidenceLabel, buildChanges, buildWatch } from "@/utils/triggerCopy";
import { Signal } from "./Signal";
import { ConnectedPatterns } from "./ConnectedPatterns";
import { SeedMap } from "./SeedMap";

const ACTION_ICON = { regulate: "🌿", awareness: "👁️", experiment: "🧪" };

const TONE = {
  warning: { color: palette.danger, glyph: "◑", pulse: true },
  attention: { color: palette.warning, glyph: "◔", pulse: false },
  calm: { color: palette.success, glyph: "●", pulse: false },
  neutral: { color: palette.accent, glyph: "○", pulse: false },
};

/* ── Section heading ── */
function SectionLabel({ children, color }) {
  return <Text style={[styles.sectionLabel, color && { color }]}>{children}</Text>;
}

/* ── One inline action ── */
function ActionCard({ action, t, onFeedback, response }) {
  // Seed from the shared response so feedback given in For You shows here too.
  const [responded, setResponded] = useState(response || null);
  useEffect(() => { if (response) setResponded(response); }, [response]);
  if (!action) return null;
  const icon = ACTION_ICON[action.type] || "🌿";
  const submit = async (r) => {
    if (responded) return;
    tap();
    setResponded(r); // optimistic
    try {
      await onFeedback?.(action.id, r); // now actually persists (and carries to For You)
    } catch {
      setResponded(null); // submit failed — let the user try again
    }
  };
  return (
    <FadeInView style={styles.actionCard}>
      <View style={styles.actionHead}>
        <Text style={styles.actionIcon}>{icon}</Text>
        <Text style={styles.actionTitle}>{action.title}</Text>
      </View>
      {action.reason ? <Text style={styles.actionReason}>{action.reason}</Text> : null}
      {responded ? (
        <Text style={[styles.actionThanks, responded === "not_helpful" && { color: palette.warning }]}>{t("triggerMap.action.thanks")}</Text>
      ) : (
        <View style={styles.actionBtns}>
          <PressableScale style={[styles.actionBtn, styles.actionBtnYes]} onPress={() => submit("helped")}>
            <Text style={[styles.actionBtnText, { color: palette.success }]}>✓ {t("triggerMap.action.helpful")}</Text>
          </PressableScale>
          <PressableScale style={[styles.actionBtn, styles.actionBtnNo]} onPress={() => submit("not_helpful")}>
            <Text style={[styles.actionBtnText, { color: palette.warning }]}>✕ {t("triggerMap.action.notHelpful")}</Text>
          </PressableScale>
        </View>
      )}
    </FadeInView>
  );
}

function seedLabels(t) {
  return {
    kicker: t("triggerMap.seed.kicker"),
    areasLabel: t("triggerMap.seed.areasLabel"),
    feelingsLabel: t("triggerMap.seed.feelingsLabel"),
    again: t("triggerMap.seed.again"),
    firstPoint: t("triggerMap.seed.firstPoint"),
    growCaption: t("triggerMap.seed.growCaption"),
  };
}

/* ── First-run experience (reflection / thread): value at the first log ── */
function SeedExperience({ signal, t, onLogMoment }) {
  const copy = buildHeadline(signal, t);
  const conf = confidenceLabel(signal, t);
  const tone = TONE.neutral;
  const orbGlyph = signal.state === "thread" ? "✦✦" : "✦";
  return (
    <>
      <FadeInView style={styles.hero}>
        <View style={styles.heroRow}>
          <AppearScale style={styles.orbWrap}>
            <Pulse style={[styles.orbGlow, { backgroundColor: tone.color + "2e" }]} />
            <View style={[styles.orb, { borderColor: tone.color, backgroundColor: tone.color + "1f" }]}>
              <Text style={[styles.orbGlyph, { color: tone.color, fontSize: signal.state === "thread" ? 15 : 22 }]}>{orbGlyph}</Text>
            </View>
          </AppearScale>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>{t("triggerMap.kicker")}</Text>
            <Text style={styles.heroTitle}>{copy.title}</Text>
          </View>
        </View>
        <Text style={styles.heroBody}>{copy.body}</Text>
        <View style={[styles.confChip, { borderColor: tone.color + "44", backgroundColor: tone.color + "14" }]}>
          <Text style={[styles.confChipText, { color: tone.color }]}>{conf}</Text>
        </View>
      </FadeInView>

      <SeedMap seed={signal.seed} state={signal.state} labels={seedLabels(t)} t={t} />

      <View style={styles.seedCta}>
        <PrimaryButton label={t("triggerMap.logMoment")} onPress={onLogMoment} />
      </View>
      <Text style={styles.disclaimer}>{t("triggerMap.disclaimer")}</Text>
    </>
  );
}

/* ── Empty-ish states (seeding / dormant) ── */
function StarterState({ signal, t, onLogMoment }) {
  const copy = buildHeadline(signal, t);
  const isDormant = signal.state === "dormant";
  return (
    <FadeInView style={styles.starter}>
      <AppearScale style={styles.starterOrbWrap}>
        <Pulse style={[styles.orbGlow, { backgroundColor: palette.accent + "2e" }]} />
        <View style={[styles.starterOrb, { borderColor: palette.accent }]}>
          <Text style={styles.starterEmoji}>{isDormant ? "🌙" : "🌱"}</Text>
        </View>
      </AppearScale>
      <Text style={styles.kicker}>{t("triggerMap.kicker")}</Text>
      <Text style={styles.starterTitle}>{copy.title}</Text>
      <Text style={styles.starterBody}>{isDormant ? dormantBody(signal, t) : copy.body}</Text>
      <View style={styles.starterCta}>
        <PrimaryButton label={t("triggerMap.logMoment")} onPress={onLogMoment} />
      </View>
    </FadeInView>
  );
}

export function TriggerMapView({ signal, t, lang, onLogMoment, onActionFeedback, actionResponse }) {
  if (!signal) return null;

  // First & second log get a real, personal map — not a half-empty shell.
  if (signal.state === "reflection" || signal.state === "thread") {
    return (
      <View style={styles.container}>
        <SeedExperience signal={signal} t={t} onLogMoment={onLogMoment} />
      </View>
    );
  }

  // Empty (0 logs) / dormant get a focused starter — no half-empty cards.
  if (signal.state === "seeding" || signal.state === "dormant") {
    return (
      <View style={styles.container}>
        <StarterState signal={signal} t={t} onLogMoment={onLogMoment} />
      </View>
    );
  }

  const changes = buildChanges(signal, t);
  const watch = buildWatch(signal, t);
  const { friction, regulators } = signal.connected;

  const connectedLabels = {
    frictionTitle: t("triggerMap.connected.frictionTitle"),
    regulatorTitle: t("triggerMap.connected.regulatorTitle"),
    emerging: t("triggerMap.connected.emerging"),
    recurring: t("triggerMap.connected.recurring"),
    times: t("triggerMap.connected.times"),
    empty: t("triggerMap.connected.empty"),
  };

  return (
    <View style={styles.container}>
      <Signal signal={signal} t={t} />

      {(friction.length || regulators.length) ? (
        <View style={styles.section}>
          <SectionLabel>{t("triggerMap.connected.title")}</SectionLabel>
          <ConnectedPatterns friction={friction} regulators={regulators} labels={connectedLabels} t={t} />
        </View>
      ) : null}

      {changes.length ? (
        <View style={styles.section}>
          <SectionLabel>{t("triggerMap.changes.title")}</SectionLabel>
          <View style={styles.listCard}>
            {changes.map((c, i) => (
              <FadeInView key={i} delay={i * 60} style={styles.listRow}>
                <Text style={styles.listDot}>·</Text>
                <Text style={styles.listText}>{c}</Text>
              </FadeInView>
            ))}
          </View>
        </View>
      ) : null}

      {watch.length ? (
        <View style={styles.section}>
          <SectionLabel color={palette.warning}>{t("triggerMap.watch.title")}</SectionLabel>
          <View style={[styles.listCard, styles.watchCard]}>
            {watch.map((w, i) => (
              <FadeInView key={i} delay={i * 60} style={styles.listRow}>
                <Text style={[styles.listDot, { color: palette.warning }]}>◇</Text>
                <Text style={styles.listText}>{w}</Text>
              </FadeInView>
            ))}
          </View>
        </View>
      ) : null}

      {signal.action ? (
        <View style={styles.section}>
          <SectionLabel color={palette.accent}>{t("triggerMap.action.title")}</SectionLabel>
          <ActionCard action={signal.action} t={t} onFeedback={onActionFeedback} response={actionResponse} />
        </View>
      ) : null}

      <Text style={styles.disclaimer}>{t("triggerMap.disclaimer")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },

  /* Hero */
  hero: {
    backgroundColor: palette.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.lg,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  orbWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  orbGlow: { position: "absolute", width: 56, height: 56, borderRadius: 28 },
  orb: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  orbGlyph: { fontSize: 22, fontWeight: "800" },
  heroText: { flex: 1 },
  kicker: { ...type.kicker, color: palette.accent },
  heroTitle: { ...type.title, color: palette.text, marginTop: 4 },
  heroBody: { color: palette.textSecondary, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  confChip: { alignSelf: "flex-start", marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  confChipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },

  /* Sections */
  section: { marginTop: spacing.lg },
  sectionLabel: { ...type.kicker, color: palette.muted, marginBottom: spacing.sm },

  listCard: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.md,
    gap: 8,
  },
  watchCard: { borderColor: palette.warning + "33", backgroundColor: palette.warningSoft },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  listDot: { color: palette.muted, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  listText: { flex: 1, color: palette.textSecondary, fontSize: 14, lineHeight: 20 },

  /* Action */
  actionCard: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.accentMedium,
    padding: spacing.md,
  },
  actionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionIcon: { fontSize: 18 },
  actionTitle: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  actionReason: { color: palette.muted, fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  actionThanks: { color: palette.success, fontSize: 13, fontWeight: "700", marginTop: spacing.md },
  actionBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" },
  actionBtnYes: { backgroundColor: palette.successSoft, borderColor: palette.success + "44" },
  actionBtnNo: { backgroundColor: palette.warningSoft, borderColor: palette.warning + "44" },
  actionBtnText: { fontSize: 13.5, fontWeight: "700" },

  /* Starter / dormant */
  starter: {
    backgroundColor: palette.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.lg,
    alignItems: "center",
  },
  starterOrbWrap: { width: 84, height: 84, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  starterOrb: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentSoft },
  starterEmoji: { fontSize: 32 },
  starterTitle: { ...type.title, color: palette.text, textAlign: "center", marginTop: spacing.sm },
  starterBody: { color: palette.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: spacing.sm },
  starterCta: { width: "100%", marginTop: spacing.lg },
  seedCta: { width: "100%", marginTop: spacing.lg },

  /* Disclaimer */
  disclaimer: { color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: spacing.lg, opacity: 0.8 },
});

export default TriggerMapView;
