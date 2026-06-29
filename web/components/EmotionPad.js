import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derivedEmotionLabel } from "@triggermap/shared/constants/emotions";

/**
 * EmotionPad (web) — pointer/touch-driven 2D valence×arousal field.
 *
 * Web reimplementation of mobile/components/EmotionPad.js. Reproduces: a
 * draggable cursor, magnetic-center snap, a 5-dot motion trail, axis-crossing
 * flashes, quadrant vibration (navigator.vibrate — silently ignored on iOS),
 * a live label + intensity-qualified human summary, and an intensity-driven glow.
 * A hidden range-pair stays available for keyboard/AT users.
 *
 *   x = valence (-1 unpleasant ←→ +1 pleasant)
 *   y = arousal (-1 calm ←→ +1 intense)
 */

const CENTER_MAGNETIC_RADIUS = 0.08;
const TRAIL_OPACITIES = [0.22, 0.15, 0.1, 0.06, 0.03];

function quantize(n) {
  return Math.round(n * 20) / 20;
}

function humanSummary(valence, arousal, t) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  if (mag < 0.12) return t("emotion.summaryNeutral", "Centered and steady");

  let prefix = "";
  if (mag > 0.7) prefix = t("emotion.intensityHigh", "Very ");
  else if (mag > 0.4) prefix = "";
  else prefix = t("emotion.intensityLow", "Slightly ");

  const v = valence;
  const a = arousal;
  if (v > 0.15 && a > 0.15) return prefix + t("emotion.summaryEnergized", "energized");
  if (v > 0.15 && a < -0.15) return prefix + t("emotion.summaryCalm", "calm");
  if (v > 0.15) return prefix + t("emotion.summaryContent", "good");
  if (v < -0.15 && a > 0.15) return prefix + t("emotion.summaryAnxious", "anxious");
  if (v < -0.15 && a < -0.15) return prefix + t("emotion.summaryLow", "low");
  if (v < -0.15) return prefix + t("emotion.summaryOff", "off");
  if (a > 0.15) return prefix + t("emotion.summaryAlert", "alert");
  if (a < -0.15) return prefix + t("emotion.summaryFlat", "flat");
  return t("emotion.summaryNeutral", "Centered and steady");
}

function vibrate(ms) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported (iOS Safari) — ignore
  }
}

