import { useEffect } from "react";

// 15-section walkthrough — copied verbatim from mobile/components/GuideModal.js.
const SECTIONS = [
  { icon: "🎯", title: "Log a moment", body: "Tap a trigger (work, sleep, a person, exercise…) on the Log tab to start. Drag the emotion pad to place how you feel — left↔right is unpleasant to pleasant, bottom↔top is low to high energy. The label in the centre updates live. Add a few optional tags and a short note, then save. The whole thing takes under 30 seconds." },
  { icon: "⚙️", title: "Triggers", body: "Triggers are the context for your moment — what was happening when you felt this. Pick from the built-in set of life areas (work, sleep, social, exercise, partner and more). The more consistently you reach for the same trigger in similar situations, the sharper the pattern detection becomes over time." },
  { icon: "🏷", title: "Tags", body: "Tags add a second layer of context inside a trigger. After you place your emotion you'll see suggested tags relevant to what you picked (e.g. for Work: 'deadline pressure', 'good feedback'), and they adapt as you move on the pad. Tags are how the app learns whether a trigger mostly helps or hurts you — use them consistently for better insights." },
  { icon: "📝", title: "Notes", body: "A private text field you can fill in after tagging. Notes are stored on your device and never sent to any AI system or shown on shared snapshots. They are for your reference only — use them to capture context that tags can't express." },
  { icon: "📊", title: "The emotion scale", body: "You're placing two values at once — not a single 1–5 number. The horizontal axis is valence (how unpleasant or pleasant it feels). The vertical axis is arousal (how drained or activated you feel). Where the two meet, the pad names the feeling live — calm, energized, anxious, low, flat and so on — and the intensity grows as you move further from the centre." },
  { icon: "📈", title: "Your baseline", body: "After your first several moments the app calculates your personal average emotional state. This is your baseline. A drift means your mood has moved noticeably away from your norm — up or down. The app flags this while it is happening, not weeks later. Your baseline recalculates slowly as you log more, so it always reflects your true normal." },
  { icon: "🗓", title: "Timeline", body: "The second tab: a chronological log of every moment you have recorded, newest first. Tap a card to view the full details or edit it, swipe to delete. The mood-weather banner at the top summarises your emotional mix for the day, and micro-insights begin appearing once you have a handful of moments." },
  { icon: "💡", title: "Insights — Read & This week (free)", body: "The Insights tab opens on Read, with a This week view alongside it. Available after about three moments in a week, it shows your emotional tone, your top triggers, the loops that repeat (trigger → emotion combos), and what is helping vs. creating friction. A confidence badge tells you how reliable the patterns are at your current data volume." },
  { icon: "🔮", title: "AI narrative (Premium)", body: "A personalised paragraph written by the AI engine after analysing your week. It names what stood out, what may be driving it, and one concrete thing to try differently. It refreshes each week and is never the same twice. The structured stats are free; this written narrative and the deeper pattern intelligence are part of Premium." },
  { icon: "⚡", title: "For You tab", body: "The fourth Insights tab. It leads with one concrete direction to try, your levers (the trigger → emotion pairs that tend to help you), a behaviour snapshot, and how your past actions have landed. Rate suggestions helpful or not and the engine adjusts — recommendations improve noticeably after two to three weeks of feedback." },
  { icon: "🧬", title: "Adaptive modes (Premium)", body: "Inside For You, Premium unlocks three personalised modes refreshed weekly — Move (physical activity), Fuel (food and nourishment), and Perspective (a reframing approach). They're generated from your emotional state, your logged preferences (diet type, available equipment, environment), and your recent trigger patterns." },
  { icon: "📉", title: "Progress over time", body: "The Progress tab tracks emotional-health metrics across your weeks: stability (how consistent your mood is), volatility (how much it swings day to day), drift (distance from your personal baseline), and recovery time (how quickly you return to neutral after a low). Trend arrows show whether each metric is improving, and Premium deepens it with finer-grained signals as your history grows." },
  { icon: "🔔", title: "Notifications", body: "Optional reminders, all toggled in Settings → Notifications: a Daily check-in to log while it's fresh, a Weekly insights nudge when your report is ready, and Gentle nudges that encourage you when you've been away. They respect your device's settings, and you can turn each one on or off independently." },
  { icon: "📤", title: "Sharing", body: "From the Insights tab, tap 'Share my week' to generate a private link that's valid for 7 days. Whoever opens it sees your emotional tone, top patterns, and one insight highlight — but never your raw notes, full trigger names, or personal details. You can generate a fresh link at any time." },
  { icon: "🔒", title: "Your data & privacy", body: "There's no sign-in and no account to create — your moments live privately on your device. Notes never leave the device, and AI generation works from anonymised summaries rather than your raw entries. You can export everything as a JSON file, or wipe it completely from Settings → Data → Delete all, at any time." },
];

export function GuideModal({ visible, onClose }) {
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="guideSheet" role="dialog" aria-modal="true" aria-label="How TriggerMap works">
      <div className="guideHeader">
        <div>
          <strong className="guideTitle">How TriggerMap works</strong>
          <p className="guideSubtitle">A guide to every module in the app</p>
        </div>
        <button type="button" className="guideClose" onClick={onClose} aria-label="Close guide">✕</button>
      </div>
      <div className="guideBody">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="guideSection">
            <div className="guideSectionHeader">
              <span className="guideSectionIcon">{sec.icon}</span>
              <span className="guideSectionTitle">{sec.title}</span>
            </div>
            <p className="guideSectionBody">{sec.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GuideModal;
