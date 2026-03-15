import { Component } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { captureMobileError } from "@/services/crashService";
import { palette } from "@/utils/theme";

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    captureMobileError(error, { errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>Restart the screen and try again.</Text>
          <PrimaryButton label="Try again" onPress={() => this.setState({ hasError: false })} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
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
});