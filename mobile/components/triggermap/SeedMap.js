/**
 * SeedMap — the first-run map, where value lands at log one.
 * ──────────────────────────────────────────────────────────
 * Instead of an "insufficient data" shell, the earliest logs each get a real,
 * visual reflection of what the user recorded:
 *
 *   • reflection (1 log)  — the first point on the map: the area + feeling they
 *                           logged, rendered as a single glowing linked pair.
 *   • thread (2 logs)     — the areas & feelings so far, with a *possible* echo
 *                           flagged ("again") when one repeats. Never a pattern.
 *
 * A soft "growth" row conveys momentum toward the first observed pattern without
 * a hard data quota. Presentation only — all meaning comes from `seed`/copy.
 */
import { View, Text, StyleSheet } from "react-native";
import { palette, spacing, radius, type } from "@/utils/theme";
import { TRIGGER_COLORS, EMOTION_COLORS } from "@/utils/designSystem";
import { triggerIcon, emotionEmoji } from "@/utils/glyphs";
import { FadeInView, AppearScale } from "@/components/motion";

function triggerLabel(key, t) {
  const m = t("triggers." + key);
  return m && m !== "triggers." + key ? m : key;
}
function emotionLabel(key, t) {
  const m = t("emotions." + key);
  return m && m !== "emotions." + key ? m : key;
}

/* A single rounded chip for an area or feeling, with an optional "again" badge. */
function Chip({ icon, label, color, again, againLabel, index = 0 }) {
  return (
    <FadeInView delay={index * 70} style={[styles.chip, { borderColor: color + "55", backgroundColor: color + "14" }]}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipLabel, { color }]} numberOfLines={1}>{label}</Text>
      {again ? (
        <View style={[styles.againBadge, { backgroundColor: color + "26" }]}>
          <Text style={[styles.againText, { color }]}>↻ {againLabel}</Text>
        </View>
      ) : null}
    </FadeInView>
  );
}

/* Reflection: the first point — one area linked to one feeling. */
function FirstPoint({ seed, labels, t }) {
  const tk = seed.lead?.trigger;
  const ek = seed.lead?.emotion;
  if (!tk && !ek) return null;
  const tColor = TRIGGER_COLORS[tk] || palette.accent;
  const eColor = EMOTION_COLORS[ek] || palette.muted;
  return (
    <AppearScale style={styles.firstPointWrap}>
      <View style={styles.pointRow}>
        {tk ? (
          <View style={styles.pointNode}>
            <View style={[styles.nodeDot, { backgroundColor: tColor + "22", borderColor: tColor + "66" }]}>
              <Text style={styles.nodeIcon}>{triggerIcon(tk)}</Text>
            </View>
            <Text style={[styles.nodeLabel, { color: tColor }]} numberOfLines={1}>{triggerLabel(tk, t)}</Text>
          </View>
        ) : null}
        {tk && ek ? (
          <View style={styles.linkCol}>
            {/* Dotted connector via discrete dots — reliable on Android, where a
                single-side dashed border renders inconsistently. */}
            <View style={styles.linkDots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.linkDot, { backgroundColor: eColor + "88" }]} />
              ))}
            </View>
            <Text style={[styles.linkArrow, { color: eColor }]}>▸</Text>
          </View>
        ) : null}
        {ek ? (
          <View style={styles.pointNode}>
            <View style={[styles.nodeDot, { backgroundColor: eColor + "1f", borderColor: eColor + "66" }]}>
              <Text style={styles.nodeIcon}>{emotionEmoji(ek)}</Text>
            </View>
            <Text style={[styles.nodeLabel, { color: eColor }]} numberOfLines={1}>{emotionLabel(ek, t)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.firstPointCaption}>{labels.firstPoint}</Text>
    </AppearScale>
  );
}

