import enableCors from "@/lib/cors.js";
import { requireInternalAuth } from "@/lib/internalAuth.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { backfillAuthToDevices } from "@/services/dataMigration.js";

// One-time bulk recovery: copy every authenticated user's data onto each device
// they signed in on (userId → deviceId). Idempotent — safe to re-run. Triggered
// from the ops console or via curl with the X-Internal-Key header.
//   curl -X POST $BACKEND/api/internal/control/migrate-auth-devices \
//        -H "X-Internal-Key: $INTERNAL_API_KEY" -H "Content-Type: application/json" -d '{}'
export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }
  if (!requireInternalAuth(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;
    const summary = await backfillAuthToDevices({ limit });
    return sendSuccess(res, summary);
  } catch (error) {
    return sendError(res, 500, "MIGRATE_FAILED", error?.message || "Migration failed");
  }
}
