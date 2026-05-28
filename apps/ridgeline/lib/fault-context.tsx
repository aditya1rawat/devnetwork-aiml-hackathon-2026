"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface Fault {
  scenario: string;
  service: string;
  symptom: string;
}

interface FaultState {
  faults: Fault[];
  raise: (fault: Fault) => void;
  dismiss: (scenario: string) => void;
  clear: () => void;
}

const FaultCtx = createContext<FaultState | null>(null);

export function FaultProvider({ children }: { children: ReactNode }) {
  const [faults, setFaults] = useState<Fault[]>([]);

  // Append, deduped by scenario — re-raising the same incident (e.g. on page
  // remount) is a no-op, so toasts stack one-per-scenario.
  // Brief beat (1.2s) between the fault appearing on the product surface and
  // Argus reacting: lets the operator process the error before AI swoops in,
  // making the staging feel less canned.
  const raise = useCallback((fault: Fault) => {
    setTimeout(() => {
      setFaults((prev) => (prev.some((f) => f.scenario === fault.scenario) ? prev : [...prev, fault]));
    }, 1200);
  }, []);

  const dismiss = useCallback((scenario: string) => {
    setFaults((prev) => prev.filter((f) => f.scenario !== scenario));
  }, []);

  const clear = useCallback(() => setFaults([]), []);

  return <FaultCtx.Provider value={{ faults, raise, dismiss, clear }}>{children}</FaultCtx.Provider>;
}

export function useFault(): FaultState {
  const ctx = useContext(FaultCtx);
  if (!ctx) throw new Error("useFault must be used within FaultProvider");
  return ctx;
}