/* Thread: the areas & feelings so far, as two scannable lanes. */
function Lanes({ seed, labels, t }) {
  const triggers = (seed.triggers || []).slice(0, 3);
  const emotions = (seed.emotions || []).slice(0, 3);
  return (
    <View style={styles.lanes}>
      {triggers.length ? (
        <View style={styles.lane}>
          <Text style={styles.laneLabel}>{labels.areasLabel}</Text>
          <View style={styles.chipRow}>
            {triggers.map((tr, i) => (
              <Chip
                key={tr.key}
                icon={triggerIcon(tr.key)}
                label={triggerLabel(tr.key, t)}
                color={TRIGGER_COLORS[tr.key] || palette.accent}
                again={tr.key === seed.repeatedTrigger}
                againLabel={labels.again}
                index={i}
              />
            ))}
          </View>
        </View>
      ) : null}
      {emotions.length ? (
        <View style={[styles.lane, triggers.length && { marginTop: spacing.md }]}>
          <Text style={styles.laneLabel}>{labels.feelingsLabel}</Text>
          <View style={styles.chipRow}>
            {emotions.map((em, i) => (
              <Chip
                key={em.key}
                icon={emotionEmoji(em.key)}
                label={emotionLabel(em.key, t)}
                color={EMOTION_COLORS[em.key] || palette.muted}
                again={em.key === seed.repeatedEmotion}
                againLabel={labels.again}
                index={i}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* Three soft dots conveying momentum toward the first observed pattern. */
function GrowthRow({ count, caption }) {
  const filled = Math.max(0, Math.min(3, count));
  return (
    <View style={styles.growthRow}>
      <View style={styles.growthDots}>
        {[0, 1, 2].map((i) => {
          const isFilled = i < filled;
          const isNext = i === filled;
          return (
            <View
              key={i}
              style={[
                styles.growthDot,
                isFilled && styles.growthDotFilled,
                isNext && styles.growthDotNext,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.growthCaption} numberOfLines={2}>{caption}</Text>
    </View>
  );
}

export function SeedMap({ seed, state, labels, t }) {
  if (!seed) return null;
  const count = state === "thread" ? 2 : 1;
  return (
    <FadeInView style={styles.card}>
      <Text style={styles.kicker}>{labels.kicker}</Text>
      {state === "thread" ? <Lanes seed={seed} labels={labels} t={t} /> : <FirstPoint seed={seed} labels={labels} t={t} />}
      <GrowthRow count={count} caption={labels.growCaption} />
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.md,
    marginTop: spacing.md,
    width: "100%",
  },
  kicker: { ...type.kicker, color: palette.accent, marginBottom: spacing.md },

  /* Reflection — first point */
  firstPointWrap: { alignItems: "center" },
  pointRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  pointNode: { alignItems: "center", maxWidth: 110 },
  nodeDot: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  nodeIcon: { fontSize: 24 },
  nodeLabel: { fontSize: 12.5, fontWeight: "700", marginTop: 6, textAlign: "center" },
  linkCol: { width: 44, alignItems: "center", justifyContent: "center" },
  linkDots: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkDot: { width: 4, height: 4, borderRadius: 2 },
  linkArrow: { position: "absolute", right: -2, fontSize: 14, fontWeight: "800" },
  firstPointCaption: { color: palette.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.3, marginTop: spacing.md, textTransform: "uppercase" },

  /* Thread — lanes */
  lanes: { width: "100%" },
  lane: { width: "100%" },
  laneLabel: { fontSize: 11, fontWeight: "800", color: palette.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  chipIcon: { fontSize: 16 },
  chipLabel: { fontSize: 13.5, fontWeight: "700", flexShrink: 1 },
  againBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 2 },
  againText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.2 },

  /* Growth */
  growthRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },
  growthDots: { flexDirection: "row", gap: 6 },
  growthDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.muted + "33" },
  growthDotFilled: { backgroundColor: palette.accent },
  growthDotNext: { borderWidth: 1.5, borderColor: palette.accent + "88", backgroundColor: "transparent" },
  growthCaption: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 16 },
});

export default SeedMap;
