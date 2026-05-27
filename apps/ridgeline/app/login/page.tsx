"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrandChrome, BrandButton } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

type Phase = "idle" | "signing" | "failed";

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };

const AUTH_FAULT = {
  scenario: "auth-5xx",
  service: "auth",
  symptom: "Logins failing, 503 rate climbing on auth",
} as const;

export default function LoginPage() {
  const { raise } = useFault();
  const [phase, setPhase] = useState<Phase>("idle");
  const raised = useRef(false);

  useEffect(() => {
    if (isPresetFault() && !raised.current) {
      raised.current = true;
      setPhase("failed");
      raise(AUTH_FAULT);
    }
  }, [raise]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (phase === "signing") return;
    setPhase("signing");
    window.setTimeout(() => {
      setPhase("failed");
      if (!raised.current) {
        raised.current = true;
        raise(AUTH_FAULT);
      }
    }, 700);
  }

  const failed = phase === "failed";

  return (
    <BrandChrome surfaceLabel="Sign In" degraded={failed}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
          maxWidth: 380,
          margin: "48px auto 0",
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: "var(--brand-font-display)",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--brand-fg)",
          }}
        >
          Ridgeline<span style={{ color: "var(--brand-accent)" }}>.</span>
        </div>

        {failed ? (
          <div
            role="alert"
            style={{
              width: "100%",
              border: "1px solid var(--brand-danger)",
              background: "color-mix(in oklch, var(--brand-danger) 18%, var(--brand-bg))",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              ...mono,
              fontSize: 12,
              color: "var(--brand-fg)",
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.16em",
                padding: "2px 6px",
                border: "1px solid var(--brand-danger)",
                color: "var(--brand-danger)",
              }}
            >
              5XX
            </span>
            <span style={{ color: "var(--brand-fg-muted)" }}>chaos: 5xx injected path=/verify</span>
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}
        >
          <Field label="Email" type="email" defaultValue="ops@ridgeline.io" />
          <Field label="Password" type="password" defaultValue="hunter2-demo" />
          <button
            type="submit"
            disabled={phase === "signing"}
            style={{
              height: 40,
              border: failed ? "1px solid var(--brand-danger)" : "1px solid transparent",
              background: failed
                ? "color-mix(in oklch, var(--brand-danger) 70%, var(--brand-bg))"
                : "var(--brand-accent)",
              color: failed ? "var(--brand-fg)" : "var(--brand-accent-fg)",
              ...mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: phase === "signing" ? "wait" : "pointer",
              borderRadius: 0,
              transition: "background 160ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {phase === "signing" ? "Signing in…" : failed ? "Sign in failed · 503" : "Sign in"}
          </button>
        </form>

        {failed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <p
              style={{
                ...mono,
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--brand-fg-muted)",
                margin: 0,
              }}
            >
              Auth service is failing 48% of verify calls
            </p>
            <BrandButton variant="ghost" onClick={onSubmit}>
              Retry
            </BrandButton>
          </div>
        ) : (
          <p
            style={{
              ...mono,
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "var(--brand-fg-dim)",
              margin: 0,
            }}
          >
            Sign in to the Ridgeline console.
          </p>
        )}
      </div>
    </BrandChrome>
  );
}

function Field({ label, type, defaultValue }: { label: string; type: string; defaultValue: string }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        ...mono,
        fontSize: 10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--brand-fg-dim)",
      }}
    >
      {label}
      <input
        type={type}
        defaultValue={defaultValue}
        style={{
          height: 38,
          padding: "0 12px",
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border-strong)",
          color: "var(--brand-fg)",
          ...mono,
          fontSize: 13,
          letterSpacing: 0,
          textTransform: "none",
          borderRadius: 0,
        }}
      />
    </label>
  );
}
