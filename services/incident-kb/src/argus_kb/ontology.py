"""Entity ontology for the incident knowledge graph.

graphiti-core takes plain Pydantic BaseModel subclasses via the
entity_types={...} parameter of add_episode(). Field descriptions guide the
LLM extractor toward typed nodes instead of free-form entities.
"""
from pydantic import BaseModel, Field


class IncidentEntity(BaseModel):
    """A single past incident."""

    incident_id: str = Field(description="Unique incident id (e.g. worker-oom-mpk90sdf)")
    title: str = Field(description="Short title")
    severity: str = Field(description="sev1 | sev2 | sev3")
    failed_over: str = Field(description="'true' if a primary failover occurred")
    resolved_at: str = Field(description="ISO-8601 resolution timestamp")


class ServiceEntity(BaseModel):
    """A service in the cluster."""

    name: str = Field(description="Service name: worker | db_proxy | auth | gateway | api")


class RootCauseEntity(BaseModel):
    """A root cause category and summary."""

    category: str = Field(
        description="memleak | slow_query | cpu_saturation | config_drift | auth_failure | network_partition"
    )
    summary: str = Field(description="One-sentence root cause")


class RemediationEntity(BaseModel):
    """A remediation action taken or recommended."""

    action: str = Field(description="restart | scale | config_change | rollback | failover | other")
    target: str = Field(description="Service affected")


ENTITY_TYPES = {
    "Incident": IncidentEntity,
    "Service": ServiceEntity,
    "RootCause": RootCauseEntity,
    "Remediation": RemediationEntity,
}
