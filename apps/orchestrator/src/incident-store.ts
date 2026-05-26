import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConductorEvent } from "./conductor.js";

/** On-disk shape for an incident, persisted after `incident_done` so the live
 * view survives an orchestrator restart. Subscriber list is intentionally not
 * persisted — it's rebuilt from new SSE connections after rehydration.
 */
export interface PersistedIncident {
  id: string;
  events: ConductorEvent[];
  done: boolean;
  startedAt: number;
  endedAt?: number;
  scenario?: string;
}

const DEFAULT_DIR = "data/incidents";

function dataDir(): string {
  return process.env.INCIDENT_STORE_DIR ?? path.resolve(process.cwd(), DEFAULT_DIR);
}

function filePath(id: string): string {
  return path.join(dataDir(), `${id}.json`);
}

export async function saveIncident(p: PersistedIncident): Promise<void> {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  // Write atomically: tmp file then rename, so a crash mid-write can't leave
  // a half-written JSON blob that fails to parse on next startup.
  const tmp = filePath(p.id) + ".tmp";
  await writeFile(tmp, JSON.stringify(p), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, filePath(p.id));
}

export async function loadAllIncidents(): Promise<PersistedIncident[]> {
  const dir = dataDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: PersistedIncident[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, name), "utf-8");
      out.push(JSON.parse(raw) as PersistedIncident);
    } catch (err) {
      console.warn(`[argus] skipping unreadable incident file ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}
