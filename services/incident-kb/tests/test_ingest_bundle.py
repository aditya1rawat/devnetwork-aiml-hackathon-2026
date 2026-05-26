import pytest

from argus_kb.ingest import IncidentBundle, build_episode_body, validate_bundle


def test_incident_bundle_parses_minimum():
    b = IncidentBundle(
        incident_id="worker-oom-abc",
        title="Worker OOM",
        report_md="# RC\nleak",
        scenario="worker-oom",
        failed_over=False,
        severity="sev2",
        resolved_at="2026-05-25T10:00:00Z",
        services_touched=["worker", "api"],
        tool_log_digest="search_logs→worker leak detected",
    )
    assert b.incident_id == "worker-oom-abc"
    assert b.severity == "sev2"


def test_build_episode_body_includes_metadata():
    b = IncidentBundle(
        incident_id="x",
        title="t",
        report_md="body md",
        scenario="db-saturation",
        failed_over=True,
        severity="sev1",
        resolved_at="2026-05-25T10:00:00Z",
        services_touched=["db_proxy"],
        tool_log_digest="query_metrics→slow",
    )
    body = build_episode_body(b)
    assert "body md" in body
    assert "sev1" in body
    assert "failed_over=true" in body
    assert "services_touched=db_proxy" in body
    assert "scenario=db-saturation" in body


def test_validate_bundle_rejects_unknown_severity():
    with pytest.raises(ValueError, match="severity"):
        validate_bundle(
            IncidentBundle(
                incident_id="x",
                title="t",
                report_md="md",
                scenario=None,
                failed_over=False,
                severity="sev9",
                resolved_at="2026-05-25T10:00:00Z",
                services_touched=[],
                tool_log_digest="",
            )
        )
