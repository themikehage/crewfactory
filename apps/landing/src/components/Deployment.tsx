const DEPLOY_MD = "https://github.com/themikehage/crewfactory/blob/main/DEPLOY.md";
const GHCR = "https://github.com/themikehage/crewfactory/pkgs/container/crewfactory";

const options = [
  {
    id: "coolify",
    name: "Coolify",
    badge: "Recommended",
    description: "Self-hosted PaaS. Point to the repo, set 3 env vars, deploy.",
    steps: [
      "New project → Deploy from Git",
      "URL: github.com/themikehage/crewfactory",
      "Build pack: Docker Compose",
      "Set JWT_SECRET, AUTH_USERNAME, AUTH_PASSWORD_HASH",
      "Deploy",
    ],
    href: "https://coolify.io",
  },
  {
    id: "dokploy",
    name: "Dokploy",
    badge: null,
    description: "Open-source Heroku alternative. Docker Compose native support.",
    steps: [
      "Applications → New Application",
      "Paste docker-compose.yml content",
      "Set env vars",
      "Deploy",
    ],
    href: "https://dokploy.com",
  },
  {
    id: "docker",
    name: "Docker Compose",
    badge: null,
    description: "Manual deploy on any Linux server with Docker installed.",
    steps: [
      "git clone github.com/themikehage/crewfactory",
      "cp .env.example .env",
      "nano .env  # fill in variables",
      "docker compose up -d",
    ],
    href: DEPLOY_MD,
  },
];

export default function Deployment() {
  return (
    <section
      id="deployment"
      style={{
        padding: "6rem 1.5rem",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
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
          Deployment
        </p>
        <h2
          style={{
            fontSize: "clamp(1.8rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "1rem",
          }}
        >
          Deploy in minutes, not hours
        </h2>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "16px",
          }}
        >
          Three env vars. That's all you need.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
          marginBottom: "3rem",
        }}
      >
        {options.map((opt) => (
          <DeployCard key={opt.id} {...opt} />
        ))}
      </div>

      {/* Docker pull command */}
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          padding: "1.5rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "6px" }}>
            Pre-built image on GitHub Container Registry
          </p>
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "14px",
              color: "var(--color-accent)",
            }}
          >
            ghcr.io/themikehage/crewfactory:latest
          </code>
        </div>
        <a
          href={GHCR}
          target="_blank"
          rel="noopener noreferrer"
          id="cta-ghcr"
          style={{
            padding: "10px 20px",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: "8px",
            color: "var(--color-accent)",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(74,222,128,0.14)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(74,222,128,0.08)")}
        >
          View on GHCR →
        </a>
      </div>
    </section>
  );
}

function DeployCard({
  id,
  name,
  badge,
  description,
  steps,
  href,
}: {
  id: string;
  name: string;
  badge: string | null;
  description: string;
  steps: string[];
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      id={`deploy-${id}`}
      style={{
        display: "block",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        padding: "1.75rem",
        textDecoration: "none",
        transition: "border-color 0.2s, background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(74,222,128,0.3)";
        (e.currentTarget as HTMLElement).style.background = "var(--color-surface-2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
        (e.currentTarget as HTMLElement).style.background = "var(--color-surface)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>
          {name}
        </h3>
        {badge && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#000",
              background: "var(--color-accent)",
              padding: "2px 8px",
              borderRadius: "100px",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
        {description}
      </p>
      <ol style={{ paddingLeft: "1.25rem" }}>
        {steps.map((s, i) => (
          <li
            key={i}
            style={{
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              marginBottom: "4px",
              lineHeight: 1.6,
            }}
          >
            {s}
          </li>
        ))}
      </ol>
    </a>
  );
}
