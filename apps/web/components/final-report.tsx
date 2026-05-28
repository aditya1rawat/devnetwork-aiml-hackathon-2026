"use client";
import { useMemo, useState } from "react";
import type { StreamEvent } from "@/lib/types";
import { CaseGraph } from "./case-graph";
import { RelatedCasesList } from "./related-cases-list";

export function FinalReport({ events, incidentId }: { events: StreamEvent[]; incidentId: string }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const md = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === "incident_done");
    return e ? String((e.data as { report_md?: string }).report_md ?? "") : "";
  }, [events]);

  const halted = useMemo(() => /halted|incomplete/i.test(md), [md]);

  if (!md) return null;

  const sections = parseSections(md);

  return (
    <>
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

        <section className="mt-10 border-t border-[var(--color-border)] pt-6">
          <header className="mb-4 flex items-baseline justify-between gap-4">
            <h3 className="font-mono-label text-[var(--color-fg-dim)]">knowledge graph neighborhood</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[18px] leading-none text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]/60"
                aria-label="refresh case graph"
                title="refresh"
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono-label text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]/60"
                aria-label="open case graph fullscreen"
              >
                ⛶ fullscreen
              </button>
            </div>
          </header>
          <CaseGraph key={refreshKey} incidentId={incidentId} height={360} halted={halted} />
          <RelatedCasesList events={events} />
          {halted ? (
            <p className="mt-4 font-mono-label text-[var(--color-warn)]">
              failed — not auto-saved to knowledge base
            </p>
          ) : null}
        </section>
      </section>

      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/85 backdrop-blur"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="relative h-[90vh] w-[90vw] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="absolute right-3 top-3 z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono-label text-[var(--color-fg-muted)]"
              aria-label="close fullscreen"
            >
              ✕ close
            </button>
            <CaseGraph key={refreshKey} incidentId={incidentId} height="100%" halted={halted} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  const isRootCause = /root.?cause/i.test(title);
  const blocks = parseBlocks(body);
  return (
    <div>
      {title ? (
        <h3 className="mb-3 flex items-baseline gap-3">
          <span className="font-mono-label text-[var(--color-fg-dim)]">{title}</span>
          {isRootCause ? <span className="h-px flex-1 bg-[var(--color-border)]" /> : null}
        </h3>
      ) : null}
      <div className={`max-w-[72ch] space-y-4 ${isRootCause ? "text-[18px] font-light leading-[1.55] text-[var(--color-fg)]" : "text-[15.5px] font-light leading-[1.6] text-[var(--color-fg-muted)]"}`}>
        {blocks.map((b, i) =>
          b.kind === "table" ? (
            <TableBlock key={i} headers={b.headers} rows={b.rows} />
          ) : (
            <div key={i} className="space-y-2.5">
              {b.lines.map((l, j) => renderLine(l, j))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

type Block = { kind: "lines"; lines: string[] } | { kind: "table"; headers: string[]; rows: string[][] };

function parseBlocks(body: string): Block[] {
  const raw = body.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < raw.length) {
    if (isTableRow(raw[i]!) && i + 1 < raw.length && isTableSeparator(raw[i + 1]!)) {
      const headers = splitTableRow(raw[i]!);
      i += 2;
      const rows: string[][] = [];
      while (i < raw.length && isTableRow(raw[i]!)) {
        rows.push(splitTableRow(raw[i]!));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    const lines: string[] = [];
    while (i < raw.length && !(isTableRow(raw[i]!) && i + 1 < raw.length && isTableSeparator(raw[i + 1]!))) {
      const t = raw[i]!.trim();
      if (t) lines.push(t);
      i++;
    }
    if (lines.length > 0) blocks.push({ kind: "lines", lines });
  }
  return blocks;
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.length > 2 && t.lastIndexOf("|") > 0;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && /^[|\s\-:]+$/.test(t) && t.includes("-");
}

function splitTableRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") ? t.slice(1) : t;
  const inner2 = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return inner2.split("|").map((s) => s.trim());
}

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-[var(--color-border)] px-3 py-2 text-left align-bottom font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-[var(--color-surface)]/20" : undefined}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-[var(--color-border)]/40 px-3 py-2 align-top font-light text-[var(--color-fg)]"
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
