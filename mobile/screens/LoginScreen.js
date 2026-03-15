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
      <Text style={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</Text>
      <Text style={styles.subtitle}>Anonymous mode stays available even if you skip this.</Text>

      {mode === "register" ? (
        <TextInput
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor="#627388"
          style={styles.input}
          value={name}
        />
      ) : null}

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#627388"
        style={styles.input}
        value={email}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#627388"
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: palette.text,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 16,
  },
  subtitle: {
    color: palette.muted,
    marginBottom: 6,
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
});