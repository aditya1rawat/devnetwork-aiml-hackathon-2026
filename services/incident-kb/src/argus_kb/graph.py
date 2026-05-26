"""Graphiti singleton wrapper. Owns the Neo4j connection and the LLM /
embedder / reranker clients.

API notes (graphiti-core):
- Graphiti defaults all three clients to OpenAI; we override every one:
  Gemini for extraction + reranking, local sentence-transformers for
  embeddings (free, no per-search quota).
- There is no clear_data/clear_graph method on this version, so reset is
  done with a direct Cypher DETACH DELETE scoped to the group_id.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import deque

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.gemini_client import GeminiClient
from graphiti_core.llm_client.groq_client import GroqClient
from neo4j import AsyncGraphDatabase, exceptions as neo4j_exc
from sentence_transformers import SentenceTransformer

from argus_kb.config import settings

GEMINI_RERANK_MODEL = "gemini-2.5-flash"

log = logging.getLogger(__name__)

_graphiti: Graphiti | None = None
_neo4j_driver = None
_embed_model: SentenceTransformer | None = None


class RateLimiter:
    """Sliding-window limiter. Gemini free tier is ~10 RPM and a single
    add_episode bursts many sequential LLM calls, so every Gemini call is
    gated through one shared limiter to stay just under the cap.
    """

    def __init__(self, max_calls: int, period_s: float) -> None:
        self.max_calls = max_calls
        self.period = period_s
        self._calls: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            while self._calls and now - self._calls[0] > self.period:
                self._calls.popleft()
            if len(self._calls) >= self.max_calls:
                wait = self.period - (now - self._calls[0])
                if wait > 0:
                    await asyncio.sleep(wait)
                now = time.monotonic()
                while self._calls and now - self._calls[0] > self.period:
                    self._calls.popleft()
            self._calls.append(time.monotonic())


# Gemini free tier ~10 RPM; Groq free tier ~30 RPM. graphiti fires multiple
# underlying API calls per generate_response, so each limiter sits well under
# the nominal cap. Separate buckets because the providers have different caps.
_gemini_limiter = RateLimiter(max_calls=8, period_s=65.0)
_groq_limiter = RateLimiter(max_calls=12, period_s=65.0)


class ThrottledGeminiClient(GeminiClient):
    async def generate_response(self, *args, **kwargs):
        await _gemini_limiter.acquire()
        return await super().generate_response(*args, **kwargs)


class ThrottledGroqClient(GroqClient):
    async def generate_response(self, *args, **kwargs):
        await _groq_limiter.acquire()
        return await super().generate_response(*args, **kwargs)


class ThrottledGeminiReranker(GeminiRerankerClient):
    async def rank(self, *args, **kwargs):
        await _gemini_limiter.acquire()
        return await super().rank(*args, **kwargs)


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

    # Extraction LLM (the heavy path): Groq by default, Gemini optional.
    if settings.graphiti_llm_provider == "groq":
        llm_client = ThrottledGroqClient(
            config=LLMConfig(api_key=settings.groq_api_key, model=settings.graphiti_llm_model)
        )
    else:
        llm_client = ThrottledGeminiClient(
            config=LLMConfig(api_key=settings.gemini_api_key, model=settings.graphiti_llm_model)
        )

    # Reranker is only hit at search time (low volume); keep it on Gemini.
    reranker = ThrottledGeminiReranker(
        config=LLMConfig(api_key=settings.gemini_api_key, model=GEMINI_RERANK_MODEL)
    )
    embedder = LocalEmbedder(settings.graphiti_embedder_model)

    _graphiti = Graphiti(
        settings.neo4j_uri,
        settings.neo4j_user,
        settings.neo4j_password,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=reranker,
        max_coroutines=1,  # serialize internal LLM calls to stay under Gemini free-tier RPM
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
