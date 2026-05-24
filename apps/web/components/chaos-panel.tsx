"use client";
import { useState } from "react";
import { killProvider, restoreProvider, severGateway, restoreGateway } from "@/lib/api";

type State = "live" | "killed";

export function ChaosPanel() {
  const [claude, setClaude] = useState<State>("live");
  const [nemo, setNemo] = useState<State>("live");
  const [gateway, setGateway] = useState<State>("live");

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      <div className="flex items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
        <span className="font-mono-label text-[var(--color-fg-dim)]">chaos controls</span>
        <span className="font-serif-display text-[15px] italic text-[var(--color-fg-muted)]">inject failures, watch it survive</span>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-3">
        <ChaosButton
          label="Claude"
          state={claude}
          accent="var(--color-primary)"
          onToggle={async () => {
            if (claude === "live") { await killProvider("claude"); setClaude("killed"); }
            else { await restoreProvider("claude"); setClaude("live"); }
          }}
        />
        <ChaosButton
          label="Nemotron"
          state={nemo}
          accent="var(--color-shadow-prov)"
          onToggle={async () => {
            if (nemo === "live") { await killProvider("nemotron"); setNemo("killed"); }
            else { await restoreProvider("nemotron"); setNemo("live"); }
          }}
        />
        <ChaosButton
          label="TFY Gateway"
          state={gateway}
          accent="var(--color-warn)"
          onToggle={async () => {
            if (gateway === "live") { await severGateway(); setGateway("killed"); }
            else { await restoreGateway(); setGateway("live"); }
          }}
        />
      </div>
    </section>
  );
}

function ChaosButton({ label, state, accent, onToggle }: { label: string; state: State; accent: string; onToggle: () => void | Promise<void> }) {
  const killed = state === "killed";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center justify-between rounded-lg border bg-[var(--color-bg)]/60 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]/60"
      style={{ borderColor: killed ? "var(--color-danger)" : "var(--color-border)" }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: killed ? "var(--color-danger)" : accent }}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-light tracking-tight text-[var(--color-fg)]">{label}</span>
          <span className="font-mono-label text-[var(--color-fg-dim)]">{killed ? "down" : "live"}</span>
        </div>
      </div>
      <span
        className="rounded-md px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
        style={{
          background: killed ? "var(--color-success-soft)" : "var(--color-danger-soft)",
          color: killed ? "var(--color-success)" : "var(--color-danger)",
        }}
      >
        {killed ? "restore" : "kill"}
      </span>
    </button>
  );
}
