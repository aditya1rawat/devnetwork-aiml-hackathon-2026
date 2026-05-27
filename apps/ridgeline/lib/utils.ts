export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}

// True when the surface was opened pre-triggered (e.g. Argus "inspect" deep-link).
// Read inside an effect, never during render, to avoid SSR/hydration mismatch.
export function isPresetFault(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("fault");
}
