/**
 * Deep-sanitize user-facing text: strip em dashes, en dashes → " - ".
 * Applied at the API response boundary to catch all sources.
 */

function sanitizeString(str) {
  return str
    .replace(/\u2014/g, " - ")   // em dash
    .replace(/\u2013/g, " - ");  // en dash
}

export function sanitizeDeep(obj) {
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeDeep);
  if (obj !== null && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeDeep(v);
    }
    return out;
  }
  return obj;
}
