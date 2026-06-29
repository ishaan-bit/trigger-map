import { useEffect, useState } from "react";

/**
 * Tooltip (web) — a one-time contextual hint, shown until dismissed/seen and
 * persisted in localStorage so it never reappears. Web port of
 * mobile/components/Tooltip.js.
 */
const PREFIX = "triggermap.tooltip.seen.";
const AUTO_DISMISS_MS = 4000;

export function Tooltip({ id, text, hidden = false }) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (hidden) return undefined;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(`${PREFIX}${id}`);
    } catch {
      seen = false;
    }
    if (seen) return undefined;

    setVisible(true);
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => {
      setShown(false);
      try { window.localStorage.setItem(`${PREFIX}${id}`, "1"); } catch {}
      setTimeout(() => setVisible(false), 400);
    }, AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [id, hidden]);

  function dismiss() {
    setShown(false);
    try { window.localStorage.setItem(`${PREFIX}${id}`, "1"); } catch {}
    setTimeout(() => setVisible(false), 200);
  }

  if (!visible || hidden) return null;

  return (
    <div className={`tmTooltip${shown ? " tmTooltipIn" : ""}`}>
      <div className="tmTooltipInner">
        <span className="tmTooltipText">{text}</span>
        <button type="button" className="tmTooltipDismiss" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}

export default Tooltip;
