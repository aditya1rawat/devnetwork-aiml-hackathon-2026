import { IncidentClient } from "./client";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IncidentClient id={id} />;
}
