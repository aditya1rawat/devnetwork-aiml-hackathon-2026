import type { AgentStep, DivergenceScore } from "./types.js";

const W_ACTION = 0.30;
const W_ARGS = 0.15; // only counts when action matches
const W_RATIONALE = 0.55;
const FLAG_THRESHOLD = 0.35;

export function compareSteps(step: number, primary: AgentStep, shadow: AgentStep): DivergenceScore {
  const actionMatch = primary.action === shadow.action;
  const argsMatch = actionMatch && stableEqual(primary.args, shadow.args);
  const rationaleCosine = jaccardCosine(primary.rationale, shadow.rationale);

  // Partial-credit agreement: parallel exploration with different tools but aligned
  // reasoning is still useful agreement, not a hard divergence.
  const agreement =
    W_ACTION * (actionMatch ? 1 : 0) +
    W_ARGS * (argsMatch ? 1 : 0) +
    W_RATIONALE * rationaleCosine;

  const actionMismatch = !actionMatch;
  const argsMismatch = actionMatch && !argsMatch;
  const flagged = agreement < FLAG_THRESHOLD;

  const summary = !actionMatch
    ? rationaleCosine >= 0.5
      ? `different tactics, aligned reasoning (cosine=${rationaleCosine.toFixed(2)})`
      : `shadow chose ${shadow.action} instead of ${primary.action}`
    : !argsMatch
      ? `same action, different args`
      : rationaleCosine < 0.4
        ? `matching action, divergent rationale (cosine=${rationaleCosine.toFixed(2)})`
        : `agreement`;

  return {
    step,
    cosine: rationaleCosine,
    actionMismatch,
    argsMismatch,
    agreement,
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

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "will",
  "have", "has", "had", "but", "not", "any", "all", "can", "may", "should",
  "could", "would", "into", "out", "its", "their", "them", "they", "then",
  "than", "what", "when", "where", "which", "who", "why", "how",
]);

function jaccardCosine(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const denom = Math.sqrt(ta.size * tb.size);
  return denom === 0 ? 0 : inter / denom;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
