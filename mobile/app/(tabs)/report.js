import { Component } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WeeklyReportScreen } from "@/screens/WeeklyReportScreen";
import { palette } from "@/utils/theme";

class ReportErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Insights unavailable</Text>
          <Text style={styles.body}>Something went wrong loading your report.</Text>
          <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function ReportTab() {
  return (
    <ReportErrorBoundary>
      <WeeklyReportScreen />
    </ReportErrorBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.background, justifyContent: "center", padding: 24, gap: 14 },
  title: { color: palette.text, fontSize: 22, fontWeight: "700" },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  btn: { marginTop: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: palette.accentStrong, alignItems: "center" },
  btnText: { color: palette.text, fontSize: 15, fontWeight: "700" },
});