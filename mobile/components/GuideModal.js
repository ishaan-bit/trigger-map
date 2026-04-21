import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, radius } from "@/utils/theme";

const SECTIONS = [
  {
    icon: "🎯",
    title: "Log a moment",
    body: "Tap a trigger (work, partner, exercise…) to start. Drag the emotion pad to place how you feel — left↔right is bad to good, bottom↔top is low to high energy. The label in the centre updates live. Add optional tags and a short note before saving. The whole thing takes under 30 seconds.",
  },
  {
    icon: "⚙️",
    title: "Triggers",
    body: "Triggers are the context for your moment — what was happening when you felt this. Pick from the built-in list or create your own custom trigger in Settings → Manage triggers. The more consistently you use specific triggers, the more accurate the pattern detection becomes over time.",
  },
  {
    icon: "🏷",
    title: "Tags",
    body: "Tags add a second layer of context inside a trigger. After placing your emotion you'll see suggested tags relevant to what you selected (e.g. for Work: 'deadline pressure', 'good feedback'). Tags are how the app learns whether a trigger mostly helps or hurts you — use them consistently for better insights.",
  },
  {
    icon: "📝",
    title: "Notes",
    body: "A private text field you can fill in after tagging. Notes are stored on your device and never sent to any AI system or shown on shared snapshots. They are for your reference only. Use them to capture context that tags can't express.",
  },
  {
    icon: "📊",
    title: "The emotion scale",
    body: "You're placing two values at once — not a single 1–5 number. The horizontal axis is valence (how pleasant or unpleasant it feels). The vertical axis is arousal (how activated or drained you feel). The nine named zones — Calm, Stressed, Depleted, Excited, Tense, Serene, Melancholic, Hopeful, Neutral — are where those two axes meet.",
  },
  {
    icon: "📈",
    title: "Your baseline",
    body: "After 7+ moments the app calculates your personal average emotional state. This is your baseline. A drift means your mood has moved noticeably away from your norm — up or down. The app flags this while it is happening, not weeks later. Your baseline recalculates slowly as you log more, so it always reflects your true normal.",
  },
  {
    icon: "🗓",
    title: "Timeline",
    body: "A chronological log of every moment you have recorded. Swipe a card left to delete, tap to view the full details. The mood weather banner at the top summarises your emotional mix for the day. Micro-insights begin appearing at 5+ moments.",
  },
  {
    icon: "💡",
    title: "Weekly insights (free)",
    body: "Available after 3 moments in a week. Shows your top emotion, top trigger, behavioural loops (trigger → emotion combos that repeat), and what is helping vs. creating friction. The confidence badge tells you how statistically reliable the patterns are at your current data volume.",
  },
  {
    icon: "🔮",
    title: "AI narrative (signed-in)",
    body: "A personalised paragraph written by the AI engine after analysing your week. It names what stood out, what may be driving it, and one concrete thing to try differently. It regenerates each Monday and is never the same twice.",
  },
  {
    icon: "⚡",
    title: "Actions tab",
    body: "Concrete, small suggestions tailored to your top trigger and current emotional state. Rate each one helpful or not — the engine incorporates your ratings and adjusts future recommendations. Actions improve significantly after 2–3 weeks of feedback.",
  },
  {
    icon: "🧬",
    title: "Adaptive modes (Premium)",
    body: "Three personalised recommendations refreshed weekly — Move (physical activity), Fuel (food and nourishment), and Perspective (a reframing approach). Generated from your emotional state, logged preferences (diet type, available equipment, environment), and recent trigger patterns.",
  },
  {
    icon: "📉",
    title: "Progress over time (Premium)",
    body: "Tracks four emotional health metrics across up to 45 days: stability (how consistent your mood is), volatility (how much it swings day to day), drift (distance from your personal baseline), and recovery time (how quickly you return to neutral after a low moment). Trend arrows show whether each metric is improving.",
  },
  {
    icon: "🔔",
    title: "Notifications",
    body: "Optional check-in reminders help you log moments when they happen rather than recalling later. Set your preferred time in Settings. Notifications respect your device's Do Not Disturb settings. You can log a moment directly from the notification without opening the app fully.",
  },
  {
    icon: "📤",
    title: "Sharing",
    body: "From your weekly report, tap 'Share my week' to generate a private 7-day link valid for 7 days. The recipient sees your emotional tone, top patterns, and one insight highlight — but never your raw notes, trigger names, or personal details. You can generate a new link at any time.",
  },
  {
    icon: "🔒",
    title: "Your data",
    body: "Moments are stored locally and synced to your account only when you are signed in. Notes never leave your device. AI generation uses anonymised summaries — raw entries are never sent. You can delete all your data at any time from Settings → Delete account.",
  },
];

export function GuideModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>How TriggerMap works</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close guide">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>A guide to every module in the app</Text>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator contentContainerStyle={styles.body}>
            {SECTIONS.map((sec) => (
              <View key={sec.title} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>{sec.icon}</Text>
                  <Text style={styles.sectionTitle}>{sec.title}</Text>
                </View>
                <Text style={styles.sectionBody}>{sec.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4,7,16,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0d1424",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(120,180,255,0.12)",
    maxHeight: "92%",
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  close: {
    color: palette.textSecondary,
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: 20,
  },
  body: {
    gap: 20,
    paddingBottom: 48,
  },
  section: {
    gap: 6,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  sectionBody: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
