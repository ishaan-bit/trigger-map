export function getRelativeDayLabel(timestamp) {
  const input = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfInput = new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const diffDays = Math.round((startOfToday - startOfInput) / 86400000);

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }

  return input.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}