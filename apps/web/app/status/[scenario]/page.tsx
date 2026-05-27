import Link from "next/link";
import { BrandChrome, BrandButton } from "@/components/distress/brand";
import { DistressSurface } from "@/components/distress/surfaces";
import { getScenario } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ScenarioStatusPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: scenarioId } = await params;
  const scenario = await getScenario(scenarioId);

  if (!scenario) {
    return (
      <BrandChrome surfaceLabel="not found">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 560,
            margin: "60px auto 0",
          }}
        >
          <span
            style={{
              fontFamily: "var(--brand-font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            RIDGELINE / STATUS / 404
          </span>
          <h1
            style={{
              fontFamily: "var(--brand-font-display)",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--brand-fg)",
              margin: 0,
            }}
          >
            No scenario named{" "}
            <span style={{ color: "var(--brand-danger)" }}>{scenarioId}</span>.
          </h1>
          <p
            style={{
              fontFamily: "var(--brand-font-mono)",
              fontSize: 13,
              color: "var(--brand-fg-muted)",
              margin: 0,
            }}
          >
            The Ridgeline ops board lists every live distress surface.
          </p>
          <div>
            <Link href="/status" style={{ textDecoration: "none" }}>
              <BrandButton variant="ghost">Back to ops board</BrandButton>
            </Link>
          </div>
        </div>
      </BrandChrome>
    );
  }

  return (
    <BrandChrome surfaceLabel={scenario.productLabel}>
      <DistressSurface scenario={scenario} />
    </BrandChrome>
  );
}
