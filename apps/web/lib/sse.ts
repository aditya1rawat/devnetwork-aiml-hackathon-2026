"use client";
import { useEffect, useRef, useState } from "react";
import type { StreamEvent, EventName } from "./types";

export function useSSE(url: string | null): StreamEvent[] {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    esRef.current = es;

    const onAny = (type: EventName) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [...prev, { type, data }]);
      } catch {
        // ignore
      }
    };

    const handlers: EventName[] = [
      "step_start", "primary_step", "shadow_step",
      "tool_call", "tool_result", "divergence", "failover",
      "gateway_mode", "incident_done",
    ];
    for (const h of handlers) es.addEventListener(h, onAny(h));

    return () => es.close();
  }, [url]);

  return events;
}
