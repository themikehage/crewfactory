const steps = [
  {
    number: "01",
    title: "Configure Providers",
    description:
      "Add your API keys for Claude, GPT, or Qwen in the settings panel. The provider registry auto-discovers new models.",
    detail: "ANTHROPIC_API_KEY / OPENAI_API_KEY / DASHSCOPE_API_KEY",
  },
  {
    number: "02",
    title: "Create Your Agents",
    description:
      "Define agents with custom names, system prompts, model selection, and tool access. Save them as reusable configurations.",
    detail: "Custom prompts · Tool access · Per-agent model selection",
  },
  {
    number: "03",
    title: "Delegate & Orchestrate",
    description:
      "Open a channel, assign agents, and let them collaborate. Watch streaming responses in real time as they complete your tasks.",
    detail: "Real-time streaming · Parallel execution · Live preview",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "6rem 1.5rem",
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              letterSpacing: "0.15em",
              color: "var(--color-accent)",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            How it works
          </p>
          <h2
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.75rem)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            From setup to production in 3 steps
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "2rem",
                padding: "2.5rem 0",
                borderBottom: i < steps.length - 1 ? "1px solid var(--color-border)" : "none",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  background: "rgba(74,222,128,0.06)",
                  border: "1px solid rgba(74,222,128,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--color-accent)",
                  letterSpacing: "0.05em",
                }}
              >
                {step.number}
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: "15px",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.7,
                    marginBottom: "12px",
                  }}
                >
                  {step.description}
                </p>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {step.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
