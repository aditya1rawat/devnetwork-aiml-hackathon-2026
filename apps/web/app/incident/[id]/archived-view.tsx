"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { StoredIncidentReport } from "@/lib/api";
import { CaseGraph } from "@/components/case-graph";

/** Read-only view for incidents that exist in the KB but not in active memory.
 * Used when a user navigates to a seeded or previously-ingested incident URL.
 * No SSE, no chaos panel, no agent loop — just the stored report + case graph.
 */
export function ArchivedIncidentView({ id, report }: { id: string; report: StoredIncidentReport }) {
  const sections = useMemo(() => parseSections(report.report_md ?? ""), [report.report_md]);
  const headline = report.title ?? id;
  const resolvedLabel = formatTimestamp(report.resolved_at ?? report.valid_at);
  const servicesLabel = (report.services_touched ?? []).join(" · ");
  const isHistorical = report.provenance === "historical";
  const eyebrow = isHistorical ? "historical case · pre-argus" : "archived case";
  const narrative = isHistorical
    ? "This incident predates the Argus system — only the postmortem and entity graph survive. There is no investigation log to replay, but the case still informs new runs through the knowledge base."
    : "This case lives in the knowledge base. The investigation log is no longer in memory; only the stored report and case graph are available.";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <Topbar id={id} severity={report.severity} failedOver={report.failed_over} historical={isHistorical} />

      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 space-y-10">
        <header className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="inline-flex h-6 items-center rounded-md border border-[var(--color-border)] px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-dim)]">
              {eyebrow}
            </span>
            {report.scenario ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
                · {report.scenario}
              </span>
            ) : null}
            {resolvedLabel ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
                · resolved {resolvedLabel}
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-[36px] font-extralight tracking-tight leading-[1.1]">
            {headline}
          </h1>
          {servicesLabel ? (
            <p className="font-mono text-[12px] text-[var(--color-fg-dim)] tnum">
              services touched · {servicesLabel}
            </p>
          ) : null}
          <p className="max-w-[64ch] text-[14.5px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
            {narrative}
          </p>
        </header>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-8 sm:p-10">
          <div className="mb-7 flex items-baseline gap-4">
            <span className="inline-flex h-7 items-center rounded-md border border-[var(--color-border)] px-2 font-mono-label text-[var(--color-fg-dim)]">
              stored report
            </span>
            <h2 className="font-serif-display text-[24px] leading-none text-[var(--color-fg)]">Final Report</h2>
          </div>
          <article className="space-y-8">
            {sections.map((s, i) => (
              <Section key={i} title={s.title} body={s.body} />
            ))}
          </article>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-6">
          <header className="mb-4">
            <h3 className="font-mono-label text-[var(--color-fg-dim)]">case graph</h3>
            <p className="mt-1.5 text-[13.5px] font-light text-[var(--color-fg-muted)]">
              Entities and neighboring incidents linked through shared services, root causes, and remediations.
            </p>
          </header>
          <CaseGraph incidentId={id} height={420} />
        </section>
      </div>
    </main>
  );
}

function Topbar({ id, severity, failedOver, historical }: { id: string; severity?: string; failedOver?: boolean; historical?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-6 px-6 py-3.5">
        <div className="flex items-baseline gap-5">
          <Link href="/" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            argus
          </Link>
          <Link href="/incidents" className="font-mono-meta text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            ← incidents
          </Link>
          <h1 className="flex items-baseline gap-2 leading-none">
            <span className="font-mono-meta text-[var(--color-fg-dim)]">incident</span>
            <span className="font-mono text-[15px] tracking-tight text-[var(--color-fg)]">{id}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Pill
            label="status"
            value={historical ? "historical" : "archived"}
            valueColor="var(--color-fg-dim)"
          />
          {severity ? <Pill label="severity" value={severity} /> : null}
          {failedOver ? <Pill label="failover" value="yes" valueColor="var(--color-warn)" /> : null}
        </div>
      </div>
    </header>
  );
}

function Pill({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2.5 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">{label}</span>
      <span className="font-mono text-[12px] tnum text-[var(--color-fg)]" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </span>
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
  const content = bullet ? bullet[1]! : ordered ? ordered[1]! : line;
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
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={i++}>{text.slice(last, match.index)}</span>);
    const tok = match[0];
    if (tok.startsWith("`")) {
      parts.push(
        <code key={i++} className="rounded bg-[var(--color-bg)]/70 px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-shadow-prov)]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(
        <strong key={i++} className="font-semibold text-[var(--color-fg)]">
          {tok.slice(2, -2)}
        </strong>,
      );
    }
    last = match.index + tok.length;
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
      cur = { title: h[1]!.trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  if (cur.title || cur.body.length > 0) sections.push(cur);
  return sections.map((s) => ({ title: s.title, body: s.body.join("\n") }));
}

function formatTimestamp(ts?: string): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}
