/**
 * Deep-sanitize user-facing text at the API response boundary.
 * Catches dashes, encoding artifacts, garbled characters, and stray formatting.
 */

function sanitizeString(str) {
  return str
    .replace(/\u2014/g, " - ")                 // em dash
    .replace(/\u2013/g, " - ")                 // en dash
    .replace(/\u2018|\u2019/g, "'")            // smart single quotes
    .replace(/\u201c|\u201d/g, '"')            // smart double quotes
    .replace(/[\u200b-\u200f\ufeff]/g, "")     // zero-width chars
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // control chars
    .replace(/\*\*/g, "")                       // stray bold markers
    .replace(/#{1,3}\s+/g, "")                 // stray markdown headers
    .replace(/^\s*[-*•]\s+/gm, "")            // bullet markers at line start
    .replace(/\s{2,}/g, " ")                   // collapse multiple spaces
    .replace(/\n{3,}/g, "\n\n")               // collapse excess newlines
    .trim();
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
