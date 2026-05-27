"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

export interface Fault {
  scenario: string;
  service: string;
  symptom: string;
}

interface FaultState {
  fault: Fault | null;
  raise: (fault: Fault) => void;
  clear: () => void;
}

const FaultCtx = createContext<FaultState | null>(null);

export function FaultProvider({ children }: { children: ReactNode }) {
  const [fault, setFault] = useState<Fault | null>(null);
  return (
    <FaultCtx.Provider value={{ fault, raise: setFault, clear: () => setFault(null) }}>
      {children}
    </FaultCtx.Provider>
  );
}

export function useFault(): FaultState {
  const ctx = useContext(FaultCtx);
  if (!ctx) throw new Error("useFault must be used within FaultProvider");
  return ctx;
}
