import { Component } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { captureMobileError } from "@/services/crashService";
import { palette } from "@/utils/theme";

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error, errorInfo) {
    captureMobileError(error, { errorInfo });
    this.setState({ componentStack: errorInfo?.componentStack || null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView contentContainerStyle={styles.wrap}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>Restart the screen and try again.</Text>
          {this.state.errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Error:</Text>
              <Text style={styles.errorText} selectable>{this.state.errorMessage}</Text>
            </View>
          ) : null}
          {this.state.componentStack ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Component stack:</Text>
              <Text style={styles.errorText} selectable numberOfLines={15}>{this.state.componentStack}</Text>
            </View>
          ) : null}
          <PrimaryButton label="Try again" onPress={() => this.setState({ hasError: false, errorMessage: null, componentStack: null })} />
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    backgroundColor: palette.background,
    justifyContent: "center",
    padding: 24,
    gap: 14,
  },
  title: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "700",
  },
  body: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,107,122,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,107,122,0.25)",
    gap: 4,
  },
  errorLabel: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  errorText: {
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "monospace",
  },
});