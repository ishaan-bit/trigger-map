import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";

export function LoginScreen() {
  const router = useRouter();
  const { signInWithEmail, registerWithEmail, signInWithGoogle } = useAppSession();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function configureGoogleSignIn() {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    });
  }

  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  async function submit() {
    try {
      setLoading(true);
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
      router.replace("/(tabs)/timeline");
    } catch (error) {
      Alert.alert("Authentication error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      // Re-configure every time to ensure fresh state after sign-out
      configureGoogleSignIn();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error("Google login did not return an ID token");
      }
      await signInWithGoogle(idToken);
      router.replace("/(tabs)/timeline");
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (error.code === statusCodes.IN_PROGRESS) return;
      }
      Alert.alert("Google sign-in error", error.message);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.brand}>QuietDen</Text>
        <Text style={styles.kicker}>{mode === "login" ? "Welcome back" : "Get started"}</Text>
        <Text style={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</Text>
        <Text style={styles.subtitle}>Sign in to sync your data and unlock deeper insights.</Text>
      </View>

      {mode === "register" ? (
        <TextInput
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={palette.muted}
          style={styles.input}
          value={name}
        />
      ) : null}

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={palette.muted}
        style={styles.input}
        value={email}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={palette.muted}
        secureTextEntry
        style={styles.input}
        value={password}
      />

      <PrimaryButton label={loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} onPress={submit} />
      <PrimaryButton label="Continue with Google" onPress={handleGoogle} secondary />
      <PrimaryButton
        label={mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        onPress={() => setMode(mode === "login" ? "register" : "login")}
        secondary
      />

      <View style={styles.divider} />

      <PrimaryButton
        label="Continue anonymously"
        onPress={() => router.replace("/(tabs)/log")}
        secondary
      />
      <Text style={styles.anonHint}>No account needed. Your data stays on this device.</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginTop: 12,
  },
  brand: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  kicker: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: palette.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
    color: palette.text,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  noticeBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
    padding: 14,
  },
  noticeText: {
    color: palette.muted,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: palette.glassBorder,
    marginVertical: 4,
  },
  anonHint: {
    color: palette.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});