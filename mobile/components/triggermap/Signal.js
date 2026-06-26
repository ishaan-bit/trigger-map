/**
 * Signal — the early-detection centerpiece.
 * ─────────────────────────────────────────
 * One living read that answers "is something building?" — merging what used to
 * be two stacked, redundant cards (a headline + a separate barometer) into a
 * single animated radial dial:
 *
 *   • a 270° band arc (Steady · Shifting · Building) with a marker that SWEEPS
 *     to the current pressure on mount, and a soft pulse when it lands on
 *     "Building" — the calibrated read, never a fabricated percentage.
 *   • the plain-language headline (what's happening) above it,
 *   • the drivers (why) and a confidence chip below it,
 *   • and, when the invoked layer is available, the honest "surface vs
 *     underneath" divergence chart.
 *
 * Presentation only; everything is driven by the signal model.
 */
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from "react-native-svg";
import { palette, spacing, radius, type, motion } from "@/utils/theme";
import { FadeInView, Pulse } from "@/components/motion";
import { buildHeadline, buildDrivers, confidenceLabel } from "@/utils/triggerCopy";

const BAND_COLOR = {
  steady: palette.success,
  shifting: palette.warning,
  building: palette.danger,
};
const DIR_GLYPH = { easing: "↘", holding: "→", rising: "↗" };

const DIAL_SIZE = 196;
const STROKE = 15;
const START = 135; // bottom-left, opening at the bottom
const SWEEP = 270;
const R = (DIAL_SIZE - STROKE) / 2;
const CX = DIAL_SIZE / 2;
const CY = DIAL_SIZE / 2;

// Zone boundaries on the 0..1 pressure scale (mirrors computeBarometer bands).
const ZONES = [
  { key: "steady", from: 0, to: 0.4, color: palette.success },
  { key: "shifting", from: 0.4, to: 0.62, color: palette.warning },
  { key: "building", from: 0.62, to: 1, color: palette.danger },
];

function polar(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
}
function arcPath(fromFrac, toFrac) {
  const fromDeg = START + fromFrac * SWEEP;
  const toDeg = START + toFrac * SWEEP;
  const from = polar(fromDeg);
  const to = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${R} ${R} 0 ${large} 1 ${to.x} ${to.y}`;
}

/* ── The radial band dial ── */
function BandDial({ pressure, band, bandColor, enough, children }) {
  // Marker sweeps from the start of the arc to the live pressure on mount.
  const sweepAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const target = enough ? Math.max(0.02, Math.min(0.98, pressure)) : 0;
    const a = Animated.timing(sweepAnim, {
      toValue: target,
      duration: motion.duration.slow,
      delay: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [pressure, enough, sweepAnim]);

  const rotate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${SWEEP}deg`],
  });
  const markerStart = polar(START);
  const GAP = 0.012; // small gap between coloured zones

  return (
    <View style={styles.dialWrap}>
      <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
        <Defs>
          <SvgGradient id="dial-track" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.muted} stopOpacity="0.16" />
            <Stop offset="1" stopColor={palette.muted} stopOpacity="0.06" />
          </SvgGradient>
        </Defs>
        {/* Full faint track */}
        <Path d={arcPath(0, 1)} stroke="url(#dial-track)" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
        {/* Coloured zones — the active band reads brighter */}
        {enough
          ? ZONES.map((z) => (
              <Path
                key={z.key}
                d={arcPath(z.from + GAP, z.to - GAP)}
                stroke={z.color}
                strokeOpacity={band === z.key ? 0.95 : 0.32}
                strokeWidth={band === z.key ? STROKE : STROKE - 4}
                strokeLinecap="round"
                fill="none"
              />
            ))
          : null}
      </Svg>

      {/* Marker — a glowing dot that rides the arc to the live pressure. */}
      {enough ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.markerLayer, { width: DIAL_SIZE, height: DIAL_SIZE, transform: [{ rotate }] }]}
        >
          <View
            style={[
              styles.marker,
              { left: markerStart.x - 11, top: markerStart.y - 11, borderColor: bandColor, shadowColor: bandColor },
            ]}
          >
            <View style={[styles.markerCore, { backgroundColor: bandColor }]} />
          </View>
        </Animated.View>
      ) : null}

      {/* Center read */}
      <View style={styles.dialCenter} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

/* ── Surface-vs-underneath divergence (the invoked-layer payoff) ── */
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

function DivergenceChart({ divergence, color }) {
  const W = 264;
  const H = 88;
  const pad = 8;
  const geometry = useMemo(() => {
    const all = [...divergence.surface, ...divergence.ground].filter((v) => v != null);
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
    const fwd = sPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const back = [...gPts].reverse().map((p) => `L ${p.x} ${p.y}`).join(" ");
    return { sLine: smoothPath(sPts), gLine: smoothPath(gPts), gapArea: `${fwd} ${back} Z`, gPts };
  }, [divergence]);
  if (!geometry) return null;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="sig-divgap" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0.04" />
        </SvgGradient>
      </Defs>
      <Path d={geometry.gapArea} fill="url(#sig-divgap)" />
      <Path d={geometry.sLine} stroke={palette.muted} strokeWidth={2} fill="none" strokeDasharray="5 4" strokeLinecap="round" />
      <Path d={geometry.gLine} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={geometry.gPts[geometry.gPts.length - 1].x} cy={geometry.gPts[geometry.gPts.length - 1].y} r={3.5} fill={color} />
    </Svg>
  );
}

