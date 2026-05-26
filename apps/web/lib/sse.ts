"use client";
import { useEffect, useState } from "react";
import type { StreamEvent, EventName } from "./types";

interface Stream {
  es: EventSource;
  events: StreamEvent[];
  subs: Set<(evts: StreamEvent[]) => void>;
  closed: boolean;
  refs: number;
}

const streams = new Map<string, Stream>();

function getStream(url: string): Stream {
  const cached = streams.get(url);
  if (cached) {
    cached.refs += 1;
    return cached;
  }
  const es = new EventSource(url);
  const stream: Stream = { es, events: [], subs: new Set(), closed: false, refs: 1 };
  streams.set(url, stream);

  const handlers: EventName[] = [
    "step_start", "primary_step", "shadow_step",
    "tool_call", "tool_result", "divergence", "failover",
    "gateway_mode", "provider_state",
    "kb_lookup_started", "kb_lookup_result", "kb_ingest_queued",
    "incident_done",
  ];
  for (const h of handlers) {
    es.addEventListener(h, (e: MessageEvent) => {
      if (stream.closed) return;
      try {
        const data = JSON.parse(e.data);
        stream.events = [...stream.events, { type: h, data }];
        for (const fn of stream.subs) fn(stream.events);
        if (h === "incident_done") {
          stream.closed = true;
          es.close();
        }
      } catch {
        // ignore
      }
    });
  }
  return stream;
}

function releaseStream(url: string): void {
  const s = streams.get(url);
  if (!s) return;
  s.refs -= 1;
  if (s.refs <= 0) {
    s.closed = true;
    s.es.close();
    streams.delete(url);
  }
}

export function useSSE(url: string | null): StreamEvent[] {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    if (!url) return;
    const stream = getStream(url);
    setEvents(stream.events);
    const sub = (evts: StreamEvent[]) => setEvents(evts);
    stream.subs.add(sub);
    return () => {
      stream.subs.delete(sub);
      releaseStream(url);
    };
  }, [url]);

  return events;
}
