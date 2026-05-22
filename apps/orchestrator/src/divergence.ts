import type { AgentStep, DivergenceScore } from "./types.js";

export function compareSteps(step: number, primary: AgentStep, shadow: AgentStep): DivergenceScore {
  const actionMismatch = primary.action !== shadow.action;
  const argsMismatch = !actionMismatch && !stableEqual(primary.args, shadow.args);
  const rationaleCosine = jaccardCosine(primary.rationale, shadow.rationale);
  const flagged = actionMismatch || argsMismatch || rationaleCosine < 0.4;

  const summary = actionMismatch
    ? `shadow chose ${shadow.action} instead of ${primary.action}`
    : argsMismatch
      ? `same action, different args`
      : rationaleCosine < 0.4
        ? `rationale divergence (cosine=${rationaleCosine.toFixed(2)})`
        : `agreement`;

  return {
    step,
    cosine: rationaleCosine,
    actionMismatch,
    argsMismatch,
    flagged,
    summary,
  };
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortDeep);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortDeep(obj[k]);
  return out;
}

function jaccardCosine(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const denom = Math.sqrt(ta.size * tb.size);
  return denom === 0 ? 0 : inter / denom;
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}
