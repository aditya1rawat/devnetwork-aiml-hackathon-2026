export interface ParsedStep {
  action?: string;
  args?: Record<string, unknown>;
  rationale?: string;
  hypotheses?: string[];
  final_report_md?: string;
  raw: string;
}

export function parseStep(text: string): ParsedStep {
  if (!text) return { raw: "" };
  const trimmed = text.trim();
  try {
    const obj = JSON.parse(trimmed) as Partial<ParsedStep> & Record<string, unknown>;
    return {
      action: typeof obj.action === "string" ? obj.action : undefined,
      args: typeof obj.args === "object" && obj.args !== null ? (obj.args as Record<string, unknown>) : undefined,
      rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
      hypotheses: Array.isArray(obj.hypotheses) ? (obj.hypotheses as string[]) : undefined,
      final_report_md: typeof obj.final_report_md === "string" ? obj.final_report_md : undefined,
      raw: trimmed,
    };
  } catch {
    return { raw: trimmed };
  }
}
