import { useMemo } from "react";
import { legacyToCoordinates } from "@triggermap/shared/constants/emotions";
import { emotionColor } from "../lib/emotionModel";

/**
 * EmotionTrajectory (web) — last 30 days plotted on a valence/arousal field with
 * labelled corners, a dashed baseline ring (your usual centre), recency-faded
 * trail, recency-coloured/sized dots (newest largest + pulsing halo), a valence
 * sparkline and a one-line drift summary. Web port of the mobile trajectory.
 */

const SIZE = 300;
const PAD = 26;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const ZONES = [
  { key: "stressed", v: -0.6, a: 0.6 }, { key: "alert", v: 0, a: 0.7 }, { key: "energized", v: 0.6, a: 0.6 },
  { key: "uneasy", v: -0.7, a: 0 }, { key: "neutral", v: 0, a: 0 }, { key: "engaged", v: 0.7, a: 0 },
  { key: "low", v: -0.6, a: -0.6 }, { key: "flat", v: 0, a: -0.7 }, { key: "calm", v: 0.6, a: -0.6 },
];

function dominantZone(points) {
  if (!points.length) return null;
  const tally = {};
  for (const pt of points) {
    let near = null; let nd = Infinity;
    for (const z of ZONES) {
      const d = (pt.valence - z.v) ** 2 + (pt.arousal - z.a) ** 2;
      if (d < nd) { nd = d; near = z; }
    }
    if (near) tally[near.key] = (tally[near.key] || 0) + 1;
  }
  let best = null; let bestCount = 0;
  for (const [key, count] of Object.entries(tally)) {
    if (count > bestCount) { bestCount = count; best = key; }
  }
  return best;
}

