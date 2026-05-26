from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env.local", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "devpass"

    # Extraction + rerank provider for graphiti: "nim" | "crusoe".
    # Both are OpenAI-compatible with large context and generous rate limits.
    # Gemini (20 req/min) and Groq (12k TPM < graphiti's ~18k prompt) were
    # removed: both rate-limited unusably on the free tier.
    graphiti_llm_provider: str = "nim"

    # NVIDIA NIM (build.nvidia.com)
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "meta/llama-3.3-70b-instruct"
    nvidia_rerank_model: str = "meta/llama-3.1-8b-instruct"

    # Crusoe (alternate; already hosts Nemotron for the shadow agent)
    crusoe_api_key: str = ""
    crusoe_inference_url: str = "https://api.inference.crusoecloud.com/v1/"
    crusoe_model: str = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"

    graphiti_embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    graphiti_group_id: str = "argus_incidents"

    admin_port: int = 7301
    mcp_port: int = 7300


settings = Settings()
