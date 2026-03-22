import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";
import { tap, success as hapticSuccess } from "@/utils/haptics";
import { STAGGER_DELAY } from "@/utils/designSystem";

/** Stagger-in wrapper — each child fades + slides up after a delay */
function StaggerIn({ index, children, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay: index * STAGGER_DELAY,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export function LoginScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const { signInWithEmail, registerWithEmail, signInWithGoogle } = useAppSession();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  function configureGoogleSignIn() {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    });
  }

  useEffect(() => {
    configureGoogleSignIn();
    // Subtle breathing glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, [glowAnim]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.06] });

  async function submit() {
    tap();
    try {
      setLoading(true);
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
      hapticSuccess();
      router.replace("/(tabs)/timeline");
    } catch (error) {
      Alert.alert("Authentication error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    tap();
    try {
      // Re-configure every time to ensure fresh state after sign-out
      configureGoogleSignIn();

      // Clear any residual Google session to force account chooser
      try {
        await GoogleSignin.signOut();
      } catch {
        // No previous session — safe to ignore
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error("Google login did not return an ID token");
      }
      await signInWithGoogle(idToken);
      hapticSuccess();
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
      {/* Breathing glow orb */}
      <Animated.View style={[styles.glowOrb, { opacity: glowOpacity }]} />

      {canGoBack ? (
        <Pressable style={styles.backButton} onPress={() => { tap(); router.back(); }} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.text} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      ) : null}

      <StaggerIn index={0}>
        <View style={styles.header}>
          <Text style={styles.brand}>TriggerMap</Text>
          <Text style={styles.kicker}>{mode === "login" ? "Welcome back" : "Get started"}</Text>
          <Text style={styles.title}>{mode === "login" ? "Good to see you" : "Let's begin"}</Text>
          <Text style={styles.subtitle}>
            {mode === "login"
              ? "Your emotional journey picks up right where you left off."
              : "A safe, private space to understand your emotions."}
          </Text>
        </View>
      </StaggerIn>

      {/* Trust signal */}
      <StaggerIn index={1}>
        <View style={styles.trustRow}>
          <Text style={styles.trustIcon}>🔒</Text>
          <Text style={styles.trustText}>Your data is encrypted and never shared with anyone.</Text>
        </View>
      </StaggerIn>

      <StaggerIn index={2} style={styles.inputGroup}>
        {mode === "register" ? (
          <TextInput
            accessibilityLabel="Name"
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={name}
          />
        ) : null}

        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={palette.muted}
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={palette.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
      </StaggerIn>

      <StaggerIn index={3}>
        <PrimaryButton label={loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} onPress={submit} disabled={loading} />
      </StaggerIn>
      <StaggerIn index={4}>
        <PrimaryButton label="Continue with Google" onPress={handleGoogle} outline disabled={loading} />
      </StaggerIn>
      <StaggerIn index={5}>
        <PrimaryButton
          label={mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          onPress={() => { tap(); setMode(mode === "login" ? "register" : "login"); }}
          outline
          disabled={loading}
        />
      </StaggerIn>

      <StaggerIn index={6}>
        <View style={styles.divider} />
      </StaggerIn>

      <StaggerIn index={7}>
        <PrimaryButton
          label="Continue anonymously"
          onPress={() => router.replace("/(tabs)/log")}
          outline
        />
        <View style={{ height: 10 }} />
        <Text style={styles.anonHint}>
          Anonymous mode keeps everything on your device only. Sign in to sync across devices and get personalised weekly insights.
        </Text>
      </StaggerIn>
      <StaggerIn index={8}>
        <Text style={styles.privacyHint}>
          Private by design. No tracking pixels. No data brokers. Your patterns belong to you.
        </Text>
      </StaggerIn>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
    marginTop: 4,
  },
  backLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "600",
  },
  glowOrb: {
    position: "absolute",
    top: -60,
    alignSelf: "center",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: palette.accent,
  },
  header: {
    gap: 6,
    marginTop: 12,
  },
  brand: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
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
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: palette.successSoft || "rgba(94, 230, 160, 0.08)",
    borderWidth: 1,
    borderColor: (palette.success || "#5ee6a0") + "22",
  },
  trustIcon: {
    fontSize: 14,
  },
  trustText: {
    color: palette.success || "#5ee6a0",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    lineHeight: 16,
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
  inputGroup: {
    gap: 12,
  },

  divider: {
    height: 1,
    backgroundColor: palette.glassBorder,
    marginVertical: 4,
  },
  anonHint: {
    color: palette.text,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  privacyHint: {
    color: palette.textSecondary,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 12,
  },
});