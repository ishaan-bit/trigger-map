/**
 * One-time script: fix garbled phi3 words in stored mode narratives.
 */
import "dotenv/config";
import { redis } from "../services/redisClient.js";

const garbleMap = [
  [/\boverwhinely\b/gi, "overwhelmed"],
  [/\boverwhselming\b/gi, "overwhelming"],
  [/\boverwhinishing\b/gi, "overwhelming"],
  [/\boverwhinished\b/gi, "overwhelmed"],
  [/\boverwhelmfully\b/gi, "overwhelmingly"],
  [/\boverwhfully\b/gi, "overwhelmingly"],
  [/\boverwh[a-z]*ly\b/gi, "overwhelmingly"],
  [/\bexercuries\b/gi, "exercises"],
  [/\bstayring\b/gi, "staying"],
  [/\blet'gedo\b/gi, "let's"],
  [/\bit'in\b/gi, "it's"],
  [/\bit'selfthey\b/gi, "it's okay, they"],
  [/\btryptophan'increasing\b/gi, "tryptophan, increasing"],
  [/\blife' endless\b/gi, "life's endless"],
  [/\bIt'd\b/g, "It would"],
  [/\bt'these\b/gi, "these"],
  [/\b[a-z]'[a-z]{4,}\b/gi, (m) => m.replace(/'/, "")],
];

let fixed = 0;
for (const mode of ["move", "fuel", "perspective"]) {
  const scan = await redis(["SCAN", "0", "MATCH", `triggermap:mode_output:*:${mode}`, "COUNT", "100"]);
  for (const k of scan[1] || []) {
    const raw = await redis(["GET", k]);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    let n = parsed.narrative || "";
    for (const [pattern, fix] of garbleMap) {
      n = n.replace(pattern, fix);
    }
    // Strip markdown artifacts, control chars, excess whitespace
    const cleaned = n
      .replace(/\*\*/g, "")
      .replace(/#{1,3}\s+/g, "")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .replace(/[\u200b-\u200f\ufeff]/g, "")
      .replace(/ {2,}/g, " ")
      .trim();

    if (cleaned !== (parsed.narrative || "")) {
      parsed.narrative = cleaned;
      await redis(["SET", k, JSON.stringify(parsed)]);
      const uid = k.split(":")[2].slice(0, 8);
      console.log(`Fixed ${mode} for ${uid}`);
      fixed++;
    }
  }
}
console.log(`\nTotal fixed: ${fixed}`);
process.exit(0);
