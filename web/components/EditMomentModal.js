import { useEffect, useState } from "react";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { resolveEmotion } from "../lib/emotionModel";
import { useI18n } from "../lib/i18n";

const TRIGGER_ICONS = {
  work: "🏢", social: "👥", money: "💰", family: "🏠", exercise: "🏃",
  health: "💊", sleep: "😴", partner: "💛", alone: "🧘", travel: "✈️", other: "📌",
};
const EMOTION_ICONS = { calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡" };

/**
 * EditMomentModal (web) — bottom-sheet editor with full trigger + emotion chip
 * grids and a note field. Web port of mobile/components/EditMomentModal.js.
 */
export function EditMomentModal({ visible, moment, onSave, onClose }) {
  const { t } = useI18n();
  const [trigger, setTrigger] = useState("");
  const [emotion, setEmotion] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (moment) {
      setTrigger(moment.trigger || "");
      setEmotion(resolveEmotion(moment));
      setNote(moment.note || "");
    }
  }, [moment]);

  if (!visible) return null;

  async function handleSave() {
    if (!trigger || !emotion || saving) return;
    setSaving(true);
    try {
      await onSave(moment.id, { trigger, emotion, note });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setTrigger("");
    setEmotion("");
    setNote("");
    onClose();
  }

  return (
    <div className="editModalOverlay" role="dialog" aria-modal="true">
      <button type="button" className="editModalBackdrop" aria-label="Close" onClick={handleClose} />
      <div className="editModalSheet">
        <div className="editModalHeader">
          <strong>{t("timeline.editMoment", "Edit moment")}</strong>
          <button type="button" className="editModalClose" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className="editModalBody">
          <p className="editModalLabel">{t("triggers.label", "Trigger")}</p>
          <div className="editChipGrid">
            {TRIGGERS.map((tr) => (
              <button key={tr} type="button" className={`editChip${trigger === tr ? " editChipActive" : ""}`} onClick={() => setTrigger(tr)}>
                <span className="editChipIcon">{TRIGGER_ICONS[tr] || "📌"}</span>
                <span>{t(`triggers.${tr}`, tr)}</span>
              </button>
            ))}
          </div>

          <p className="editModalLabel">{t("emotions.label", "Emotion")}</p>
          <div className="editChipGrid">
            {EMOTIONS.map((e) => (
              <button key={e} type="button" className={`editChip${emotion === e ? " editChipActive" : ""}`} onClick={() => setEmotion(e)}>
                <span className="editChipIcon">{EMOTION_ICONS[e] || "•"}</span>
                <span>{t(`emotions.${e}`, e)}</span>
              </button>
            ))}
          </div>

          <p className="editModalLabel">{t("emotion.noteLabel", "Note (optional)")}</p>
          <textarea
            className="editTextarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("emotion.notePlaceholder", "What happened right before this?")}
          />
        </div>

        <div className="editModalFooter">
          <button type="button" className="ghostButton" onClick={handleClose}>{t("common.cancel", "Cancel")}</button>
          <button type="button" className="primaryButton" disabled={!trigger || !emotion || saving} onClick={handleSave}>
            {saving ? t("emotion.saving", "Saving…") : t("common.done", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditMomentModal;
