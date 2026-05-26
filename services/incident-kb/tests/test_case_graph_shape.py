from argus_kb.case_graph import shape_for_react_flow


def test_shape_transforms_neo4j_records_to_react_flow():
    raw_nodes = [
        {"id": "n1", "labels": ["Entity", "Incident"], "props": {"name": "worker-oom-abc", "title": "Worker OOM"}},
        {"id": "n2", "labels": ["Entity", "Service"], "props": {"name": "worker"}},
        {"id": "n3", "labels": ["Entity", "RootCause"], "props": {"name": "heap leak", "category": "memleak"}},
    ]
    raw_edges = [
        {"source": "n1", "target": "n2", "type": "INVOLVES", "props": {}},
        {"source": "n1", "target": "n3", "type": "CAUSED_BY", "props": {}},
    ]
    result = shape_for_react_flow(raw_nodes, raw_edges, focus_neo4j_id="n1")

    assert result["focus_id"] == "n1"
    assert len(result["nodes"]) == 3
    incident = next(n for n in result["nodes"] if n["id"] == "n1")
    assert incident["type"] == "incident"
    assert incident["label"] == "Worker OOM"
    assert len(result["edges"]) == 2
    assert result["edges"][0]["label"] == "involves"


def test_shape_handles_unlabeled_node():
    out = shape_for_react_flow(
        [{"id": "x", "labels": [], "props": {"name": "fallback"}}],
        [],
        focus_neo4j_id="x",
    )
    assert out["nodes"][0]["type"] == "other"
    assert out["nodes"][0]["label"] == "fallback"
