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

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.gemini_client import GeminiClient
from neo4j import AsyncGraphDatabase, exceptions as neo4j_exc
from sentence_transformers import SentenceTransformer

from argus_kb.config import settings

log = logging.getLogger(__name__)

_graphiti: Graphiti | None = None
_neo4j_driver = None
_embed_model: SentenceTransformer | None = None


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

    llm_config = LLMConfig(api_key=settings.gemini_api_key, model=settings.graphiti_llm_model)
    llm_client = GeminiClient(config=llm_config)
    reranker = GeminiRerankerClient(config=llm_config)
    embedder = LocalEmbedder(settings.graphiti_embedder_model)

    _graphiti = Graphiti(
        settings.neo4j_uri,
        settings.neo4j_user,
        settings.neo4j_password,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=reranker,
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
