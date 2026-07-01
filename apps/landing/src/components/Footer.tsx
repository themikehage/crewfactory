const GITHUB_URL = "https://github.com/themikehage/crewfactory";
const DEPLOY_MD = "https://github.com/themikehage/crewfactory/blob/main/DEPLOY.md";

export default function Footer() {
  return (
    <footer
      style={{
        padding: "2.5rem 1.5rem",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: "15px",
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            CrewFactory
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>
            MIT License · Open Source
          </span>
        </div>

        <nav style={{ display: "flex", gap: "1.5rem" }}>
          {[
            { label: "GitHub", href: GITHUB_URL },
            { label: "Deploy", href: DEPLOY_MD },
            { label: "Features", href: "#features" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
              style={{
                fontSize: "13px",
                color: "var(--color-text-muted)",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)")}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
