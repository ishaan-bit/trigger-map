/**
 * TriggerBarometer — the early-awareness centerpiece.
 * ───────────────────────────────────────────────────
 * Answers "is something building?" as a CALIBRATED BAND (Steady · Shifting ·
 * Building) with a marker, a trend direction, and plain-language drivers —
 * never a fabricated percentage or clinical claim. When the invoked layer is
 * available, it also draws the honest "surface vs underneath" divergence: how
 * your days read on top vs the steadier read underneath them.
 */
import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from "react-native-svg";
import { palette, spacing, radius, type } from "@/utils/theme";
import { FadeInView, AppearScale } from "@/components/motion";

const BAND_COLOR = {
  steady: palette.success,
  shifting: palette.warning,
  building: palette.danger,
};

const DIR_GLYPH = { easing: "↘", holding: "→", rising: "↗" };

/* Smooth a series of {x,y} points into a catmull-rom cubic path. */
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* Dual-line chart on a SHARED scale — the gap between the lines is the point. */
function DivergenceChart({ divergence, color }) {
  const W = 280;
  const H = 92;
  const pad = 8;
  const geometry = useMemo(() => {
    const surface = divergence.surface.filter((v) => v != null);
    const ground = divergence.ground.filter((v) => v != null);
    const all = [...surface, ...ground];
    if (all.length < 2) return null;
    const min = Math.min(...all) - 0.25;
    const max = Math.max(...all) + 0.25;
    const range = max - min || 1;
    const n = divergence.points.length;
    const toPts = (key) =>
      divergence.points.map((p, i) => ({
        x: pad + (i / (n - 1)) * (W - pad * 2),
        y: pad + (1 - (p[key] - min) / range) * (H - pad * 2),
      }));
    const sPts = toPts("surface");
    const gPts = toPts("ground");
    // Gap area = between surface (top) and ground (bottom), the "propped up" zone.
    // Straight-segment polygon (fill is subtle; the visible lines stay smoothed).
    const fwd = sPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const back = [...gPts].reverse().map((p) => `L ${p.x} ${p.y}`).join(" ");
    const gapArea = `${fwd} ${back} Z`;
    return { sLine: smoothPath(sPts), gLine: smoothPath(gPts), gapArea, sPts, gPts };
  }, [divergence]);

  if (!geometry) return null;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="divgap" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0.04" />
        </SvgGradient>
      </Defs>
      <Path d={geometry.gapArea} fill="url(#divgap)" />
      {/* Surface — how it looks on top */}
      <Path d={geometry.sLine} stroke={palette.muted} strokeWidth={2} fill="none" strokeDasharray="5 4" strokeLinecap="round" />
      {/* Ground truth — how it's actually landing */}
      <Path d={geometry.gLine} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={geometry.gPts[geometry.gPts.length - 1].x} cy={geometry.gPts[geometry.gPts.length - 1].y} r={3.5} fill={color} />
    </Svg>
  );
}

function ZoneTrack({ pressure, band }) {
  const markerColor = BAND_COLOR[band] || palette.accent;
  const left = `${Math.max(3, Math.min(97, pressure * 100))}%`;
  return (
    <View style={styles.trackWrap}>
      <View style={styles.track}>
        <View style={[styles.zone, { backgroundColor: palette.success + "26", borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }]} />
        <View style={[styles.zone, { backgroundColor: palette.warning + "22", flex: 1.1 }]} />
        <View style={[styles.zone, { backgroundColor: palette.danger + "22", borderTopRightRadius: 999, borderBottomRightRadius: 999 }]} />
      </View>
      <AppearScale style={[styles.marker, { left }]} delay={220}>
        <View style={[styles.markerDot, { backgroundColor: markerColor, shadowColor: markerColor }]} />
      </AppearScale>
    </View>
  );
}

export function TriggerBarometer({ barometer, drivers, labels }) {
  const { band, direction, enoughData, divergence } = barometer;
  const bandColor = BAND_COLOR[band] || palette.accent;

  if (!enoughData) {
    return (
      <FadeInView style={[styles.card, styles.cardMuted]}>
        <Text style={styles.kicker}>{labels.subtitle}</Text>
        <View style={[styles.track, { opacity: 0.4, marginTop: spacing.sm }]}>
          <View style={[styles.zone, { backgroundColor: palette.muted + "22", borderRadius: 999, flex: 3 }]} />
        </View>
        <Text style={styles.notEnough}>{labels.notEnough}</Text>
      </FadeInView>
    );
  }

  return (
    <FadeInView style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{labels.subtitle}</Text>
        <View style={[styles.dirChip, { backgroundColor: bandColor + "1f", borderColor: bandColor + "44" }]}>
          <Text style={[styles.dirChipText, { color: bandColor }]}>
            {DIR_GLYPH[direction]} {labels.direction[direction]}
          </Text>
        </View>
      </View>

      <ZoneTrack pressure={barometer.pressure} band={band} />
      <View style={styles.zoneLabels}>
        <Text style={[styles.zoneLabel, band === "steady" && { color: palette.success }]}>{labels.zones.steady}</Text>
        <Text style={[styles.zoneLabel, band === "shifting" && { color: palette.warning }]}>{labels.zones.shifting}</Text>
        <Text style={[styles.zoneLabel, band === "building" && { color: palette.danger }]}>{labels.zones.building}</Text>
      </View>

      {drivers?.length ? (
        <View style={styles.drivers}>
          {drivers.slice(0, 3).map((d, i) => (
            <View key={i} style={styles.driverRow}>
              <View style={[styles.driverDot, { backgroundColor: bandColor }]} />
              <Text style={styles.driverText}>{d}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {divergence?.diverging ? (
        <View style={styles.divBox}>
          <Text style={styles.divTitle}>{labels.divergence.title}</Text>
          <View style={styles.divChart}>
            <DivergenceChart divergence={divergence} color={bandColor} />
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: palette.muted }]} />
              <Text style={styles.legendText}>{labels.divergence.surface}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: bandColor }]} />
              <Text style={styles.legendText}>{labels.divergence.ground}</Text>
            </View>
          </View>
          <Text style={styles.divBody}>{labels.divergence.body}</Text>
        </View>
      ) : null}
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
  },
  cardMuted: { opacity: 0.92 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { ...type.kicker, color: palette.accent },
  dirChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  dirChipText: { fontSize: 12, fontWeight: "700" },
  trackWrap: { marginTop: spacing.md, justifyContent: "center" },
  track: { flexDirection: "row", height: 14, borderRadius: 999, overflow: "hidden", gap: 2 },
  zone: { flex: 1, height: "100%" },
  marker: { position: "absolute", marginLeft: -9, alignItems: "center", justifyContent: "center" },
  markerDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: palette.background,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  zoneLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  zoneLabel: { fontSize: 11, fontWeight: "700", color: palette.muted, letterSpacing: 0.3 },
  drivers: { marginTop: spacing.md, gap: 7 },
  driverRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  driverDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  driverText: { flex: 1, color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  divBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  divTitle: { fontSize: 13, fontWeight: "700", color: palette.text, marginBottom: spacing.sm },
  divChart: { alignItems: "center" },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDash: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, color: palette.muted, fontWeight: "600" },
  divBody: { marginTop: spacing.sm, color: palette.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  notEnough: { marginTop: spacing.sm, color: palette.muted, fontSize: 13, lineHeight: 19 },
});

export default TriggerBarometer;
