export default function OfflinePage() {
  return (
    <main className="shell" style={{ minHeight: "80vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 12 }}>
      <span style={{ fontSize: 56 }}>🌙</span>
      <h1 style={{ margin: 0 }}>You&apos;re offline</h1>
      <p className="muted" style={{ maxWidth: 320 }}>
        TriggerMap needs a connection to sync. Your logged moments are safe — reopen the app once you&apos;re back online.
      </p>
    </main>
  );
}
