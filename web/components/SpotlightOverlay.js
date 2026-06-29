import { useEffect, useState } from "react";

/**
 * SpotlightOverlay (web) — dimmed full-screen overlay with a message card.
 * Web port of mobile/components/SpotlightOverlay.js.
 *
 * Props: visible, message, cta, onDismiss, position ("center"|"top"|"bottom"),
 *        emoji, secondary, skipLabel, onSkip
 */
export function SpotlightOverlay({
  visible,
  message,
  cta,
  onDismiss,
  position = "center",
  emoji,
  secondary,
  skipLabel,
  onSkip,
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let timer;
    if (visible) {
      setMounted(true);
      // next frame → trigger transition
      timer = setTimeout(() => setShown(true), 20);
    } else if (mounted) {
      setShown(false);
      timer = setTimeout(() => setMounted(false), 220);
    }
    return () => clearTimeout(timer);
  }, [visible, mounted]);

  if (!mounted) return null;

  const posClass =
    position === "top" ? "spotlightCardTop" : position === "bottom" ? "spotlightCardBottom" : "spotlightCardCenter";

  return (
    <div className={`spotlightOverlay${shown ? " spotlightOverlayVisible" : ""}`} role="dialog" aria-modal="true">
      <button type="button" className="spotlightBackdrop" aria-label="Dismiss" onClick={onDismiss} />
      {skipLabel ? (
        <button type="button" className="spotlightSkip" onClick={onSkip}>{skipLabel}</button>
      ) : null}
      <div className={`spotlightCard ${posClass}${shown ? " spotlightCardIn" : ""}`}>
        {emoji ? <div className="spotlightEmoji">{emoji}</div> : null}
        <p className="spotlightMessage">{message}</p>
        {secondary ? <p className="spotlightSecondary">{secondary}</p> : null}
        {cta ? (
          <button type="button" className="spotlightCta" onClick={onDismiss}>{cta}</button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * GuidedTooltip (web) — small contextual tooltip, no dimming, auto-dismisses.
 * Props: visible, text, onDismiss, position ("above"|"below"), delay, duration.
 */
export function GuidedTooltip({ visible, text, onDismiss, position = "below", delay = 300, duration = 4000 }) {
  const [show, setShow] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      setShown(false);
      return undefined;
    }
    let dismissTimer;
    const showTimer = setTimeout(() => {
      setShow(true);
      requestAnimationFrame(() => setShown(true));
      if (duration > 0) {
        dismissTimer = setTimeout(() => {
          setShown(false);
          setTimeout(() => {
            setShow(false);
            onDismiss?.();
          }, 300);
        }, duration);
      }
    }, delay);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [visible, delay, duration, onDismiss]);

  if (!show) return null;

  return (
    <div className={`guidedTooltip${position === "above" ? " guidedTooltipAbove" : ""}${shown ? " guidedTooltipIn" : ""}`}>
      <button
        type="button"
        className="guidedTooltipInner"
        onClick={() => {
          setShown(false);
          setTimeout(() => { setShow(false); onDismiss?.(); }, 200);
        }}
      >
        <span className="guidedTooltipText">{text}</span>
        <span className="guidedTooltipDismiss">✓</span>
      </button>
    </div>
  );
}

export default SpotlightOverlay;
