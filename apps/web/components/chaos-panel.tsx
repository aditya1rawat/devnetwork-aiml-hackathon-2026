"use client";
import { useState } from "react";
import { killProvider, restoreProvider, severGateway, restoreGateway } from "@/lib/api";

export function ChaosPanel() {
  const [claudeDead, setClaudeDead] = useState(false);
  const [nemoDead, setNemoDead] = useState(false);
  const [gatewayDead, setGatewayDead] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Chaos panel</div>
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${claudeDead ? "bg-emerald-700 text-white" : "bg-rose-700 text-white hover:bg-rose-600"}`}
          onClick={async () => {
            if (claudeDead) { await restoreProvider("claude"); setClaudeDead(false); }
            else { await killProvider("claude"); setClaudeDead(true); }
          }}
        >
          {claudeDead ? "Restore Claude" : "Kill Claude"}
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${nemoDead ? "bg-emerald-700 text-white" : "bg-rose-700 text-white hover:bg-rose-600"}`}
          onClick={async () => {
            if (nemoDead) { await restoreProvider("nemotron"); setNemoDead(false); }
            else { await killProvider("nemotron"); setNemoDead(true); }
          }}
        >
          {nemoDead ? "Restore Nemotron" : "Kill Nemotron"}
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${gatewayDead ? "bg-emerald-700 text-white" : "bg-amber-700 text-white hover:bg-amber-600"}`}
          onClick={async () => {
            if (gatewayDead) { await restoreGateway(); setGatewayDead(false); }
            else { await severGateway(); setGatewayDead(true); }
          }}
        >
          {gatewayDead ? "Restore Gateway" : "Sever Gateway"}
        </button>
      </div>
    </div>
  );
}
