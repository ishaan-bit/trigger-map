import { useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithEmail, registerWithEmail } = useSession();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      router.push("/timeline");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title={mode === "login" ? "Sign in" : "Create account"}>
      <section className="card stack loginCard">
        <p className="sectionKicker">{mode === "login" ? "Welcome back" : "Get started"}</p>
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        <p className="muted">Sign in to sync your data and unlock deeper insights.</p>

        <form className="stack" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" minLength={8} required />
          </label>
          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error ? <p className="feedback feedbackPanel" style={{ padding: "12px 16px", borderRadius: 12 }}>{error}</p> : null}

        <button
          className="ghostButton"
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>

        <div className="loginDivider" />

        <button className="ghostButton" type="button" onClick={() => router.push("/")}>
          Continue anonymously
        </button>
        <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>
          Anonymous mode uses a device ID. Sign in to sync across devices and unlock weekly insights.
        </p>
      </section>
    </Layout>
  );
}
