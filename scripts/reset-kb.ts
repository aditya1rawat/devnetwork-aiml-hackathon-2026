#!/usr/bin/env tsx
const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";

async function main(): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/reset`, { method: "POST" });
  if (!r.ok) {
    console.error(`reset failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log("kb wiped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
