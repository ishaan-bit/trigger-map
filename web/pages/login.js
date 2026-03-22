import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

const GOOGLE_CLIENT_ID = "773449945543-us407jhg1th314nvpheg51svdb44e03b.apps.googleusercontent.com";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithEmail, registerWithEmail, signInWithGoogle } = useSession();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      width: 320,
    });
  });

  async function handleGoogleResponse(response) {
    if (!response.credential) return;
    try {
      setLoading(true);
      setError("");
      await signInWithGoogle(response.credential);
      router.push("/");
    } catch (err) {
      setError(err.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
      router.push("/");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title={mode === "login" ? "Sign in" : "Create account"}>
      <section className="card stack loginCard sceneIn">
        <div className="loginWarmth">
          <span className="loginWarmthOrb" />
          <p className="sectionKicker">{mode === "login" ? "Welcome back" : "Begin your journey"}</p>
          <h2>{mode === "login" ? "Pick up where you left off" : "Start tracking what matters"}</h2>
          <p className="loginTrust">Your emotional data is encrypted, stored securely, and never sold or shared with third parties. We built this for you, not advertisers.</p>
        </div>

        {/* Google Sign-In button */}
        <div ref={googleBtnRef} className="googleBtnWrap" />

        <div className="loginDivider"><span className="loginDividerText">or continue with email</span></div>

        <form className="stack" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" required />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" minLength={8} required />
          </label>
          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? "One moment..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error ? <p className="feedback feedbackPanel" style={{ padding: "12px 16px", borderRadius: 12 }}>{error}</p> : null}

        <button
          className="outlineButton"
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "New here? Create a free account" : "Already have an account? Sign in"}
        </button>

        <div className="loginDivider"><span className="loginDividerText" /></div>

        <button className="outlineButton" type="button" onClick={() => router.push("/")}>
          Continue without signing in
        </button>
        <p className="loginAnonymousHint">
          You can log moments anonymously with a device ID. Sign in later to sync across devices and unlock AI insights.
        </p>

        <div className="loginSafetyRow">
          <span className="loginSafetyIcon">🔐</span>
          <span className="loginSafetyText">Private by design. No tracking pixels. No data brokers. Your patterns belong to you.</span>
        </div>
      </section>
    </Layout>
  );
}
