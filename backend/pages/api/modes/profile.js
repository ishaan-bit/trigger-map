import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getModeProfile, storeModeProfile } from "@/services/modeStore.js";
import { captureServerError } from "@/services/monitoringService.js";

const VALID_ENVIRONMENTS = ["indoor", "outdoor", "office", "travel"];
const VALID_EQUIPMENT = ["none", "minimal", "gym"];
const VALID_DIETS = ["vegetarian", "vegan", "nonVeg", "glutenFree"];
const VALID_CUISINES = ["indian", "universal", "japanese", "mediterranean"];
const VALID_INTENSITIES = ["low", "moderate", "high"];

/**
 * GET /api/modes/profile — fetch user's mode preferences
 * PUT /api/modes/profile — update mode preferences
 *
 * Premium-only endpoint.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    if (!user) {
      return sendError(res, 401, "AUTH_REQUIRED", "Sign in to access mode profile");
    }

    const ownerId = user.id;

    if (req.method === "GET") {
      const profile = await getModeProfile(ownerId);
      return sendSuccess(res, { profile: profile || {} });
    }

    if (req.method === "PUT") {
      const { environment, equipment, diet, cuisine, intensityPref } = req.body || {};

      // Validate optional fields
      if (environment && !VALID_ENVIRONMENTS.includes(environment)) {
        return sendError(res, 400, "INVALID_ENVIRONMENT", `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
      }
      if (equipment && !VALID_EQUIPMENT.includes(equipment)) {
        return sendError(res, 400, "INVALID_EQUIPMENT", `equipment must be one of: ${VALID_EQUIPMENT.join(", ")}`);
      }
      if (diet && !VALID_DIETS.includes(diet)) {
        return sendError(res, 400, "INVALID_DIET", `diet must be one of: ${VALID_DIETS.join(", ")}`);
      }
      if (cuisine && !VALID_CUISINES.includes(cuisine)) {
        return sendError(res, 400, "INVALID_CUISINE", `cuisine must be one of: ${VALID_CUISINES.join(", ")}`);
      }
      if (intensityPref && !VALID_INTENSITIES.includes(intensityPref)) {
        return sendError(res, 400, "INVALID_INTENSITY", `intensityPref must be one of: ${VALID_INTENSITIES.join(", ")}`);
      }

      const existing = (await getModeProfile(ownerId)) || {};
      const updated = {
        ...existing,
        ...(environment !== undefined ? { environment } : {}),
        ...(equipment !== undefined ? { equipment } : {}),
        ...(diet !== undefined ? { diet } : {}),
        ...(cuisine !== undefined ? { cuisine } : {}),
        ...(intensityPref !== undefined ? { intensityPref } : {}),
      };

      const profile = await storeModeProfile(ownerId, updated);
      return sendSuccess(res, { profile });
    }

    return sendError(res, 405, "METHOD_NOT_ALLOWED", "GET or PUT only");
  } catch (error) {
    captureServerError(error, { path: "/api/modes/profile" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
