import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createContext, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trackEvent } from "@/services/analyticsService";

/**
 * Onboarding state machine.
 *
 * States flow forward only:
 *   not_started → framing_shown → first_log_done → timeline_seen →
 *   second_log_done → insights_seen → completed
 *
 * Each transition is persisted to AsyncStorage so it survives restarts.
 * The hook also tracks progressive nudges for post-onboarding guidance.
 */

const STORAGE_KEY = "triggermap.onboarding-state";
const NUDGE_PREFIX = "triggermap.nudge.";

const STATES = [
  "not_started",
  "framing_shown",
  "first_log_done",
  "timeline_seen",
  "second_log_done",
  "insights_seen",
  "completed",
];

const STATE_INDEX = Object.fromEntries(STATES.map((s, i) => [s, i]));

const OnboardingContext = createContext(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be inside OnboardingProvider");
  return ctx;
}

export function OnboardingProvider({ children }) {
  const [state, setState] = useState("completed"); // safe default — overwritten on load
  const [ready, setReady] = useState(false);
  const [nudges, setNudges] = useState({}); // { nudgeId: timestamp }
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load persisted state
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!active) return;
      if (raw && STATES.includes(raw)) {
        setState(raw);
      } else {
        // Check legacy flag — if user already completed old onboarding, mark completed
        AsyncStorage.getItem("triggermap.onboarding-complete").then((legacy) => {
          if (!active) return;
          if (legacy === "true") {
            setState("completed");
            AsyncStorage.setItem(STORAGE_KEY, "completed").catch(() => null);
          } else {
            setState("not_started");
          }
          setReady(true);
        });
        return;
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  // Advance to next state (only forward)
  const advance = useCallback((targetState) => {
    const current = stateRef.current;
    const ci = STATE_INDEX[current] ?? -1;
    const ti = STATE_INDEX[targetState] ?? -1;
    if (ti <= ci) return; // already past this state
    setState(targetState);
    stateRef.current = targetState;
    AsyncStorage.setItem(STORAGE_KEY, targetState).catch(() => null);
    // Also keep legacy flag in sync for existing code
    if (targetState === "completed" || ti >= STATE_INDEX.framing_shown) {
      AsyncStorage.setItem("triggermap.onboarding-complete", "true").catch(() => null);
    }
    trackEvent("onboarding_advance", { from: current, to: targetState });
  }, []);

  // Skip onboarding entirely
  const skip = useCallback(() => {
    setState("completed");
    stateRef.current = "completed";
    AsyncStorage.setItem(STORAGE_KEY, "completed").catch(() => null);
    AsyncStorage.setItem("triggermap.onboarding-complete", "true").catch(() => null);
    trackEvent("onboarding_skipped", { from: stateRef.current });
  }, []);

  // Check if state is at or past a given checkpoint
  const isPast = useCallback((checkpoint) => {
    return (STATE_INDEX[stateRef.current] ?? 0) >= (STATE_INDEX[checkpoint] ?? 0);
  }, []);

  // Progressive nudge helpers
  const markNudgeSeen = useCallback((nudgeId) => {
    const ts = Date.now().toString();
    setNudges((prev) => ({ ...prev, [nudgeId]: ts }));
    AsyncStorage.setItem(`${NUDGE_PREFIX}${nudgeId}`, ts).catch(() => null);
  }, []);

  const isNudgeSeen = useCallback(async (nudgeId) => {
    const cached = nudges[nudgeId];
    if (cached) return true;
    const stored = await AsyncStorage.getItem(`${NUDGE_PREFIX}${nudgeId}`);
    return !!stored;
  }, [nudges]);

  const value = useMemo(() => ({
    state,
    ready,
    advance,
    skip,
    isPast,
    markNudgeSeen,
    isNudgeSeen,
    // Convenience booleans
    isActive: state !== "completed" && state !== "not_started",
    isCompleted: state === "completed",
    isNotStarted: state === "not_started",
  }), [state, ready, advance, skip, isPast, markNudgeSeen, isNudgeSeen]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
