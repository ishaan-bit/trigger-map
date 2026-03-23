import { Component } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

export class TabErrorBoundary extends Component {
  state = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView contentContainerStyle={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>This screen ran into a problem.</Text>
          {this.state.errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText} selectable>{this.state.errorMessage}</Text>
            </View>
          ) : null}
          <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false, errorMessage: null })}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: palette.background, justifyContent: "center", padding: 24, gap: 14 },
  title: { color: palette.text, fontSize: 22, fontWeight: "700" },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  errorBox: { backgroundColor: "rgba(255,80,80,0.08)", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "rgba(255,80,80,0.15)" },
  errorText: { color: "#ff9999", fontSize: 12, fontFamily: "monospace" },
  btn: { marginTop: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: palette.accentStrong, alignItems: "center" },
  btnText: { color: palette.text, fontSize: 15, fontWeight: "700" },
});
