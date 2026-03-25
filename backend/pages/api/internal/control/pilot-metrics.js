import { requireInternalAuth } from "../../../../lib/internalAuth.js";
import enableCors from "../../../../lib/cors.js";
import { redis, redisKey } from "../../../../services/redisClient.js";
import { getWeeklyAggregates } from "../../../../services/aggregationService.js";
import { computeBaselineMetrics } from "../../../../services/baselineEngine.js";
import { computeProgressMetrics, computePilotMetrics } from "../../../../services/progressEngine.js";
import { getActionFeedback } from "../../../../services/reportStore.js";
import { getSubscription } from "../../../../services/authService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireInternalAuth(req, res)) return;

  try {
    // Get all owner IDs
    const ownersRaw = await redis(["SMEMBERS", redisKey("owners")]);
    const ownerIds = Array.isArray(ownersRaw) ? ownersRaw : [];

    const userProgressList = [];

    for (const ownerId of ownerIds) {
      try {
        const [allAggregates, actionFeedback, subscription] = await Promise.all([
          getWeeklyAggregates(ownerId, 45),
          getActionFeedback(ownerId),
          getSubscription(ownerId).catch(() => null),
        ]);

        const baselineMetrics = computeBaselineMetrics(allAggregates);
        const baselineScore = baselineMetrics?.baseline?.score ?? 3.0;

        const progress = computeProgressMetrics({
          aggregates: allAggregates,
          baselineScore,
          actionFeedback,
        });

        const totalMoments = allAggregates.reduce(
          (s, a) => s + Number(a.total || 0),
          0
        );

        userProgressList.push({
          ownerId,
          isPremium:
            subscription?.status === "active" ||
            subscription?.status === "grace_period",
          totalMoments,
          progress,
        });
      } catch {
        // Skip users that fail
      }
    }

    // Aggregate pilot metrics
    const allMetrics = computePilotMetrics(userProgressList);

    // Free vs Premium comparison
    const freeUsers = userProgressList.filter((u) => !u.isPremium);
    const premiumUsers = userProgressList.filter((u) => u.isPremium);
    const freeMetrics = computePilotMetrics(freeUsers);
    const premiumMetrics = computePilotMetrics(premiumUsers);

    return res.status(200).json({
      ok: true,
      computedAt: new Date().toISOString(),
      overall: allMetrics,
      free: freeMetrics,
      premium: premiumMetrics,
      userSummaries: userProgressList.map((u) => ({
        ownerId: u.ownerId.slice(0, 8) + "...",
        isPremium: u.isPremium,
        totalMoments: u.totalMoments,
        hasProgress: !!u.progress,
        direction: u.progress?.trajectory?.direction || null,
        weeksTracked: u.progress?.trajectory?.weeksTracked || 0,
      })),
    });
  } catch (err) {
    console.error("Pilot metrics error:", err);
    return res.status(500).json({ error: "Failed to compute pilot metrics" });
  }
}
