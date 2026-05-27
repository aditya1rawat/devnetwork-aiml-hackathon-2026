"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFault, type Fault } from "@/lib/fault-context";
import { triage, startScenario, argusIncidentUrl, type Triage } from "@/lib/api";

type TriageState = { status: "loading" } | { status: "ready"; data: Triage } | { status: "error" };

export function ArgusLauncher() {
  const { faults, dismiss } = useFault();
  const [open, setOpen] = useState(true);
  const hasFault = faults.length > 0;

  // Re-open the stack whenever a new fault arrives.
  useEffect(() => {
    if (faults.length > 0) setOpen(true);
  }, [faults.length]);

  return (
    <div className="argus-ext" data-fault={hasFault || undefined}>
      <ExtStyles />
      {hasFault && open ? (
        <div className="argus-ext-stack">
          {faults.map((f) => (
            <ArgusToast key={f.scenario} fault={f} onClose={() => dismiss(f.scenario)} />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="argus-ext-launcher"
        aria-label={open ? "Argus" : "Open Argus alerts"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="argus-ext-glyph" aria-hidden />
        {faults.length > 1 ? <span className="argus-ext-count">{faults.length}</span> : null}
      </button>
    </div>
  );
}

// One alert per active fault. Owns its own triage fetch, stream timing, and
// handoff so multiple toasts run independently.
function ArgusToast({ fault, onClose }: { fault: Fault; onClose: () => void }) {
  const [tri, setTri] = useState<TriageState>({ status: "loading" });
  const [showStream, setShowStream] = useState(false);
  const [paging, startPaging] = useTransition();
  const [pageErr, setPageErr] = useState<string | null>(null);

  // Hold the "generating…" state for ~1s before the text streams in, even if
  // the triage call returns sooner.
  useEffect(() => {
    const id = window.setTimeout(() => setShowStream(true), 1000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let alive = true;
    setTri({ status: "loading" });
    triage(fault.scenario).then(
      (data) => {
        if (alive) setTri({ status: "ready", data });
      },
      () => {
        if (alive) setTri({ status: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [fault.scenario]);

  function handoff() {
    if (paging) return;
    setPageErr(null);
    startPaging(async () => {
      try {
        const { id } = await startScenario(fault.scenario);
        window.location.href = argusIncidentUrl(id);
      } catch (e) {
        setPageErr(e instanceof Error ? e.message : "unable to page argus");
      }
    });
  }

  return (
    <section className="argus-ext-toast" role="alert" aria-live="polite">
      <header className="argus-ext-head">
        <span className="argus-ext-title">
          <span className="argus-ext-mark" aria-hidden>
            ◆
          </span>
          ARGUS
          <span className="argus-ext-sub">· detected</span>
        </span>
        <button type="button" className="argus-ext-dismiss" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      </header>

      <p className="argus-ext-service">
        <span className="argus-ext-svc-name">{fault.service}</span>
        <span className="argus-ext-svc-symptom">{fault.symptom}</span>
      </p>

      <div className="argus-ext-triage">
        {tri.status === "error" ? (
          <p className="argus-ext-diagnosis">
            First-pass triage unavailable. Page Argus to begin the full investigation.
          </p>
        ) : tri.status === "ready" && showStream ? (
          <StreamedTriage data={tri.data} />
        ) : (
          <div className="argus-ext-loading">
            <span className="argus-ext-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="argus-ext-loading-label">generating…</span>
            <span className="argus-ext-bar" aria-hidden>
              <i />
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        className="argus-ext-cta"
        onClick={handoff}
        disabled={paging}
        aria-busy={paging || undefined}
      >
        {paging ? "PAGING…" : "Open investigation →"}
      </button>
      {pageErr ? <p className="argus-ext-err">{pageErr}</p> : null}
    </section>
  );
}

// Reveals `full` over roughly `durationMs`, like a streaming chat response.
function StreamedText({ full, durationMs = 700, onDone }: { full: string; durationMs?: number; onDone?: () => void }) {
  const [n, setN] = useState(0);
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  useEffect(() => {
    setN(0);
    if (!full) {
      doneCb.current?.();
      return;
    }
    const step = Math.max(8, Math.floor(durationMs / full.length));
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= full.length) {
        window.clearInterval(id);
        doneCb.current?.();
      }
    }, step);
    return () => window.clearInterval(id);
  }, [full, durationMs]);

  const done = n >= full.length;
  return (
    <>
      {full.slice(0, n)}
      {done ? null : <span className="argus-ext-caret" aria-hidden />}
    </>
  );
}

// Types out the diagnosis, then the root cause, in sequence (~1s total).
function StreamedTriage({ data }: { data: Triage }) {
  const [phase, setPhase] = useState<"diag" | "root">("diag");
  return (
    <>
      <p className="argus-ext-diagnosis">
        <StreamedText full={data.diagnosis} durationMs={900} onDone={() => setPhase("root")} />
      </p>
      {phase === "root" ? (
        <p className="argus-ext-rootcause">
          <span className="argus-ext-rc-label">ROOT CAUSE</span>
          <span className="argus-ext-rc-value">
            <StreamedText full={data.suspectedRootCause} durationMs={400} />
          </span>
        </p>
      ) : null}
    </>
  );
}

function ExtStyles() {
  return <style>{EXT_CSS}</style>;
}

const EXT_CSS = `
.argus-ext {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  font-family: var(--font-mono);
}

.argus-ext-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  width: 100%;
  max-height: 78vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px;
}

.argus-ext-launcher {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-fg);
  cursor: default;
  padding: 0;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), border-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.argus-ext-count {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-danger);
  color: var(--color-bg);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  border-radius: 9px;
}
.argus-ext-launcher:focus-visible {
  outline: 1px solid var(--color-fg-dim);
  outline-offset: 2px;
}

.argus-ext[data-fault] .argus-ext-launcher {
  border-color: var(--color-danger);
  cursor: pointer;
  animation: argus-flare 600ms cubic-bezier(0.22, 1, 0.36, 1) 1;
}
.argus-ext[data-fault] .argus-ext-launcher:hover {
  background: var(--color-surface-2);
}
.argus-ext[data-fault] .argus-ext-launcher:focus-visible {
  outline-color: var(--color-danger);
}

.argus-ext-glyph {
  width: 14px;
  height: 14px;
  background: linear-gradient(to right, var(--color-fg-dim) 50%, transparent 50%);
  border: 1px solid var(--color-fg-dim);
  transition: background 140ms, border-color 140ms;
}
.argus-ext[data-fault] .argus-ext-glyph {
  background: linear-gradient(to right, var(--color-danger) 50%, transparent 50%);
  border-color: var(--color-danger);
}

@keyframes argus-flare {
  0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--color-danger) 55%, transparent); }
  100% { box-shadow: 0 0 0 16px transparent; }
}

.argus-ext-toast {
  width: 320px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-top: 2px solid var(--color-danger);
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  transform-origin: bottom right;
  animation: argus-pop 260ms cubic-bezier(0.16, 1, 0.3, 1) 1;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
}

@keyframes argus-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: none; }
}

.argus-ext-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.argus-ext-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--color-fg);
}
.argus-ext-mark {
  color: var(--color-danger);
  font-size: 10px;
}
.argus-ext-sub {
  color: var(--color-fg-dim);
  letter-spacing: 0.12em;
  font-weight: 500;
}
.argus-ext-dismiss {
  background: none;
  border: none;
  color: var(--color-fg-dim);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  transition: color 120ms;
}
.argus-ext-dismiss:hover { color: var(--color-fg); }

.argus-ext-service {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  font-size: 11px;
}
.argus-ext-svc-name {
  color: var(--color-fg);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
}
.argus-ext-svc-symptom {
  color: var(--color-fg-muted);
  line-height: 1.4;
}

.argus-ext-triage {
  border-top: 1px solid var(--color-border);
  padding-top: 11px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 38px;
}
.argus-ext-diagnosis {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-fg);
}
.argus-ext-rootcause {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 10.5px;
}
.argus-ext-rc-label {
  color: var(--color-fg-dim);
  letter-spacing: 0.18em;
  font-weight: 600;
  flex-shrink: 0;
}
.argus-ext-rc-value {
  color: var(--color-danger);
  letter-spacing: 0.04em;
}

.argus-ext-caret {
  display: inline-block;
  width: 6px;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--color-fg-muted);
  animation: argus-caret 0.9s steps(1) infinite;
}
@keyframes argus-caret {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}

.argus-ext-loading {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.argus-ext-dots { display: inline-flex; gap: 4px; }
.argus-ext-dots i {
  width: 4px; height: 4px; background: var(--color-fg-dim);
  animation: argus-blink 1s infinite ease-in-out;
}
.argus-ext-dots i:nth-child(2) { animation-delay: 0.16s; }
.argus-ext-dots i:nth-child(3) { animation-delay: 0.32s; }
@keyframes argus-blink {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}
.argus-ext-loading-label {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.argus-ext-bar {
  position: relative;
  flex: 1 1 100%;
  height: 2px;
  background: var(--color-border);
  overflow: hidden;
}
.argus-ext-bar i {
  position: absolute;
  inset: 0;
  width: 40%;
  background: var(--color-danger);
  animation: argus-slide 1.1s infinite cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes argus-slide {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(310%); }
}

.argus-ext-cta {
  height: 34px;
  width: 100%;
  border: none;
  background: var(--color-fg);
  color: var(--color-bg);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: opacity 120ms;
}
.argus-ext-cta:hover { opacity: 0.88; }
.argus-ext-cta:disabled { opacity: 0.5; cursor: not-allowed; }

.argus-ext-err {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-danger);
}

@media (prefers-reduced-motion: reduce) {
  .argus-ext-launcher, .argus-ext-toast,
  .argus-ext-dots i, .argus-ext-bar i, .argus-ext-caret { animation: none; }
}
`;
