"use client";
import { useEffect, useMemo, useState } from "react";
import { killProvider, restoreProvider, getOrchestratorState, resetKB } from "@/lib/api";
import type { StreamEvent } from "@/lib/types";

type ProviderName = "claude" | "nemotron";

interface PanelState {
  claudeKilled: boolean;
  claudeReason: "live" | "chaos" | "failover";
  nemoKilled: boolean;
  nemoReason: "live" | "chaos" | "failover";
}

const INITIAL: PanelState = {
  claudeKilled: false,
  claudeReason: "live",
  nemoKilled: false,
  nemoReason: "live",
};

export function ChaosPanel({ events }: { events: StreamEvent[] }) {
  const [hydrated, setHydrated] = useState<PanelState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function onResetKB() {
    setResetting(true);
    try {
      await resetKB();
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  }

  useEffect(() => {
    let alive = true;
    getOrchestratorState()
      .then((s) => {
        if (!alive) return;
        setHydrated({
          claudeKilled: s.providers.claude.killed,
          claudeReason: s.providers.claude.killed ? "chaos" : "live",
          nemoKilled: s.providers.nemotron.killed,
          nemoReason: s.providers.nemotron.killed ? "chaos" : "live",
        });
      })
      .catch(() => {
        if (alive) setHydrated(INITIAL);
      });
    return () => {
      alive = false;
    };
  }, []);

  const state = useMemo<PanelState>(() => {
    const base = hydrated ?? INITIAL;
    const next: PanelState = { ...base };
    for (const e of events) {
      if (e.type === "provider_state") {
        const d = e.data as { provider?: ProviderName; killed?: boolean; reason?: string };
        if (d.provider === "claude") {
          next.claudeKilled = !!d.killed;
          next.claudeReason = !d.killed
            ? "live"
            : d.reason === "failover"
              ? "failover"
              : "chaos";
        } else if (d.provider === "nemotron") {
          next.nemoKilled = !!d.killed;
          next.nemoReason = !d.killed
            ? "live"
            : d.reason === "failover"
              ? "failover"
              : "chaos";
        }
      }
    }
    return next;
  }, [events, hydrated]);

  async function onToggleProvider(p: ProviderName, currentlyKilled: boolean) {
    setPending(p);
    try {
      if (currentlyKilled) await restoreProvider(p);
      else await killProvider(p);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      <div className="flex items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
        <span className="font-mono-label text-[var(--color-fg-dim)]">chaos controls</span>
        <span className="font-serif-display text-[15px] italic text-[var(--color-fg-muted)]">
          inject failures, watch it survive
        </span>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-3">
        <ChaosButton
          label="Claude"
          killed={state.claudeKilled}
          reason={state.claudeReason}
          accent="var(--color-primary)"
          pending={pending === "claude"}
          onToggle={() => onToggleProvider("claude", state.claudeKilled)}
        />
        <ChaosButton
          label="Nemotron"
          killed={state.nemoKilled}
          reason={state.nemoReason}
          accent="var(--color-shadow-prov)"
          pending={pending === "nemotron"}
          onToggle={() => onToggleProvider("nemotron", state.nemoKilled)}
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={resetting}
          className="group flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]/60 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="flex items-center gap-3.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-warn)" }} />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-light tracking-tight text-[var(--color-fg)]">Knowledge base</span>
              <span className="font-mono-label text-[var(--color-fg-dim)]">{resetting ? "resetting…" : "stored cases"}</span>
            </div>
          </div>
          <span
            className="rounded-md px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
            style={{ background: "var(--color-warn-soft)", color: "var(--color-warn)" }}
          >
            reset
          </span>
        </button>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80" onClick={() => setConfirming(false)}>
          <div
            className="w-[420px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-serif-display text-[20px] text-[var(--color-fg)]">Reset knowledge base?</h3>
            <p className="mb-5 text-[14px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
              Wipe all stored incidents. Re-seed manually with <code className="rounded bg-[var(--color-bg)]/60 px-1 py-0.5 font-mono text-[12px]">pnpm seed-kb</code>. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono-label text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]/60"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={onResetKB}
                disabled={resetting}
                className="rounded-md border border-[var(--color-danger)]/60 bg-[var(--color-danger-soft)] px-3 py-1.5 font-mono-label text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]/80 disabled:opacity-70"
              >
                {resetting ? "wiping…" : "wipe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ChaosButton({
  label,
  killed,
  reason,
  accent,
  pending,
  onToggle,
}: {
  label: string;
  killed: boolean;
  reason: "live" | "chaos" | "failover";
  accent: string;
  pending: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const statusLabel = killed
    ? reason === "failover"
      ? "down · failover"
      : "down"
    : "live";
  const cta = pending ? "…" : killed ? "restore" : "kill";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className="group flex items-center justify-between rounded-lg border bg-[var(--color-bg)]/60 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]/60 disabled:cursor-not-allowed disabled:opacity-70"
      style={{ borderColor: killed ? "var(--color-danger)" : "var(--color-border)" }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: killed ? "var(--color-danger)" : accent }}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-light tracking-tight text-[var(--color-fg)]">{label}</span>
          <span className="font-mono-label text-[var(--color-fg-dim)]">{statusLabel}</span>
        </div>
      </div>
      <span
        className="rounded-md px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
        style={{
          background: killed ? "var(--color-success-soft)" : "var(--color-danger-soft)",
          color: killed ? "var(--color-success)" : "var(--color-danger)",
        }}
      >
        {cta}
      </span>
    </button>
  );
}
