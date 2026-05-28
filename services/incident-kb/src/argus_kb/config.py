from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env.local", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "devpass"

    # Extraction + rerank provider for graphiti: "crusoe" (default) | "tfy".
    # Crusoe (Nemotron Nano) is primary — generous limits, free, same model
    # family as the conductor's shadow cognition. TFY gateway (Sonnet) is the
    # backup if Crusoe is unreachable. NIM was tried first; its 40 RPM ceiling
    # couldn't carry Graphiti's burst extraction pattern, removed.
    graphiti_llm_provider: str = "crusoe"

    # Crusoe (primary; also hosts Nemotron for the shadow agent)
    crusoe_api_key: str = ""
    crusoe_inference_url: str = "https://api.inference.crusoecloud.com/v1/"
    crusoe_model: str = "nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B"

    # TrueFoundry AI Gateway (backup). Aliased to read the existing
    # TRUEFOUNDRY_* env vars shared with the orchestrator.
    tfy_api_key: str = Field(default="", alias="TRUEFOUNDRY_API_KEY")
    tfy_gateway_url: str = Field(
        default="https://gateway.truefoundry.ai", alias="TRUEFOUNDRY_GATEWAY_URL"
    )
    tfy_model: str = Field(default="anthropic/claude-sonnet-4-6", alias="CLAUDE_MODEL")

    graphiti_embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    graphiti_group_id: str = "argus_incidents"

    admin_port: int = 7301
    mcp_port: int = 7300


settings = Settings()
