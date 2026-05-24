import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-8 py-5">
        <Link href="/" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
          argus
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/incidents" className="font-mono-meta text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            incidents
          </Link>
          <span className="font-mono-meta text-[var(--color-fg-dim)]">devnetwork ai+ml · 2026</span>
        </nav>
      </header>

      <section className="flex flex-1 items-center px-8 py-16">
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-16 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div className="space-y-10">
            <p className="font-mono-label text-[var(--color-primary)]">autonomous on-call SRE</p>

            <h1 className="font-display text-[clamp(48px,7vw,88px)] font-extralight leading-[0.98] text-[var(--color-fg)]">
              Two cognitions.
              <br />
              <span className="text-[var(--color-fg-muted)]">Zero context loss.</span>
              <br />
              <span className="font-serif-display text-[var(--color-primary)]">Survive the chaos.</span>
            </h1>

            <p className="max-w-[58ch] text-[19px] leading-[1.55] font-light text-[var(--color-fg-muted)]">
              Highly-available web servers run on <em className="font-serif-display text-[var(--color-fg)]">N</em> machines. Argus brings the same idea to agents. Claude and Nemotron investigate every incident in lockstep through TrueFoundry’s gateway. When one degrades, the other takes over with zero context loss.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/incidents"
                className="group inline-flex items-center gap-2.5 rounded-lg bg-[var(--color-primary)] px-5 py-3 text-[14px] font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90"
              >
                Browse incidents
                <span className="font-mono-meta text-[var(--color-bg)]/70">launch a scenario</span>
                <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-7">
            <div className="grid grid-cols-2 gap-x-6 gap-y-7">
              <Stat label="primary" value="Claude" tone="primary" detail="TrueFoundry Gateway" />
              <Stat label="shadow" value="Nemotron" tone="shadow" detail="Crusoe Inference" />
              <Stat label="orchestrator" value="Hono" detail=":7200 · SSE" />
              <Stat label="cluster" value="FastAPI" detail=":7100 · chaos" />
            </div>
            <hr className="my-7 border-[var(--color-border)]" />
            <p className="font-light leading-[1.55] text-[14px] text-[var(--color-fg-muted)]">
              Kill a provider. Sever the gateway. <span className="font-serif-display italic text-[var(--color-fg)]">Watch the shadow keep thinking.</span>
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "primary" | "shadow" }) {
  const color =
    tone === "primary" ? "var(--color-primary)" : tone === "shadow" ? "var(--color-shadow-prov)" : "var(--color-fg)";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono-label text-[var(--color-fg-dim)]">{label}</span>
      <span className="text-[20px] font-light tracking-tight" style={{ color }}>{value}</span>
      <span className="font-mono-meta text-[var(--color-fg-muted)]">{detail}</span>
    </div>
  );
}
