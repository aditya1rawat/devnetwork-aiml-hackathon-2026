import Link from "next/link";

type NavKey = "dashboard" | "incidents" | null;

export function ArgusNav({ active = null }: { active?: NavKey }) {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="flex h-14 items-center gap-8 px-7">
        <Link
          href="/"
          aria-label="Argus"
          className="inline-flex select-none items-center gap-2.5 text-[var(--color-fg)]"
        >
          <span
            aria-hidden
            className="inline-block h-[14px] w-[14px] border border-[var(--color-fg)]"
            style={{
              background:
                "linear-gradient(to right, var(--color-fg) 50%, transparent 50%)",
            }}
          />
          <span className="text-[19px] font-semibold leading-none tracking-[-0.015em] font-display">
            argus<span className="text-[var(--color-fg-muted)]">.</span>
          </span>
        </Link>

        <nav>
          <ul className="m-0 flex list-none items-center gap-1 p-0">
            <NavItem href="/dashboard" label="Dashboard" active={active === "dashboard"} />
            <NavItem href="/incidents" label="Incidents" active={active === "incidents"} />
          </ul>
        </nav>

        <span className="ml-auto font-mono-label text-[var(--color-fg-dim)]">
          ARGUS&nbsp;OPS&nbsp;·&nbsp;DEVNETWORK&nbsp;2026
        </span>
      </div>
    </header>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex h-8 items-center px-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] transition-colors"
        style={{
          color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        }}
      >
        {label}
      </Link>
    </li>
  );
}
