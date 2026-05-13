"""
providers/azure_openai.py — Azure OpenAI provider.

Azure uses a different base URL format and authenticates with an api-key header
instead of Authorization: Bearer. Extends OpenAICompatibleProvider to reuse all
streaming/completion/vision logic with minimal overrides.
"""
from .openai_compat import OpenAICompatibleProvider


class AzureOpenAIProvider(OpenAICompatibleProvider):
    """
    Azure OpenAI endpoint.
    URL format: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={ver}
    Auth header: api-key: {api_key}  (not Authorization: Bearer)
    """

    def __init__(
        self,
        endpoint:    str,
        deployment:  str,
        api_key:     str,
        name:        str   = "AzureOpenAI",
        api_version: str   = "2024-02-01",
        vision_model: str  = "",
    ):
        base = f"{endpoint.rstrip('/')}/openai/deployments/{deployment}"
        super().__init__(
            base_url     = base,
            api_key      = api_key,
            model        = deployment,
            name         = name,
            vision_model = vision_model,
        )
        self._api_version = api_version

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "api-key": self.api_key,          # Azure uses api-key, not Authorization
        }

    def _completions_url(self) -> str:
        return f"{self.base_url}/chat/completions?api-version={self._api_version}"
