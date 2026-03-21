export function MicroInsight({ text }) {
  if (!text) return null;
  return (
    <div className="microInsight sceneIn">
      <span className="microInsightIcon">{"\u{1F4A1}"}</span>
      <p className="microInsightText">{text}</p>
    </div>
  );
}
