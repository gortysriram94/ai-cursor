"""
connections.py — connection config schema, CRUD store, and provider instantiation.

ConnectionConfig stores non-secret settings in pushpa_connections.json.
Credentials (API keys, secrets) live in the OS keychain (keychain.py) and are
referenced here only by a credential_ref string.

Flow:
  1. User fills connection form in UI → upsert_connection(config)
  2. UI stores credentials → keychain.store(config.credential_ref, creds)
  3. On startup → load_into_registries(keychain.load_all())
"""
import json
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

import config as _config
from log import log


# ── Provider type registry ────────────────────────────────────────────────────
# Describes every supported backend: labels, non-secret settings, and what
# credentials the user must supply. The UI config form is generated from this.

PROVIDER_TYPES: dict[str, dict] = {

    # ── AI providers ──────────────────────────────────────────────────────────

    "azure_openai": {
        "label": "Azure OpenAI",
        "kind":  "ai",
        "fields": [
            {"key": "endpoint",    "label": "Endpoint URL",    "required": True,
             "placeholder": "https://your-resource.openai.azure.com/openai"},
            {"key": "deployment",  "label": "Deployment Name", "required": True,
             "placeholder": "gpt-4o"},
            {"key": "api_version", "label": "API Version",     "required": False,
             "default": "2024-02-01"},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "API Key", "required": True},
        ],
    },

    "bedrock": {
        "label": "AWS Bedrock",
        "kind":  "ai",
        "fields": [
            {"key": "region",   "label": "AWS Region", "required": True,
             "placeholder": "us-east-1"},
            {"key": "model_id", "label": "Model ID",   "required": True,
             "placeholder": "anthropic.claude-3-5-sonnet-20241022-v2:0"},
        ],
        "credential_fields": [
            {"key": "access_key",    "label": "Access Key ID",              "required": True},
            {"key": "secret_key",    "label": "Secret Access Key",          "required": True},
            {"key": "session_token", "label": "Session Token (optional)",   "required": False},
        ],
    },

    "vertex": {
        "label": "Google Vertex AI",
        "kind":  "ai",
        "fields": [
            {"key": "project",  "label": "Project ID", "required": True},
            {"key": "location", "label": "Location",   "required": True,
             "placeholder": "us-central1"},
            {"key": "model",    "label": "Model",      "required": True,
             "placeholder": "gemini-1.5-pro"},
        ],
        "credential_fields": [
            {"key": "service_account_json", "label": "Service Account JSON (paste full JSON)",
             "required": True},
        ],
    },

    "openai_compat": {
        "label": "Custom OpenAI-Compatible API",
        "kind":  "ai",
        "fields": [
            {"key": "base_url", "label": "Base URL",   "required": True,
             "placeholder": "https://api.example.com/v1"},
            {"key": "model",    "label": "Model Name", "required": True},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "API Key (leave blank if not required)",
             "required": False},
        ],
    },

    # ── Retrieval providers ───────────────────────────────────────────────────

    "pinecone": {
        "label": "Pinecone",
        "kind":  "retrieval",
        "fields": [
            {"key": "index_name",  "label": "Index Name",  "required": True},
            {"key": "namespace",   "label": "Namespace",   "required": False, "default": ""},
            {"key": "environment", "label": "Environment", "required": False,
             "placeholder": "us-east-1-aws"},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "API Key", "required": True},
        ],
    },

    "weaviate": {
        "label": "Weaviate",
        "kind":  "retrieval",
        "fields": [
            {"key": "url",        "label": "Cluster URL",  "required": True,
             "placeholder": "https://your-cluster.weaviate.network"},
            {"key": "class_name", "label": "Class Name",   "required": True},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "API Key (WCS)", "required": False},
        ],
    },

    "qdrant": {
        "label": "Qdrant",
        "kind":  "retrieval",
        "fields": [
            {"key": "url",             "label": "URL",             "required": True,
             "placeholder": "https://your-cluster.qdrant.io"},
            {"key": "collection_name", "label": "Collection Name", "required": True},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "API Key", "required": False},
        ],
    },

    "azure_search": {
        "label": "Azure AI Search",
        "kind":  "retrieval",
        "fields": [
            {"key": "endpoint",   "label": "Endpoint",   "required": True,
             "placeholder": "https://your-service.search.windows.net"},
            {"key": "index_name", "label": "Index Name", "required": True},
        ],
        "credential_fields": [
            {"key": "api_key", "label": "Admin API Key", "required": True},
        ],
    },

    "custom_rag": {
        "label": "Custom RAG API",
        "kind":  "retrieval",
        "fields": [
            {"key": "url",           "label": "Endpoint URL",          "required": True},
            {"key": "query_field",   "label": "Query field name",      "required": False,
             "default": "query"},
            {"key": "results_field", "label": "Results array field",   "required": False,
             "default": "results"},
            {"key": "content_field", "label": "Content field name",    "required": False,
             "default": "content"},
            {"key": "source_field",  "label": "Source/URL field name", "required": False,
             "default": "source"},
            {"key": "auth_header",   "label": "Auth header name",      "required": False,
             "placeholder": "Authorization"},
        ],
        "credential_fields": [
            {"key": "auth_value",
             "label": "Auth header value (e.g. Bearer <token>)",
             "required": False},
        ],
    },
}


