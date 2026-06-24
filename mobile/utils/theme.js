export const palette = {
  background: "#060a12",
  surface: "#0d1424",
  elevated: "#141e32",
  border: "rgba(148, 180, 224, 0.10)",
  borderLight: "rgba(148, 180, 224, 0.16)",
  text: "#edf2fa",
  textSecondary: "#dfe8f2",
  muted: "#b8c8d8",
  accent: "#56d0e0",
  accentSoft: "rgba(86, 208, 224, 0.22)",
  accentMedium: "rgba(86, 208, 224, 0.30)",
  accentStrong: "#2e93a8",
  accentGlow: "rgba(86, 208, 224, 0.35)",
  success: "#5ee6a0",
  successSoft: "rgba(94, 230, 160, 0.20)",
  warning: "#ffb347",
  warningSoft: "rgba(255, 179, 71, 0.22)",
  danger: "#ff6b7a",
  dangerSoft: "rgba(255, 107, 122, 0.22)",
  purple: "#a78bfa",
  purpleSoft: "rgba(167, 139, 250, 0.22)",
  cardGlow: "rgba(86, 208, 224, 0.12)",
  glass: "rgba(13, 20, 36, 0.94)",
  glassBorder: "rgba(148, 180, 224, 0.18)",
  card: "rgba(13, 20, 36, 0.96)",
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
};

/** Height of the bottom tab bar (matches tabOptions) */
export const TAB_BAR_HEIGHT = 72;

export const type = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  kicker: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
};

/**
 * Motion design tokens — a single source of truth for animation so the whole
 * app moves with one consistent rhythm. Durations in ms.
 */
export const motion = {
  duration: {
    instant: 120,
    fast: 220,
    base: 360,
    slow: 560,
    count: 900,    // number count-up
    breath: 4000,  // ambient loops
  },
  stagger: 70,     // delay between sequential list items
  // Reanimated spring presets
  spring: {
    soft: { damping: 18, stiffness: 160, mass: 0.9 },
    snappy: { damping: 16, stiffness: 320, mass: 0.7 },
    bouncy: { damping: 11, stiffness: 200, mass: 0.8 },
  },
  press: { scale: 0.96 },
};

/** Soft, layered shadow presets for elevated surfaces. */
export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glow: (color = palette.accent) => ({
    shadowColor: color,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  }),
};