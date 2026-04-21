import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, radius } from "@/utils/theme";

const SECTIONS = [
  {
    icon: "🎯",
    title: "Log a moment",
    body: "Tap a trigger (work, partner, exercise…) to start. Then drag the emotion pad to place how you feel: left↔right = bad to good, bottom↔top = low energy to high. The label in the centre updates as you move. Add optional tags and a note before saving.",
  },
  {
    icon: "📊",
    title: "The emotion scale",
    body: "You're plotting two axes at once — not a single 1–5 number. The horizontal axis is valence (how pleasant or unpleasant it feels). The vertical axis is arousal (how much energy or activation you feel). The nine named zones (Calm, Stressed, Depleted…) are where those two axes meet.",
  },
  {
    icon: "📈",
    title: "Your baseline",
    body: "After 7+ moments the app calculates your personal average emotional state. This becomes your baseline. A shift means your mood has moved noticeably away from your norm — up or down. The app flags this as a drift so you notice the change while it's happening, not weeks later.",
  },
  {
    icon: "🗓",
    title: "Timeline",
    body: "A chronological log of every moment you've recorded. Swipe cards to edit or delete. The mood weather banner at the top summarises your emotional mix for the day. Micro-insights appear once you have 5+ moments.",
  },
  {
    icon: "💡",
    title: "Weekly insights (free)",
    body: "Available after 3 moments in a week. Shows your top emotion, top trigger, behavioural loops (trigger → emotion combos that repeat), and what's helping vs. creating friction. The confidence badge shows how much the patterns can be trusted at your current data volume.",
  },
  {
    icon: "🔮",
    title: "AI narrative (signed-in)",
    body: "A personalised paragraph written by the AI engine after analysing your week. It identifies what stood out, what may be contributing to it, and one thing to try. It regenerates each Monday based on the past 7 days.",
  },
  {
    icon: "⚡",
    title: "Actions tab",
    body: "Concrete, small suggestions tailored to your top trigger and current emotional state. Rate them as helpful or not — the engine learns and adjusts future recommendations accordingly.",
  },
  {
    icon: "🧬",
    title: "Adaptive modes (Premium)",
    body: "Three personalised activity recommendations refreshed weekly: Move (physical), Fuel (food and nourishment), and Perspective (reframing). Based on your emotional state, preferences (diet, equipment, environment), and recent patterns.",
  },
  {
    icon: "📉",
    title: "Progress & drift (Premium)",
    body: "Tracks your emotional metrics over 45 days: stability (how consistent your mood is), volatility (how much it swings), drift (how far you are from baseline), and recovery time (how quickly you bounce back from low moments).",
  },
  {
    icon: "📤",
    title: "Sharing",
    body: "From your weekly report, tap 'Share my week' to generate a 7-day link. The person who receives it sees your emotional tone for the week, top patterns, and an insight highlight — but not your raw notes or personal details.",
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
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
    maxHeight: "90%",
    paddingTop: 20,
    paddingHorizontal: 20,
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
    paddingBottom: 20,
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