# ── ConnectionConfig dataclass ────────────────────────────────────────────────

@dataclass
class ConnectionConfig:
    id:             str
    name:           str
    type:           str
    enabled:        bool  = True
    settings:       dict  = field(default_factory=dict)
    credential_ref: str   = ""      # OS keychain lookup key (set by keychain.py)
    created_at:     float = field(default_factory=time.time)
    updated_at:     float = field(default_factory=time.time)

    def provider_meta(self) -> dict:
        return PROVIDER_TYPES.get(self.type, {})

    def is_ai_provider(self) -> bool:
        return self.provider_meta().get("kind") == "ai"

    def is_retrieval_provider(self) -> bool:
        return self.provider_meta().get("kind") == "retrieval"

    def validate(self) -> list[str]:
        """Return list of human-readable error messages. Empty list = valid."""
        meta = self.provider_meta()
        if not meta:
            return [f"Unknown provider type: '{self.type}'"]
        return [
            f"{f['label']} is required"
            for f in meta.get("fields", [])
            if f.get("required") and not self.settings.get(f["key"])
        ]


# ── JSON store ────────────────────────────────────────────────────────────────

def _load_raw() -> list[dict]:
    try:
        p = Path(_config.CONNECTIONS_FILE)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        log(f"[CONNECTIONS] load error: {e}")
    return []


