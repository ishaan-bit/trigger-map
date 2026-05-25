import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, "..", "backend");

loadEnv({ path: resolve(BACKEND_DIR, ".env") });

async function main() {
  const payload = JSON.parse(process.env.MODE_JOB_JSON || "{}");
  const modeComposerUrl = pathToFileURL(resolve(BACKEND_DIR, "ai", "modeComposer.js")).href;
  const { generateModeOutput } = await import(modeComposerUrl);
  const result = await generateModeOutput(payload);
  console.log(`__MODE_RESULT__${JSON.stringify(result)}`);
}

main().catch((err) => {
  console.error(`__MODE_ERROR__${err?.message || String(err)}`);
  process.exit(1);
});
