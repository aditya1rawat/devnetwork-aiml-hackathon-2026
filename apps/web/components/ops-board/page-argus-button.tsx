"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startScenario } from "@/lib/api";

export function PageArgusButton({ scenario }: { scenario: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || paging;

  function onClick() {
    if (busy) return;
    setError(null);
    setPaging(true);
    startTransition(async () => {
      try {
        const { id } = await startScenario(scenario);
        router.push(`/incident/${id}`);
      } catch (e) {
        setPaging(false);
        const message = e instanceof Error ? e.message : "unable to page argus";
        setError(message);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy || undefined}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "paging…" : "page argus"}
      </button>
      {error ? (
        <span
          role="alert"
          className="font-mono-meta text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-danger)]"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