export function Signal({ signal, t }) {
  const { band, direction, enoughData, divergence } = signal.barometer;
  const bandColor = BAND_COLOR[band] || palette.accent;
  const copy = buildHeadline(signal, t);
  const drivers = buildDrivers(signal, t);
  const conf = confidenceLabel(signal, t);
  const zoneLabel = t("triggerMap.barometer.zones." + band) || band;
  const building = enoughData && band === "building";

  return (
    <FadeInView style={[styles.card, { borderColor: bandColor + "33" }]}>
      <View style={[styles.edge, { backgroundColor: bandColor }]} pointerEvents="none" />

      <Text style={styles.kicker}>{t("triggerMap.kicker")}</Text>
      <Text style={styles.title}>{copy.title}</Text>

      <View style={styles.dialBlock}>
        <View style={styles.dialStage}>
          {building ? <Pulse style={[styles.dialPulse, { backgroundColor: bandColor + "1a" }]} duration={2600} /> : null}
          <BandDial pressure={signal.barometer.pressure} band={band} bandColor={bandColor} enough={enoughData}>
          {enoughData ? (
            <>
              <Text style={[styles.bandWord, { color: bandColor }]}>{zoneLabel}</Text>
              <View style={[styles.dirChip, { backgroundColor: bandColor + "1f", borderColor: bandColor + "44" }]}>
                <Text style={[styles.dirText, { color: bandColor }]}>
                  {DIR_GLYPH[direction]} {t("triggerMap.barometer.direction." + direction)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.dialMutedWord}>{t("triggerMap.barometer.zones.steady")}…</Text>
          )}
          </BandDial>
        </View>
        {/* Zone legend under the dial opening */}
        {enoughData ? (
          <View style={styles.zoneLegend}>
            <Text style={[styles.zoneLegendText, band === "steady" && { color: palette.success }]}>
              {t("triggerMap.barometer.zones.steady")}
            </Text>
            <Text style={[styles.zoneLegendText, band === "shifting" && { color: palette.warning }]}>
              {t("triggerMap.barometer.zones.shifting")}
            </Text>
            <Text style={[styles.zoneLegendText, band === "building" && { color: palette.danger }]}>
              {t("triggerMap.barometer.zones.building")}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.body}>{copy.body}</Text>
      {!enoughData ? <Text style={styles.notEnough}>{t("triggerMap.barometer.notEnough")}</Text> : null}

      {enoughData && drivers.length ? (
        <View style={styles.drivers}>
          {drivers.map((d, i) => (
            <View key={i} style={styles.driverRow}>
              <View style={[styles.driverDot, { backgroundColor: bandColor }]} />
              <Text style={styles.driverText}>{d}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.confChip, { borderColor: bandColor + "44", backgroundColor: bandColor + "14" }]}>
        <Text style={[styles.confText, { color: bandColor }]}>{conf}</Text>
      </View>

      {divergence?.diverging ? (
        <View style={styles.divBox}>
          <Text style={styles.divTitle}>{t("triggerMap.barometer.divergence.title")}</Text>
          <View style={styles.divChart}>
            <DivergenceChart divergence={divergence} color={bandColor} />
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: palette.muted }]} />
              <Text style={styles.legendText}>{t("triggerMap.barometer.divergence.surface")}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { backgroundColor: bandColor }]} />
              <Text style={styles.legendText}>{t("triggerMap.barometer.divergence.ground")}</Text>
            </View>
          </View>
          <Text style={styles.divBody}>{t("triggerMap.barometer.divergence.body")}</Text>
        </View>
      ) : null}
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    overflow: "hidden",
  },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  kicker: { ...type.kicker, color: palette.accent },
  title: { ...type.title, color: palette.text, marginTop: 4 },

  dialBlock: { alignItems: "center", marginTop: spacing.lg },
  dialStage: { width: DIAL_SIZE, height: DIAL_SIZE, alignItems: "center", justifyContent: "center" },
  dialPulse: {
    position: "absolute",
    width: DIAL_SIZE + 28,
    height: DIAL_SIZE + 28,
    borderRadius: (DIAL_SIZE + 28) / 2,
    top: -14,
    left: -14,
  },
  dialWrap: { width: DIAL_SIZE, height: DIAL_SIZE, alignItems: "center", justifyContent: "center" },
  markerLayer: { position: "absolute", left: 0, top: 0 },
  marker: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    shadowOpacity: 0.8,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  markerCore: { width: 8, height: 8, borderRadius: 4 },
  dialCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8 },
  bandWord: { fontSize: 30, fontWeight: "800", letterSpacing: -0.4 },
  dialMutedWord: { color: palette.muted, fontSize: 18, fontWeight: "700" },
  dirChip: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  dirText: { fontSize: 12.5, fontWeight: "700" },

  zoneLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: DIAL_SIZE - 28,
    marginTop: -10,
  },
  zoneLegendText: { fontSize: 11, fontWeight: "700", color: palette.muted, letterSpacing: 0.3 },

  body: { color: palette.textSecondary, fontSize: 15, lineHeight: 22, marginTop: spacing.lg },
  notEnough: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },

  drivers: { marginTop: spacing.md, gap: 7 },
  driverRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  driverDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  driverText: { flex: 1, color: palette.textSecondary, fontSize: 13.5, lineHeight: 19 },

  confChip: { alignSelf: "flex-start", marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  confText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },

  divBox: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },
  divTitle: { fontSize: 13, fontWeight: "700", color: palette.text, marginBottom: spacing.sm },
  divChart: { alignItems: "center" },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDash: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, color: palette.muted, fontWeight: "600" },
  divBody: { marginTop: spacing.sm, color: palette.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
});

export default Signal;
