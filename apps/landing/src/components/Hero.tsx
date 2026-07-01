const GITHUB_URL = "https://github.com/themikehage/crewfactory";
const DEPLOY_URL = "https://github.com/themikehage/crewfactory/blob/main/DEPLOY.md";

export default function Hero() {
  return (
    <section
      id="hero"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "6rem 1.5rem 4rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(74,222,128,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: "800px" }}>
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: "100px",
            marginBottom: "2rem",
            fontSize: "13px",
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--color-accent)",
              display: "inline-block",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          Open Source · MIT License · Powered by Qwen
        </div>

        <h1
          style={{
            fontSize: "clamp(2.5rem, 7vw, 5rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: "1.5rem",
            color: "var(--color-text-primary)",
          }}
        >
          The{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Multi-Agent
          </span>{" "}
          <br />
          Development Platform
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.7,
            maxWidth: "600px",
            margin: "0 auto 3rem",
          }}
        >
          Create, orchestrate, and optimize AI agents in your browser. Self-hosted,
          open-source, and deployable in one click. Powered by Qwen.
        </p>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href={DEPLOY_URL}
            target="_blank"
            rel="noopener noreferrer"
            id="cta-deploy"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "14px 28px",
              background: "var(--color-accent)",
              color: "#000",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "15px",
              textDecoration: "none",
              transition: "opacity 0.2s, transform 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "0.9";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Deploy in one click
          </a>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            id="cta-github"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "14px 28px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
              borderRadius: "8px",
              fontWeight: 500,
              fontSize: "15px",
              textDecoration: "none",
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(74,222,128,0.4)";
              (e.currentTarget as HTMLElement).style.background = "rgba(74,222,128,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* Terminal preview */}
        <div
          style={{
            marginTop: "4rem",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "12px",
            padding: "20px 24px",
            textAlign: "left",
            maxWidth: "560px",
            margin: "4rem auto 0",
          }}
        >
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
              <div key={c} style={{ width: "12px", height: "12px", borderRadius: "50%", background: c }} />
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 2 }}>
            <span style={{ color: "var(--color-text-muted)" }}>$ </span>
            <span style={{ color: "var(--color-accent)" }}>cp</span>{" "}
            <span style={{ color: "var(--color-text-primary)" }}>.env.example .env</span>
            <br />
            <span style={{ color: "var(--color-text-muted)" }}>$ </span>
            <span style={{ color: "var(--color-accent)" }}>docker</span>{" "}
            <span style={{ color: "var(--color-text-primary)" }}>compose up -d</span>
            <br />
            <span style={{ color: "var(--color-text-muted)" }}>✓ </span>
            <span style={{ color: "var(--color-accent)" }}>CrewFactory running on</span>{" "}
            <span style={{ color: "var(--color-text-primary)" }}>http://localhost:3000</span>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}