export function EmotionPad({ value, onChange, accentColor = "#56d0e0", derivedLabel, t = (k, fb) => fb }) {
  const padRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Cursor as fractions [0,1] of the pad (cx = valence axis, cy inverted arousal).
  const [cursor, setCursor] = useState({
    cx: (value.valence + 1) / 2,
    cy: 1 - (value.arousal + 1) / 2,
  });
  const [trail, setTrail] = useState([]);
  const [flashH, setFlashH] = useState(false);
  const [flashV, setFlashV] = useState(false);
  const [labelPop, setLabelPop] = useState(0);

  const lastEmit = useRef({ v: null, a: null });
  const prevQuadrant = useRef(-1);
  const prevSideH = useRef(-1);
  const prevSideV = useRef(-1);
  const prevLabelKey = useRef(null);
  const flashHTimer = useRef(null);
  const flashVTimer = useRef(null);

  // Sync from external value only before first touch (initial / programmatic reset).
  useEffect(() => {
    if (touched) return;
    setCursor({ cx: (value.valence + 1) / 2, cy: 1 - (value.arousal + 1) / 2 });
  }, [value.valence, value.arousal, touched]);

  const liveValence = cursor.cx * 2 - 1;
  const liveArousal = -(cursor.cy * 2 - 1);
  const mag = Math.min(1, Math.sqrt(liveValence * liveValence + liveArousal * liveArousal));

  const labelKey = useMemo(() => derivedEmotionLabel(liveValence, liveArousal), [liveValence, liveArousal]);
  const labelText = touched
    ? t(`emotions.${labelKey}`, labelKey.replace(/_/g, " "))
    : derivedLabel || t("emotions.neutral", "neutral");
  const summary = useMemo(() => humanSummary(liveValence, liveArousal, t), [liveValence, liveArousal, t]);

  // Pop the label whenever the region (label key) changes mid-drag.
  useEffect(() => {
    if (prevLabelKey.current !== null && prevLabelKey.current !== labelKey) {
      setLabelPop((n) => n + 1);
    }
    prevLabelKey.current = labelKey;
  }, [labelKey]);

  const emit = useCallback(
    (cx, cy, force = false) => {
      let v = quantize(cx * 2 - 1);
      let a = quantize(-(cy * 2 - 1));
      if (Math.sqrt(v * v + a * a) < CENTER_MAGNETIC_RADIUS) {
        v = 0;
        a = 0;
      }
      if (!force && v === lastEmit.current.v && a === lastEmit.current.a) return;
      lastEmit.current = { v, a };
      const intensity = Math.min(1, Math.round(Math.sqrt(v * v + a * a) * 100) / 100);
      onChange?.(v, a, intensity);
    },
    [onChange]
  );

  const fracFromEvent = useCallback((e) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { cx, cy };
  }, []);

  const handleMove = useCallback(
    (cx, cy, isStart) => {
      setCursor({ cx, cy });
      setTrail((prev) => [{ cx, cy }, ...prev].slice(0, 5));

      // Quadrant change → light vibration.
      const q = (cx < 0.5 ? 0 : 1) + (cy < 0.5 ? 0 : 2);
      if (isStart) prevQuadrant.current = q;
      else if (q !== prevQuadrant.current) {
        prevQuadrant.current = q;
        vibrate(8);
      }

      // Axis-cross flashes.
      const sH = cy < 0.5 ? 0 : 1;
      const sV = cx < 0.5 ? 0 : 1;
      if (!isStart && prevSideH.current >= 0 && sH !== prevSideH.current) {
        setFlashH(true);
        clearTimeout(flashHTimer.current);
        flashHTimer.current = setTimeout(() => setFlashH(false), 400);
      }
      if (!isStart && prevSideV.current >= 0 && sV !== prevSideV.current) {
        setFlashV(true);
        clearTimeout(flashVTimer.current);
        flashVTimer.current = setTimeout(() => setFlashV(false), 400);
      }
      prevSideH.current = sH;
      prevSideV.current = sV;

      emit(cx, cy, isStart);
    },
    [emit]
  );

  const onPointerDown = useCallback(
    (e) => {
      const frac = fracFromEvent(e);
      if (!frac) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setTouched(true);
      setDragging(true);
      vibrate(8);
      handleMove(frac.cx, frac.cy, true);
    },
    [fracFromEvent, handleMove]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging) return;
      const frac = fracFromEvent(e);
      if (frac) handleMove(frac.cx, frac.cy, false);
    },
    [dragging, fracFromEvent, handleMove]
  );

  const endDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    emit(cursor.cx, cursor.cy, true);
  }, [dragging, emit, cursor.cx, cursor.cy]);

  useEffect(() => () => {
    clearTimeout(flashHTimer.current);
    clearTimeout(flashVTimer.current);
  }, []);

  // Keyboard / AT fallback via sliders.
  const onSlider = useCallback(
    (axis, raw) => {
      setTouched(true);
      const next = axis === "v"
        ? { cx: (raw + 1) / 2, cy: cursor.cy }
        : { cx: cursor.cx, cy: 1 - (raw + 1) / 2 };
      setCursor(next);
      emit(next.cx, next.cy, true);
    },
    [cursor.cx, cursor.cy, emit]
  );

  const glowScale = 0.5 + Math.min(1, mag / 0.7) * 0.9;
  const glowOpacity = 0.04 + Math.min(1, mag) * 0.26 + (dragging ? 0.06 : 0);

  return (
    <div className="emoPad">
      <div className="emoPadStateRow">
        <span className="emoPadDot" style={{ backgroundColor: accentColor }} />
        <div className="emoPadStateCopy">
          <span key={labelPop} className="emoPadLabel emoPadLabelPop" style={{ color: accentColor }}>{labelText}</span>
          <span className="emoPadSummary">{summary}</span>
        </div>
      </div>

      <div className="emoPadOuter">
        <span className="emoPadAnchor emoPadAnchorTop">{t("emotion.anchorIntense", "Intense")}</span>
        <span className="emoPadAnchor emoPadAnchorBottom">{t("emotion.anchorCalm", "Calm")}</span>
        <span className="emoPadAnchor emoPadAnchorLeft">{t("emotion.anchorUnpleasant", "Unpleasant")}</span>
        <span className="emoPadAnchor emoPadAnchorRight">{t("emotion.anchorPleasant", "Pleasant")}</span>

        <div
          ref={padRef}
          className="emoPadSurface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          role="application"
          aria-label={t("emotion.padLabel", "Emotion pad — drag to set how you feel")}
        >
          <div className="emoPadQuadTop" />
          <div className="emoPadQuadBottom" />
          <div className="emoPadGridH" />
          <div className="emoPadGridV" />
          <div className={`emoPadFlashH${flashH ? " emoPadFlashOn" : ""}`} />
          <div className={`emoPadFlashV${flashV ? " emoPadFlashOn" : ""}`} />
          <div className="emoPadCenterDot" style={{ opacity: Math.max(0, 0.35 - mag) }} />

          {trail.map((p, i) => (
            <span
              key={i}
              className="emoPadTrail"
              style={{
                left: `${p.cx * 100}%`,
                top: `${p.cy * 100}%`,
                backgroundColor: accentColor,
                opacity: dragging ? TRAIL_OPACITIES[i] || 0 : 0,
              }}
            />
          ))}

          <span
            className="emoPadGlow"
            style={{
              left: `${cursor.cx * 100}%`,
              top: `${cursor.cy * 100}%`,
              backgroundColor: accentColor,
              opacity: glowOpacity,
              transform: `translate(-50%, -50%) scale(${glowScale})`,
            }}
          />
          <span
            className={`emoPadCursor${dragging ? " emoPadCursorDrag" : ""}`}
            style={{ left: `${cursor.cx * 100}%`, top: `${cursor.cy * 100}%`, borderColor: accentColor }}
          >
            <span className="emoPadCursorCore" style={{ backgroundColor: accentColor }} />
          </span>
        </div>
      </div>

      {/* Accessible fallback */}
      <div className="emoPadSliders" aria-hidden={false}>
        <label className="emoPadSliderLabel">
          {t("emotion.axisPleasant", "Unpleasant ↔ Pleasant")}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={liveValence}
            onChange={(e) => onSlider("v", parseFloat(e.target.value))}
          />
        </label>
        <label className="emoPadSliderLabel">
          {t("emotion.axisIntense", "Calm ↔ Intense")}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={liveArousal}
            onChange={(e) => onSlider("a", parseFloat(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

export default EmotionPad;
