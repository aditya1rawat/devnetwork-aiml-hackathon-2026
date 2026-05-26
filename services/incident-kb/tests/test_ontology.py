from argus_kb.ontology import (
    IncidentEntity,
    ServiceEntity,
    RootCauseEntity,
    RemediationEntity,
    ENTITY_TYPES,
)


def test_incident_entity_required_fields():
    e = IncidentEntity(
        incident_id="worker-oom-abc",
        title="Worker OOM",
        severity="sev2",
        failed_over="false",
        resolved_at="2026-05-25T10:00:00Z",
    )
    assert e.incident_id == "worker-oom-abc"
    assert e.severity == "sev2"


def test_service_entity_minimal():
    e = ServiceEntity(service_name="worker")
    assert e.service_name == "worker"


def test_root_cause_entity():
    e = RootCauseEntity(category="memleak", description="Worker heap leaks 120MB/tick.")
    assert e.category == "memleak"


def test_remediation_entity():
    e = RemediationEntity(action="restart", target="worker")
    assert e.action == "restart"


def test_entity_types_registry():
    assert "Incident" in ENTITY_TYPES
    assert "Service" in ENTITY_TYPES
    assert "RootCause" in ENTITY_TYPES
    assert "Remediation" in ENTITY_TYPES
