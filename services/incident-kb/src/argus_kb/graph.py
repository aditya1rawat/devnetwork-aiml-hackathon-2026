"""Graphiti singleton wrapper. Owns the Neo4j connection and the LLM /
embedder / reranker clients.

API notes (graphiti-core):
- Graphiti defaults all three clients to OpenAI; we override every one:
  NVIDIA NIM (or Crusoe) for extraction + reranking via the OpenAI-compatible
  generic clients, local sentence-transformers for embeddings (free, offline).
- There is no clear_data/clear_graph method on this version, so reset is
  done with a direct Cypher DETACH DELETE scoped to the group_id.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from neo4j import AsyncGraphDatabase, exceptions as neo4j_exc
from openai import AsyncOpenAI
from sentence_transformers import SentenceTransformer

from argus_kb.config import settings

log = logging.getLogger(__name__)


class _TokenBucket:
    """Async token bucket. Caps extraction calls under the provider's RPM
    limit — Graphiti serializes (max_coroutines=1) but fires calls back-to-back,
    so fast (<1.5s) calls still blow NVIDIA NIM's 40 RPM without pacing."""

    def __init__(self, rate_per_min: int) -> None:
        # Small burst capacity + empty start so requests in ANY 60s window stay
        # ~capacity+rate. Starting full would let a 35-call burst fire instantly
        # AND refill another ~35 in the same minute → ~2x the ceiling.
        self.capacity = 3.0
        self.tokens = 0.0
        self.refill_per_s = rate_per_min / 60.0
        self.updated = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.refill_per_s)
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                wait = (1 - self.tokens) / self.refill_per_s
            await asyncio.sleep(wait)


# Shared across extraction + rerank so they draw on ONE provider RPM budget.
_RATE_BUCKET = _TokenBucket(int(os.getenv("EXTRACTION_RPM_LIMIT", "30")))


def _make_openai(cfg: LLMConfig) -> AsyncOpenAI:
    # max_retries=0: the OpenAI SDK otherwise retries a 429 up to 2x WITHOUT
    # re-acquiring a bucket token, tripling real RPM past our pacing. Graphiti's
    # own tenacity layer still retries (and re-acquires), so nothing is lost.
    return AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url, max_retries=0)


class RateLimitedGenericClient(OpenAIGenericClient):
    """OpenAIGenericClient that paces every LLM call through the shared token
    bucket so a single ingest stays under the provider RPM ceiling."""

    async def _generate_response(self, *args, **kwargs):
        await _RATE_BUCKET.acquire()
        return await super()._generate_response(*args, **kwargs)


class RateLimitedReranker(OpenAIRerankerClient):
    """Routes reranker calls through the SAME bucket as extraction. The
    reranker hits the same provider and fires one call per passage; left
    unthrottled it stacks on top of extraction and trips the RPM limit, which
    fails the all-or-nothing add_episode. Sharing one budget keeps the total
    under the ceiling."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        _orig_create = self.client.chat.completions.create

        async def _limited(*a, **k):
            await _RATE_BUCKET.acquire()
            return await _orig_create(*a, **k)

        self.client.chat.completions.create = _limited  # type: ignore[method-assign]

_graphiti: Graphiti | None = None
_neo4j_driver = None
_embed_model: SentenceTransformer | None = None


def _provider_config() -> LLMConfig:
    """OpenAI-compatible config for the active extraction provider.

    Primary: Crusoe (Nemotron Nano) — generous limits, free, same model family
    as the conductor's shadow cognition. Backup: TrueFoundry gateway (Sonnet)
    if Crusoe is unreachable. NIM was previously the default but its 40 RPM
    ceiling couldn't carry Graphiti's burst pattern; removed entirely.
    """
    if settings.graphiti_llm_provider == "tfy":
        return LLMConfig(
            api_key=settings.tfy_api_key,
            model=settings.tfy_model,
            base_url=settings.tfy_gateway_url,
        )
    # default: Crusoe (Nemotron)
    return LLMConfig(
        api_key=settings.crusoe_api_key,
        model=settings.crusoe_model,
        base_url=settings.crusoe_inference_url,
    )


def _rerank_config() -> LLMConfig:
    # Reranker is search-time only and low-volume, so reuse the extraction
    # provider's model — no need for a separate cheap rerank tier.
    return _provider_config()


class LocalEmbedder(EmbedderClient):
    """sentence-transformers embedder. Runs on CPU, no network, no quota."""

    def __init__(self, model_name: str) -> None:
        global _embed_model
        if _embed_model is None:
            _embed_model = SentenceTransformer(model_name)
        self._model = _embed_model

    def _encode(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vecs]

    async def create(self, input_data):
        texts = input_data if isinstance(input_data, list) else [input_data]
        texts = [str(t) for t in texts]
        out = await asyncio.to_thread(self._encode, texts)
        return out[0]

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        texts = [str(t) for t in input_data_list]
        return await asyncio.to_thread(self._encode, texts)


async def _wait_for_neo4j(uri: str, user: str, password: str, attempts: int = 15) -> None:
    """Retry Neo4j connect with exponential backoff up to ~30 s total."""
    delay = 0.5
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
            await driver.verify_connectivity()
            await driver.close()
            return
        except neo4j_exc.ServiceUnavailable as e:
            last_err = e
            log.info("neo4j unavailable (try %d/%d), sleeping %.1fs", i + 1, attempts, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 1.6, 4.0)
    raise RuntimeError(f"neo4j did not become available: {last_err}")


async def get_graphiti() -> Graphiti:
    global _graphiti
    if _graphiti is not None:
        return _graphiti
    await _wait_for_neo4j(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)

    # Extraction LLM + reranker, both on the active OpenAI-compatible provider
    # (NIM or Crusoe). Reranker is search-time only, low volume.
    ecfg = _provider_config()
    rcfg = _rerank_config()
    llm_client = RateLimitedGenericClient(config=ecfg, client=_make_openai(ecfg))
    reranker = RateLimitedReranker(config=rcfg, client=_make_openai(rcfg))
    embedder = LocalEmbedder(settings.graphiti_embedder_model)

    _graphiti = Graphiti(
        settings.neo4j_uri,
        settings.neo4j_user,
        settings.neo4j_password,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=reranker,
        max_coroutines=1,  # serialize internal LLM calls
    )
    await _graphiti.build_indices_and_constraints()
    log.info("graphiti ready")
    return _graphiti


async def get_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _neo4j_driver


async def clear_group() -> None:
    """Delete every node/edge tagged with the active group_id."""
    driver = await get_neo4j_driver()
    async with driver.session() as session:
        await session.run(
            "MATCH (n {group_id: $gid}) DETACH DELETE n",
            gid=settings.graphiti_group_id,
        )


async def close_all() -> None:
    global _graphiti, _neo4j_driver
    if _graphiti is not None:
        await _graphiti.close()
        _graphiti = None
    if _neo4j_driver is not None:
        await _neo4j_driver.close()
        _neo4j_driver = None
