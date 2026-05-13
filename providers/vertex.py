"""
providers/vertex.py — Google Vertex AI provider.

Requires: pip install google-cloud-aiplatform google-auth

Uses the Vertex AI Generative Models API (Gemini family).
If the SDK is not installed, VertexProvider loads without error but
is_available() returns False.
"""
import json
from log import log
from .base import AIProvider

_VERTEX = False
try:
    import google.auth          # noqa: F401
    _VERTEX = True
except ImportError:
    pass


class VertexProvider(AIProvider):
    """
    Google Vertex AI inference provider (Gemini models).
    """

    def __init__(
        self,
        project:              str,
        location:             str,
        model:                str,
        service_account_json: str = "",   # JSON string or file path
        name:                 str = "VertexAI",
    ):
        self.project              = project
        self.location             = location
        self.model                = model
        self.service_account_json = service_account_json
        self.name                 = name

    def is_available(self) -> bool:
        if not _VERTEX:
            return False
        return bool(self.project and self.location and self.model)

    def _credentials(self):
        import google.oauth2.service_account as sa
        import json as _json
        if not self.service_account_json:
            # Fall back to application default credentials
            import google.auth
            creds, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            return creds
        try:
            info = _json.loads(self.service_account_json)
        except Exception:
            # Treat as file path
            with open(self.service_account_json) as f:
                info = _json.load(f)
        return sa.Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )

    def _generate(self, messages: list[dict], max_tokens: int, stream: bool):
        """Call Vertex AI REST API directly (no SDK dependency for the call itself)."""
        import requests as _req
        import google.auth.transport.requests

        creds = self._credentials()
        auth_req = google.auth.transport.requests.Request()
        creds.refresh(auth_req)

        url = (
            f"https://{self.location}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project}/locations/{self.location}/"
            f"publishers/google/models/{self.model}:"
            f"{'streamGenerateContent' if stream else 'generateContent'}"
        )

        # Convert OpenAI messages format → Gemini format
        contents = []
        for m in messages:
            role = "user" if m["role"] != "assistant" else "model"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})

        body = {
            "contents":          contents,
            "generationConfig":  {"maxOutputTokens": max_tokens},
        }
        return _req.post(
            url,
            headers={"Authorization": f"Bearer {creds.token}",
                     "Content-Type": "application/json"},
            json=body,
            stream=stream,
            timeout=60,
        )

    def stream(self, messages, max_tokens, on_token, on_done, on_error):
        if not self.is_available():
            log(f"[Vertex] not available — SDK={'installed' if _VERTEX else 'missing'}")
            on_error()
            return
        try:
            resp = self._generate(messages, max_tokens, stream=True)
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                raw = line.decode("utf-8").lstrip("data: ")
                if not raw or raw == "[DONE]":
                    continue
                try:
                    chunk = json.loads(raw)
                    for candidate in chunk.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            token = part.get("text", "")
                            if token:
                                on_token(token)
                except Exception:
                    pass
            on_done()
        except Exception as e:
            log(f"[Vertex STREAM] {e}")
            on_error()

    def complete(self, messages, max_tokens=400, timeout=30) -> str:
        if not self.is_available():
            return ""
        try:
            resp = self._generate(messages, max_tokens, stream=False)
            resp.raise_for_status()
            data = resp.json()
            return (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
            )
        except Exception as e:
            log(f"[Vertex COMPLETE] {e}")
            return ""
