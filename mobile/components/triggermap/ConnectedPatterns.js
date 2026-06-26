/**
 * ConnectedPatterns — the trigger map proper, as legible directional links.
 * ─────────────────────────────────────────────────────────────────────────
 * Each row reads left→right as a sentence you can scan in a second:
 *   [area]  ──tends to bring──▸  [feeling]   · Recurring · 4×
 * Line weight encodes how often the link has shown up. We deliberately avoid an
 * abstract node-graph (which would force users to learn a new visual grammar);
 * the same edge data is shown as plain, color-coded links.
 */
import { View, Text, StyleSheet } from "react-native";
import { palette, spacing, radius, type } from "@/utils/theme";
import { TRIGGER_COLORS, EMOTION_COLORS } from "@/utils/designSystem";
import { triggerIcon, emotionEmoji } from "@/utils/glyphs";
import { FadeInView } from "@/components/motion";

function LinkRow({ link, labels, kind, t, index }) {
  const tColor = TRIGGER_COLORS[link.trigger] || palette.accent;
  const eColor = EMOTION_COLORS[link.emotion] || palette.muted;
  const lineColor = kind === "regulator" ? palette.success : eColor;
  // Weight: 2 reps → thin, 5+ → bold.
  const weight = Math.max(2, Math.min(6, link.count));
  const triggerLabel = (() => {
    const m = t("triggers." + link.trigger);
    return m && m !== "triggers." + link.trigger ? m : link.trigger;
  })();
  const emotionLabel = t("emotions." + link.emotion) || link.emotion;

  return (
    <FadeInView delay={index * 70} style={styles.row}>
      <View style={styles.node}>
        <View style={[styles.nodeDot, { backgroundColor: tColor + "26", borderColor: tColor + "55" }]}>
          <Text style={styles.nodeIcon}>{triggerIcon(link.trigger)}</Text>
        </View>
        <Text style={[styles.nodeLabel, { color: tColor }]} numberOfLines={1}>{triggerLabel}</Text>
      </View>

      <View style={styles.connector}>
        <View style={[styles.line, { height: weight, backgroundColor: lineColor + "66" }]} />
        <Text style={[styles.arrow, { color: lineColor }]}>▸</Text>
      </View>

      <View style={styles.node}>
        <View style={[styles.nodeDot, { backgroundColor: eColor + "22", borderColor: eColor + "55" }]}>
          <Text style={styles.nodeIcon}>{emotionEmoji(link.emotion)}</Text>
        </View>
        <Text style={[styles.nodeLabel, { color: eColor }]} numberOfLines={1}>{emotionLabel}</Text>
      </View>

      <View style={styles.metaCol}>
        {kind === "friction" ? (
          <View style={[styles.strengthTag, link.strength === "recurring" ? styles.tagRecurring : styles.tagEmerging]}>
            <Text
              numberOfLines={1}
              style={[styles.strengthText, { color: link.strength === "recurring" ? palette.danger : palette.warning }]}
            >
              {link.strength === "recurring" ? labels.recurring : labels.emerging}
            </Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={styles.count}>{labels.times.replace("{count}", link.count)}</Text>
      </View>
    </FadeInView>
  );
}

export function ConnectedPatterns({ friction = [], regulators = [], labels, t }) {
  if (!friction.length && !regulators.length) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>{labels.empty}</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {friction.length ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{labels.frictionTitle}</Text>
          {friction.map((f, i) => (
            <LinkRow key={`f-${f.trigger}-${f.emotion}`} link={f} labels={labels} kind="friction" t={t} index={i} />
          ))}
        </View>
      ) : null}

      {regulators.length ? (
        <View style={[styles.group, friction.length && { marginTop: spacing.md }]}>
          <Text style={[styles.groupTitle, { color: palette.success }]}>{labels.regulatorTitle}</Text>
          {regulators.map((r, i) => (
            <LinkRow key={`r-${r.trigger}-${r.emotion}`} link={r} labels={labels} kind="regulator" t={t} index={i} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  group: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.md,
  },
  groupTitle: { ...type.kicker, color: palette.warning, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  node: { width: 58, alignItems: "center" },
  nodeDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeIcon: { fontSize: 18 },
  nodeLabel: { fontSize: 11, fontWeight: "700", marginTop: 4, textAlign: "center" },
  // The flexible connector absorbs any horizontal squeeze (minWidth:0) so the
  // fixed meta column keeps its room and "Recurring"/"3×" never wrap or collide.
  connector: { flex: 1, minWidth: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  line: { width: "100%", borderRadius: 999 },
  arrow: { position: "absolute", right: 0, fontSize: 13, top: "50%", marginTop: -9 },
  metaCol: { width: 76, alignItems: "flex-end", gap: 3, flexShrink: 0 },
  strengthTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, maxWidth: "100%" },
  tagRecurring: { backgroundColor: palette.dangerSoft, borderColor: palette.danger + "44" },
  tagEmerging: { backgroundColor: palette.warningSoft, borderColor: palette.warning + "44" },
  strengthText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  count: { fontSize: 12, fontWeight: "700", color: palette.muted },
  emptyCard: {
    backgroundColor: palette.glass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
});

export default ConnectedPatterns;
