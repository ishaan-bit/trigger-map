import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";

/**
 * Onboarding state machine (web port of mobile/hooks/useOnboarding.js).
 *
 * Forward-only states:
 *   not_started → framing_shown → first_log_done → timeline_seen →
 *   second_log_done → insights_seen → completed
 *
 * Persisted to localStorage so it survives reloads. Also tracks progressive
 * post-onboarding nudges.
 */

const STORAGE_KEY = "triggermap.onboarding-state";
const LEGACY_KEY = "triggermap.onboarding-complete";
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
  const [nudges, setNudges] = useState({});
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && STATES.includes(raw)) {
        setState(raw);
      } else {
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy === "true") {
          setState("completed");
          window.localStorage.setItem(STORAGE_KEY, "completed");
        } else {
          setState("not_started");
        }
      }
    } catch {
      setState("not_started");
    } finally {
      setReady(true);
    }
  }, []);

  const advance = useCallback((targetState) => {
    const current = stateRef.current;
    const ci = STATE_INDEX[current] ?? -1;
    const ti = STATE_INDEX[targetState] ?? -1;
    if (ti <= ci) return;
    setState(targetState);
    stateRef.current = targetState;
    try {
      window.localStorage.setItem(STORAGE_KEY, targetState);
      if (targetState === "completed" || ti >= STATE_INDEX.framing_shown) {
        window.localStorage.setItem(LEGACY_KEY, "true");
      }
    } catch {
      // ignore persistence failure
    }
    trackEvent("onboarding_advance", { from: current, to: targetState });
  }, []);

  const skip = useCallback(() => {
    const from = stateRef.current;
    setState("completed");
    stateRef.current = "completed";
    try {
      window.localStorage.setItem(STORAGE_KEY, "completed");
      window.localStorage.setItem(LEGACY_KEY, "true");
    } catch {
      // ignore
    }
    trackEvent("onboarding_skipped", { from });
  }, []);

  const isPast = useCallback((checkpoint) => {
    return (STATE_INDEX[stateRef.current] ?? 0) >= (STATE_INDEX[checkpoint] ?? 0);
  }, []);

  const markNudgeSeen = useCallback((nudgeId) => {
    const ts = String(Date.now());
    setNudges((prev) => ({ ...prev, [nudgeId]: ts }));
    try {
      window.localStorage.setItem(`${NUDGE_PREFIX}${nudgeId}`, ts);
    } catch {
      // ignore
    }
  }, []);

  // Sync in web (localStorage), but kept awaitable for API parity with mobile.
  const isNudgeSeen = useCallback((nudgeId) => {
    if (nudges[nudgeId]) return true;
    try {
      return !!window.localStorage.getItem(`${NUDGE_PREFIX}${nudgeId}`);
    } catch {
      return false;
    }
  }, [nudges]);

  const value = useMemo(() => ({
    state,
    ready,
    advance,
    skip,
    isPast,
    markNudgeSeen,
    isNudgeSeen,
    isActive: state !== "completed" && state !== "not_started",
    isCompleted: state === "completed",
    isNotStarted: state === "not_started",
  }), [state, ready, advance, skip, isPast, markNudgeSeen, isNudgeSeen]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
