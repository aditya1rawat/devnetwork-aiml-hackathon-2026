import asyncio
import time
from argus_cluster.common import chaos, state


def setup_function():
    state.init("test", time.time())


def test_inject_and_clear_latency():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=10, params={"mean_ms": 1}))
    assert chaos._active("latency") is not None
    chaos.clear()
    assert chaos._active("latency") is None


def test_latency_applies_under_one_second():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=10, params={"mean_ms": 100}))
    start = time.time()
    asyncio.run(chaos.apply("/x"))
    elapsed = time.time() - start
    assert 0.04 < elapsed < 0.30
    chaos.clear()


def test_expired_chaos_self_clears():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=0.05, params={"mean_ms": 1000}))
    time.sleep(0.06)
    assert chaos._active("latency") is None