def _save_raw(configs: list[dict]) -> None:
    try:
        Path(_config.CONNECTIONS_FILE).write_text(
            json.dumps(configs, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        log(f"[CONNECTIONS] save error: {e}")


def load_connections() -> list[ConnectionConfig]:
    """Load all connections from disk."""
    rows = []
    for d in _load_raw():
        try:
            rows.append(ConnectionConfig(**d))
        except Exception as e:
            log(f"[CONNECTIONS] skipping malformed entry: {e}")
    return rows


def save_connections(configs: list[ConnectionConfig]) -> None:
    _save_raw([asdict(c) for c in configs])


def get_connection(conn_id: str) -> "ConnectionConfig | None":
    return next((c for c in load_connections() if c.id == conn_id), None)


def upsert_connection(config: ConnectionConfig) -> None:
    """Insert or replace a connection (matched by id). Bumps updated_at."""
    config.updated_at = time.time()
    configs = [c for c in load_connections() if c.id != config.id]
    configs.append(config)
    save_connections(configs)
    log(f"[CONNECTIONS] saved '{config.name}' ({config.type})")


def delete_connection(conn_id: str) -> None:
    save_connections([c for c in load_connections() if c.id != conn_id])
    log(f"[CONNECTIONS] deleted '{conn_id}'")


# ── Provider instantiation ────────────────────────────────────────────────────

def instantiate_ai_provider(config: ConnectionConfig, creds: dict):
    """
    Build an AIProvider from a ConnectionConfig + decrypted credentials dict.
    creds keys match the credential_fields defined in PROVIDER_TYPES.
    Returns None if required credentials are missing.
    """
    s = config.settings

    if config.type == "azure_openai":
        from providers.azure_openai import AzureOpenAIProvider
        endpoint   = s.get("endpoint", "").rstrip("/")
        deployment = s.get("deployment", "")
        api_key    = creds.get("api_key", "")
        if not (endpoint and deployment and api_key):
            log(f"[CONNECTIONS] '{config.name}': missing endpoint, deployment, or api_key")
            return None
        return AzureOpenAIProvider(
            endpoint    = endpoint,
            deployment  = deployment,
            api_key     = api_key,
            name        = config.name,
            api_version = s.get("api_version", "2024-02-01"),
        )

    if config.type == "openai_compat":
        from providers.openai_compat import OpenAICompatibleProvider
        return OpenAICompatibleProvider(
            base_url = s.get("base_url", ""),
            api_key  = creds.get("api_key", ""),
            model    = s.get("model", ""),
            name     = config.name,
        )

    if config.type == "bedrock":
        from providers.bedrock import BedrockProvider
        return BedrockProvider(
            region        = s.get("region", ""),
            model_id      = s.get("model_id", ""),
            access_key    = creds.get("access_key", ""),
            secret_key    = creds.get("secret_key", ""),
            session_token = creds.get("session_token", ""),
            name          = config.name,
        )

    if config.type == "vertex":
        from providers.vertex import VertexProvider
        return VertexProvider(
            project              = s.get("project", ""),
            location             = s.get("location", "us-central1"),
            model                = s.get("model", ""),
            service_account_json = creds.get("service_account_json", ""),
            name                 = config.name,
        )

    log(f"[CONNECTIONS] Unknown AI provider type '{config.type}'")
    return None


def instantiate_retrieval_provider(config: ConnectionConfig, creds: dict):
    """
    Build a RetrievalProvider from a ConnectionConfig + decrypted credentials.
    Returns None if required credentials are missing.
    """
    s = config.settings

    if config.type == "pinecone":
        from retrieval.pinecone import PineconeProvider
        return PineconeProvider(
            api_key    = creds.get("api_key", ""),
            index_name = s.get("index_name", ""),
            namespace  = s.get("namespace", ""),
            name       = config.name,
        )

    if config.type == "weaviate":
        from retrieval.weaviate import WeaviateProvider
        return WeaviateProvider(
            url        = s.get("url", ""),
            class_name = s.get("class_name", ""),
            api_key    = creds.get("api_key", ""),
            name       = config.name,
        )

    if config.type == "qdrant":
        from retrieval.qdrant import QdrantProvider
        return QdrantProvider(
            url             = s.get("url", ""),
            collection_name = s.get("collection_name", ""),
            api_key         = creds.get("api_key", ""),
            name            = config.name,
        )

    if config.type == "azure_search":
        from retrieval.azure_search import AzureSearchProvider
        return AzureSearchProvider(
            endpoint   = s.get("endpoint", ""),
            index_name = s.get("index_name", ""),
            api_key    = creds.get("api_key", ""),
            name       = config.name,
        )

    if config.type == "custom_rag":
        from retrieval.custom_rag import CustomRAGProvider
        return CustomRAGProvider(
            url           = s.get("url", ""),
            auth_header   = s.get("auth_header", "Authorization"),
            auth_value    = creds.get("auth_value", ""),
            query_field   = s.get("query_field", "query"),
            results_field = s.get("results_field", "results"),
            content_field = s.get("content_field", "content"),
            source_field  = s.get("source_field", "source"),
            name          = config.name,
        )

    log(f"[CONNECTIONS] Unknown retrieval provider type '{config.type}'")
    return None


def load_into_registries(creds_by_ref: "dict[str, dict]") -> None:
    """
    Instantiate all enabled connections and register them with their registries.
    Called at startup after keychain credentials are loaded.

    creds_by_ref: {credential_ref: {field_key: plain-text value}}
    """
    import providers as _ai_reg
    import retrieval as _ret_reg

    for config in load_connections():
        if not config.enabled:
            continue
        creds = creds_by_ref.get(config.credential_ref, {})

        if config.is_ai_provider():
            provider = instantiate_ai_provider(config, creds)
            if provider:
                _ai_reg.add_provider(provider)
                log(f"[CONNECTIONS] registered AI provider '{config.name}'")

        elif config.is_retrieval_provider():
            provider = instantiate_retrieval_provider(config, creds)
            if provider:
                _ret_reg.add_provider(provider)
                log(f"[CONNECTIONS] registered retrieval provider '{config.name}'")
