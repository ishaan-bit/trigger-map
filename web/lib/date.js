/** Relative day label (Today / Yesterday / weekday + date), locale-aware. */
export function getRelativeDayLabel(timestamp, t, lang) {
  const input = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfInput = new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const diffDays = Math.round((startOfToday - startOfInput) / 86400000);

  if (diffDays === 0) return t ? t("timeline.today", "Today") : "Today";
  if (diffDays === 1) return t ? t("timeline.yesterday", "Yesterday") : "Yesterday";

  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  return input.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
}
