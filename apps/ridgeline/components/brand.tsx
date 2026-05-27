import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: "Overview", href: "/" },
  { label: "Pipelines", href: "/jobs" },
  { label: "Queries", href: "/query" },
  { label: "Connections", href: "/connections" },
  { label: "Deploys", href: "/deploys" },
];

export function BrandChrome({
  surfaceLabel,
  degraded = false,
  children,
}: {
  surfaceLabel?: string;
  degraded?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ridgeline-shell">
      <RidgelineTokens />
      <nav className="ridgeline-nav">
        <Link href="/" className="ridgeline-wordmark" aria-label="Ridgeline">
          <span className="ridgeline-glyph" aria-hidden />
          <span className="ridgeline-wordmark-text">
            <span>Ridgeline</span>
            <span className="ridgeline-wordmark-accent" aria-hidden>
              .
            </span>
          </span>
        </Link>
        <ul className="ridgeline-nav-items">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <div className="ridgeline-nav-auth">
          <Link href="/login" tabIndex={-1}>
            <BrandButton variant="ghost">LOG IN</BrandButton>
          </Link>
          <BrandButton variant="primary" tabIndex={-1}>
            SIGN UP
          </BrandButton>
        </div>
      </nav>
      <div className="ridgeline-status" data-degraded={degraded || undefined}>
        <span className="ridgeline-status-dot" aria-hidden />
        <span className="ridgeline-status-text">
          <span className="ridgeline-status-label">
            STATUS:&nbsp;{degraded ? "DEGRADED" : "OPERATIONAL"}
          </span>
          {surfaceLabel ? (
            <>
              <span className="ridgeline-status-sep">·</span>
              <span className="ridgeline-status-surface">{surfaceLabel.toUpperCase()}</span>
            </>
          ) : null}
        </span>
        <span className="ridgeline-status-meta">RIDGELINE&nbsp;OPS&nbsp;·&nbsp;us-east-2</span>
      </div>
      <main className="ridgeline-main">{children}</main>
    </div>
  );
}

type BrandButtonVariant = "primary" | "ghost";

export function BrandButton({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BrandButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "ridgeline-btn",
        variant === "primary" ? "ridgeline-btn--primary" : "ridgeline-btn--ghost",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function RidgelineTokens() {
  return <style>{RIDGELINE_CSS}</style>;
}

const RIDGELINE_CSS = `
.ridgeline-shell {
  --brand-bg: oklch(0.100 0.008 45);
  --brand-surface: oklch(0.140 0.010 45);
  --brand-surface-2: oklch(0.180 0.012 45);
  --brand-border: oklch(0.260 0.012 45);
  --brand-border-strong: oklch(0.420 0.014 45);
  --brand-fg: oklch(0.960 0.006 80);
  --brand-fg-muted: oklch(0.700 0.010 60);
  --brand-fg-dim: oklch(0.520 0.012 50);
  --brand-accent: oklch(0.780 0.200 142);
  --brand-accent-strong: oklch(0.840 0.200 142);
  --brand-accent-soft: oklch(0.420 0.140 142);
  --brand-accent-fg: oklch(0.120 0.010 45);
  --brand-danger: oklch(0.600 0.180 25);
  --brand-success: oklch(0.780 0.200 142);

  --brand-font-display: var(--font-display), ui-monospace, monospace;
  --brand-font-mono: var(--font-geist-mono), ui-monospace, monospace;

  position: relative;
  min-height: 100vh;
  width: 100%;
  background: var(--brand-bg);
  color: var(--brand-fg);
  font-family: var(--brand-font-mono);
  font-feature-settings: "tnum";
  isolation: isolate;
}

.ridgeline-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent 63px,
    var(--brand-border) 63px,
    var(--brand-border) 64px
  );
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

.ridgeline-shell > * {
  position: relative;
  z-index: 1;
}

.ridgeline-nav {
  display: flex;
  align-items: center;
  gap: 32px;
  height: 56px;
  padding: 0 28px;
  border-bottom: 1px solid var(--brand-border);
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--brand-bg) 92%, var(--brand-surface) 8%),
    var(--brand-bg)
  );
}

.ridgeline-wordmark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--brand-fg);
  font-family: var(--brand-font-display);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.015em;
  user-select: none;
}

.ridgeline-glyph {
  width: 14px;
  height: 14px;
  background: linear-gradient(to right, var(--brand-accent) 50%, transparent 50%);
  border: 1px solid var(--brand-accent);
  flex-shrink: 0;
  image-rendering: pixelated;
}

.ridgeline-wordmark-text {
  display: inline-flex;
  gap: 0;
  line-height: 1;
}

.ridgeline-wordmark-accent {
  color: var(--brand-accent);
}

.ridgeline-nav-items {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ridgeline-nav-items a {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  color: var(--brand-fg-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  transition: color 120ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ridgeline-nav-items a:hover {
  color: var(--brand-fg);
}

.ridgeline-nav-auth {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ridgeline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--brand-fg);
  font-family: var(--brand-font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 140ms cubic-bezier(0.22, 1, 0.36, 1),
    color 140ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  border-radius: 0;
}

.ridgeline-btn:focus-visible {
  outline: 1px solid var(--brand-accent);
  outline-offset: 2px;
}

.ridgeline-btn--primary {
  background: var(--brand-accent);
  color: var(--brand-accent-fg);
}

.ridgeline-btn--primary:hover {
  background: var(--brand-accent-strong);
}

.ridgeline-btn--ghost {
  border-color: var(--brand-border-strong);
  color: var(--brand-fg);
}

.ridgeline-btn--ghost:hover {
  border-color: var(--brand-fg);
}

.ridgeline-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ridgeline-status {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 28px;
  padding: 0 28px;
  border-bottom: 1px solid var(--brand-border);
  background: var(--brand-surface);
  font-family: var(--brand-font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brand-fg-muted);
}

.ridgeline-status-dot {
  width: 8px;
  height: 8px;
  background: var(--brand-success);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--brand-success) 60%, transparent);
}

.ridgeline-status[data-degraded] .ridgeline-status-dot {
  background: var(--brand-danger);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--brand-danger) 60%, transparent);
}

.ridgeline-status-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ridgeline-status-label {
  color: var(--brand-fg);
}

.ridgeline-status-sep {
  color: var(--brand-fg-dim);
}

.ridgeline-status-surface {
  color: var(--brand-accent);
}

.ridgeline-status[data-degraded] .ridgeline-status-surface {
  color: var(--brand-danger);
}

.ridgeline-status-meta {
  margin-left: auto;
  color: var(--brand-fg-dim);
}

.ridgeline-main {
  padding: 32px 28px 64px;
}

@media (max-width: 720px) {
  .ridgeline-nav {
    gap: 16px;
    padding: 0 16px;
  }
  .ridgeline-nav-items {
    display: none;
  }
  .ridgeline-status {
    padding: 0 16px;
  }
  .ridgeline-main {
    padding: 24px 16px 48px;
  }
}
`;
