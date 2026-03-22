import { useEffect, useState } from "react";

export function InstallModalIOS({ open, onClose }) {
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    } else {
      setAnimate(false);
      const t = setTimeout(() => setVisible(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div
      className={`iosModalOverlay ${animate ? "iosModalOverlayVisible" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Install instructions"
    >
      <div className={`iosModalCard ${animate ? "iosModalCardVisible" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="iosModalGlow" />
        <div className="iosModalIcon">{"\u{1F4F2}"}</div>
        <h2 className="iosModalTitle">Install TriggerMap</h2>
        <p className="iosModalBody">Make this feel like an app on your phone.</p>
        <ol className="iosModalSteps">
          <li>
            <span className="iosModalStepIcon">{"\u2B06\uFE0F"}</span>
            <span>Tap the <strong>Share</strong> icon in Safari</span>
          </li>
          <li>
            <span className="iosModalStepIcon">{"\u{1F447}"}</span>
            <span>Scroll down in the share sheet</span>
          </li>
          <li>
            <span className="iosModalStepIcon">{"\u2795"}</span>
            <span>Tap <strong>\u201CAdd to Home Screen\u201D</strong></span>
          </li>
        </ol>
        <button className="iosModalClose" type="button" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