export function EmotionTrajectory({ moments, onTapPoint, t = (k, fb) => fb }) {
  const points = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS;
    return (moments || [])
      .filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((m) => {
        const v = typeof m.valence === "number" ? m.valence : legacyToCoordinates(m.emotion)?.valence || 0;
        const a = typeof m.arousal === "number" ? m.arousal : legacyToCoordinates(m.emotion)?.arousal || 0;
        return { id: m.id, valence: v, arousal: a, emotion: m.emotion, trigger: m.trigger, note: m.note, timestamp: m.timestamp };
      });
  }, [moments]);

  const baseline = useMemo(() => {
    if (points.length < 3) return null;
    return {
      v: points.reduce((s, p) => s + p.valence, 0) / points.length,
      a: points.reduce((s, p) => s + p.arousal, 0) / points.length,
    };
  }, [points]);

  const dominant = useMemo(() => dominantZone(points), [points]);

  if (points.length < 2) return null;

  const toX = (v) => SIZE / 2 + v * (SIZE / 2 - PAD);
  const toY = (a) => SIZE / 2 - a * (SIZE / 2 - PAD);
  const last = points[points.length - 1];

  let driftLabel = null;
  if (baseline) {
    const dv = last.valence - baseline.v;
    const da = last.arousal - baseline.a;
    const mag = Math.sqrt(dv * dv + da * da);
    if (mag < 0.15) driftLabel = t("timeline.driftUsual", "near your usual");
    else if (dv > 0.2) driftLabel = t("timeline.driftAbove", "above usual");
    else if (dv < -0.2) driftLabel = t("timeline.driftBelow", "below usual");
    else if (da > 0.2) driftLabel = t("timeline.driftActivated", "more activated than usual");
    else if (da < -0.2) driftLabel = t("timeline.driftCalmer", "calmer than usual");
    else driftLabel = t("timeline.driftShifted", "shifted from usual");
  }

  // Valence sparkline path.
  const sparkW = SIZE;
  const sparkH = 48;
  const spark = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * sparkW;
    const y = sparkH / 2 - p.valence * (sparkH / 2 - 4);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="trajectoryCard">
      <p className="trajectoryHeading">{t("timeline.trajectoryHeading", "Emotional trajectory · last 30 days")}</p>
      <svg className="trajectoryField" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
        {/* grid */}
        <line x1={20} y1={SIZE / 2} x2={SIZE - 20} y2={SIZE / 2} stroke="rgba(148,180,224,0.08)" />
        <line x1={SIZE / 2} y1={20} x2={SIZE / 2} y2={SIZE - 20} stroke="rgba(148,180,224,0.08)" />
        {/* corner labels */}
        <text x={8} y={16} className="trajCorner" opacity={dominant === "stressed" ? 0.95 : 0.4}>{t("timeline.zoneStressed", "Stressed")}</text>
        <text x={SIZE - 8} y={16} textAnchor="end" className="trajCorner" opacity={dominant === "energized" ? 0.95 : 0.4}>{t("timeline.zoneEnergized", "Energized")}</text>
        <text x={8} y={SIZE - 8} className="trajCorner" opacity={dominant === "low" ? 0.95 : 0.4}>{t("timeline.zoneLow", "Low")}</text>
        <text x={SIZE - 8} y={SIZE - 8} textAnchor="end" className="trajCorner" opacity={dominant === "calm" ? 0.95 : 0.4}>{t("timeline.zoneCalm", "Calm")}</text>
        {/* axis labels */}
        <text x={SIZE / 2} y={12} textAnchor="middle" className="trajAxis">↑ activated</text>
        <text x={SIZE / 2} y={SIZE - 2} textAnchor="middle" className="trajAxis">↓ low energy</text>
        {/* baseline ring */}
        {baseline ? (
          <circle cx={toX(baseline.v)} cy={toY(baseline.a)} r={26} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 4" />
        ) : null}
        {/* trail */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const recency = i / points.length;
          return (
            <line
              key={`l-${i}`}
              x1={toX(prev.valence)} y1={toY(prev.arousal)}
              x2={toX(pt.valence)} y2={toY(pt.arousal)}
              stroke="#56d0e0" strokeWidth={1.5} opacity={0.08 + recency * 0.32}
            />
          );
        })}
        {/* dots */}
        {points.map((pt, i) => {
          const isLast = i === points.length - 1;
          const recency = i / Math.max(1, points.length - 1);
          const color = emotionColor(pt.valence, pt.arousal);
          const r = isLast ? 8 : 3 + recency * 2;
          return (
            <circle
              key={pt.id}
              cx={toX(pt.valence)} cy={toY(pt.arousal)} r={r}
              fill={color} opacity={0.25 + recency * 0.7}
              stroke={isLast ? "rgba(255,255,255,0.7)" : "none"} strokeWidth={isLast ? 2 : 0}
              style={{ cursor: onTapPoint ? "pointer" : "default" }}
              onClick={() => onTapPoint?.(pt)}
            />
          );
        })}
        {/* pulsing newest halo */}
        <circle className="trajPulse" cx={toX(last.valence)} cy={toY(last.arousal)} r={18} fill="none" stroke={emotionColor(last.valence, last.arousal)} strokeWidth={1.5} />
      </svg>

      <svg className="trajectorySpark" viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none">
        <path d={spark} fill="none" stroke={emotionColor(last.valence, last.arousal)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      <p className="trajectorySummary">
        {t("timeline.trajectoryMoments", { count: points.length })}
        {dominant ? ` · ${t("timeline.trajectoryMostly", "mostly")} ${t(`timeline.zone${dominant.charAt(0).toUpperCase()}${dominant.slice(1)}`, dominant).toLowerCase()}` : ""}
        {driftLabel ? ` · ${t("timeline.trajectoryNow", "now")} ${driftLabel}` : ""}
      </p>
      <p className="trajectoryLegend">{t("timeline.trajectoryLegend", "Bright dot = newest · faded = older · ring = your usual centre")}</p>
    </div>
  );
}

export default EmotionTrajectory;
