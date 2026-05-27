"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandButton } from "@/components/distress/brand";
import { startScenario } from "@/lib/api";

export function DistressTrigger({ scenario }: { scenario: string }) {
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
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <BrandButton
        variant="primary"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {busy ? "PAGING…" : "PAGE ARGUS"}
      </BrandButton>
      {error ? (
        <span
          role="alert"
          style={{
            fontFamily: "var(--brand-font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--brand-danger)",
          }}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
