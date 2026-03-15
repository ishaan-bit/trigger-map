import { useState } from "react";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { Layout } from "../components/Layout";
import { logMoment } from "../lib/api";

export default function HomePage() {
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <Layout title="Log a moment">
      <section className="gridHero">
        <article className="card cardFeature stack">
          <p className="sectionKicker">Quick capture</p>
          <h2>Log what happened before the feeling fades.</h2>
          <p className="muted">Each entry updates your timeline and feeds the weekly pattern report.</p>
          <div className="pillRow">
            <span className="pill">🔒 Anonymous</span>
            <span className="pill">📊 Pattern engine</span>
            <span className="pill">📱 PWA</span>
          </div>
        </article>

        <article className="card stack">
          <label>
            Trigger
            <select value={trigger} onChange={(event) => setTrigger(event.target.value)}>
              {TRIGGERS.map((entry) => <option key={entry}>{entry}</option>)}
            </select>
          </label>
          <label>
            Emotion
            <select value={emotion} onChange={(event) => setEmotion(event.target.value)}>
              {EMOTIONS.map((entry) => <option key={entry}>{entry}</option>)}
            </select>
          </label>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="What happened right before this?" />
          </label>
          <button
            className="primaryButton"
            disabled={loading}
            onClick={async () => {
              try {
                setLoading(true);
                const response = await logMoment({ trigger, emotion, note, notes: note });
                setMessage(response.patternFeedback || response.smartReflectionPrompt || "Moment saved.");
                setNote("");
              } catch (error) {
                setMessage(error.message || "Unable to save data. Check connection.");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Saving..." : "Save moment"}
          </button>
          {message ? <p className="feedback feedbackPanel">{message}</p> : null}
        </article>
      </section>
    </Layout>
  );
}