import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";

/**
 * StreakOrb — shows the user's consecutive-day logging streak as a
 * glowing orb that grows with intensity. Inspired by serious-game
 * "chain" mechanics — don't break the chain.
 */
export function StreakOrb({ moments }) {
  const streak = computeStreak(moments);
  const { t } = useLanguage();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (streak >= 2) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [streak, pulseAnim]);

  // Silence as signal: a returning user whose streak lapsed should not see the
  // orb silently vanish. If they have history, show a gentle "paused" state that
  // acknowledges the break and invites a restart — instead of nothing.
  if (streak < 1) {
    if (!moments?.length) return null; // genuinely new user — nothing to acknowledge yet
    const best = computeBestStreak(moments);
    return (
      <View style={[styles.wrap, styles.pausedWrap]}>
        <View style={styles.content}>
          <Text style={styles.fire}>🌙</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.count, { color: palette.muted }]}>{t("streak.pausedTitle")}</Text>
            <Text style={styles.sub}>
              {best >= 2 ? t("streak.pausedBest", { count: best }) : t("streak.pausedBody")}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Lower static floor so the un-pulsing spark tier (streak 1) reads as a soft
  // glow rather than a flat grey disc clipped in the corner.
  const orbOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.5] });
  const orbScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const tier = streak >= 14 ? "legendary" : streak >= 7 ? "strong" : streak >= 3 ? "building" : "spark";
  const tierMeta = TIER_MAP[tier];

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, {
        backgroundColor: tierMeta.color,
        opacity: orbOpacity,
        transform: [{ scale: orbScale }],
      }]} />
      <View style={styles.content}>
        <Text style={styles.fire}>{tierMeta.icon}</Text>
        <View>
          <Text style={[styles.count, { color: tierMeta.color }]}>{t("streak.dayStreak", { count: streak })}</Text>
          <Text style={styles.sub}>{t("streak." + tier)}</Text>
        </View>
      </View>
    </View>
  );
}

const TIER_MAP = {
  spark:     { icon: "🕯️", color: "#9eb0c9", message: "A spark lit. Keep it going." },
  building:  { icon: "🔥", color: "#ffb347", message: "Building momentum." },
  strong:    { icon: "🔥", color: "#ff6b7a", message: "Strong habit forming." },
  legendary: { icon: "✦",  color: "#a78bfa", message: "Legendary awareness streak." },
};

function computeStreak(moments) {
  if (!moments?.length) return 0;

  // Get unique dates (local) from moments, sorted descending
  const dateSet = new Set();
  for (const m of moments) {
    dateSet.add(new Date(m.timestamp).toDateString());
  }
  const dates = [...dateSet]
    .map((d) => new Date(d))
    .sort((a, b) => b - a);

  if (dates.length === 0) return 0;

  // Check if today or yesterday is in the set (streak must include today or yesterday)
  const today = new Date();
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (dates[0].toDateString() !== todayStr && dates[0].toDateString() !== yesterdayStr) {
    return 0;
  }

  // Count consecutive days backwards
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i - 1] - dates[i]) / 86_400_000;
    if (Math.round(diff) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Longest consecutive-day run ever, ignoring whether it includes today —
// used to acknowledge a lapsed user's best run in the paused state.
function computeBestStreak(moments) {
  if (!moments?.length) return 0;
  const dates = [...new Set(moments.map((m) => new Date(m.timestamp).toDateString()))]
    .map((d) => new Date(d))
    .sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((dates[i] - dates[i - 1]) / 86_400_000);
    if (diff === 1) {
      run++;
      if (run > best) best = run;
    } else if (diff > 1) {
      run = 1;
    }
  }
  return best;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: "rgba(13, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    position: "relative",
  },
  pausedWrap: {
    backgroundColor: "rgba(13, 20, 36, 0.6)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  glow: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fire: {
    fontSize: 24,
  },
  count: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  sub: {
    color: palette.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
});
