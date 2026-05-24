"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function FinalReport({ events }: { events: StreamEvent[] }) {
  const md = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === "incident_done");
    return e ? String((e.data as { report_md?: string }).report_md ?? "") : "";
  }, [events]);

  if (!md) return null;

  const sections = parseSections(md);

  return (
    <section className="rounded-xl border border-[var(--color-success)]/35 bg-[var(--color-success-soft)]/15 p-8 sm:p-10">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <span className="inline-flex h-7 items-center rounded-md border border-[var(--color-success)]/55 px-2 font-mono-label text-[var(--color-success)]">
            investigation complete
          </span>
          <h2 className="font-serif-display text-[26px] leading-none text-[var(--color-fg)]">Final Report</h2>
        </div>
      </div>

      <article className="space-y-9">
        {sections.map((s, i) => (
          <Section key={i} title={s.title} body={s.body} />
        ))}
      </article>
    </section>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const isRootCause = /root.?cause/i.test(title);
  return (
    <div>
      {title ? (
        <h3 className="mb-3 flex items-baseline gap-3">
          <span className="font-mono-label text-[var(--color-fg-dim)]">{title}</span>
          {isRootCause ? <span className="h-px flex-1 bg-[var(--color-border)]" /> : null}
        </h3>
      ) : null}
      <div className={`space-y-2.5 max-w-[72ch] ${isRootCause ? "text-[18px] font-light leading-[1.55] text-[var(--color-fg)]" : "text-[15.5px] font-light leading-[1.6] text-[var(--color-fg-muted)]"}`}>
        {lines.map((line, i) => renderLine(line, i))}
      </div>
    </div>
  );
}

function renderLine(line: string, key: number) {
  const bullet = line.match(/^[-*]\s+(.*)$/);
  const ordered = line.match(/^\d+\.\s+(.*)$/);
  const content = bullet ? bullet[1] : ordered ? ordered[1] : line;
  const rendered = renderInline(content);
  if (bullet || ordered) {
    return (
      <div key={key} className="flex gap-3.5">
        <span className="mt-[10px] inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--color-fg-dim)]" />
        <p className="flex-1">{rendered}</p>
      </div>
    );
  }
  return <p key={key}>{rendered}</p>;
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(<code key={i++} className="rounded bg-[var(--color-bg)]/70 px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-shadow-prov)]">{tok.slice(1, -1)}</code>);
    } else {
      parts.push(<strong key={i++} className="font-semibold text-[var(--color-fg)]">{tok.slice(2, -2)}</strong>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return parts;
}

function parseSections(md: string): Array<{ title: string; body: string }> {
  const lines = md.split("\n");
  const sections: Array<{ title: string; body: string[] }> = [];
  let cur: { title: string; body: string[] } = { title: "", body: [] };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      if (cur.title || cur.body.length > 0) sections.push(cur);
      cur = { title: h[1].trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  if (cur.title || cur.body.length > 0) sections.push(cur);
  return sections.map((s) => ({ title: s.title, body: s.body.join("\n") }));
}
