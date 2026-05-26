from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env.local", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "devpass"

    gemini_api_key: str = ""
    graphiti_llm_provider: str = "gemini"
    graphiti_llm_model: str = "gemini-2.5-flash"
    graphiti_embedder_provider: str = "sentence_transformers"
    graphiti_embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    graphiti_group_id: str = "argus_incidents"

    admin_port: int = 7301
    mcp_port: int = 7300


settings = Settings()
