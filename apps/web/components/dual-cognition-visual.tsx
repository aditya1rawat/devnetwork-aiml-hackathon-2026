const PRIMARY_STEPS = [
  "read worker-3 heap timeline",
  "correlate queue_depth spike",
  "isolate leak in batch flush",
];

const SHADOW_STEPS = [
  "read worker-3 heap timeline",
  "correlate queue_depth spike",
  "isolate leak in batch flush",
];

export function DualCognitionVisual() {
  return (
    <div className="w-full max-w-[560px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-9 items-center gap-3 border-b border-[var(--color-border)] px-4">
        <span className="inline-block h-2 w-2 bg-[var(--color-fg)]" style={{ boxShadow: "0 0 8px var(--color-fg)" }} aria-hidden />
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg)]">
          investigating
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-dim)]">
          · incident worker-oom
        </span>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-warn)]">
          gateway · direct
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
        <CognitionColumn label="primary" model="Claude" steps={PRIMARY_STEPS} active />
        <CognitionColumn label="shadow" model="Nemotron" steps={SHADOW_STEPS} />
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
            agreement
          </span>
          <span className="font-mono tnum text-[11px] text-[var(--color-fg)]">0.94</span>
        </div>
        <div className="mt-2 h-1 w-full bg-[var(--color-surface-2)]">
          <div className="h-full bg-[var(--color-fg)]" style={{ width: "94%" }} />
        </div>
      </div>
    </div>
  );
}

function CognitionColumn({
  label,
  model,
  steps,
  active = false,
}: {
  label: string;
  model: string;
  steps: string[];
  active?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--color-fg-dim)]">
          {label}
        </span>
        <span
          className="font-display text-[14px] font-normal"
          style={{ color: active ? "var(--color-fg)" : "var(--color-fg-muted)" }}
        >
          {model}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[5px] inline-block h-[5px] w-[5px] shrink-0"
              style={{ background: active ? "var(--color-fg)" : "var(--color-fg-dim)" }}
            />
            <span className="font-mono text-[10.5px] leading-[1.45] text-[var(--color-fg-muted)]">
              {s}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 pt-0.5">
          <span aria-hidden className="inline-block h-[5px] w-[5px] shrink-0 animate-pulse bg-[var(--color-fg-dim)]" />
          <span className="font-mono text-[10.5px] italic text-[var(--color-fg-dim)]">reasoning…</span>
        </li>
      </ul>
    </div>
  );
}
