"""
providers/openai_compat.py — provider for any OpenAI-compatible /chat/completions endpoint.
Covers: NVIDIA NIM, Azure OpenAI, custom endpoints.
OllamaProvider subclasses this to add Ollama-specific options and vision.
"""
import json
import time
import requests

from log import log
from .base import AIProvider


class OpenAICompatibleProvider(AIProvider):
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        name: str = "custom",
        vision_model: str = "",
        timeout_stream: int = 30,
        timeout_complete: int = 30,
    ):
        self.base_url         = base_url.rstrip("/")
        self.api_key          = api_key
        self.model            = model
        self.name             = name
        self.vision_model     = vision_model
        self.timeout_stream   = timeout_stream
        self.timeout_complete = timeout_complete
        self._cooldown_until  = 0.0

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _extra_body(self) -> dict:
        """Subclasses inject provider-specific fields (e.g. Ollama options)."""
        return {}

    def _completions_url(self) -> str:
        """Full URL for /chat/completions. Override to add query params (e.g. api-version)."""
        return self._completions_url()

    def _mark_rate_limited(self, seconds: int = 120) -> None:
        self._cooldown_until = time.time() + seconds
        log(f"[{self.name}] Rate limited — pausing {seconds}s, will fall back")

    def is_available(self) -> bool:
        if time.time() < self._cooldown_until:
            return False
        return bool(self.api_key)

    def stream(self, messages, max_tokens, on_token, on_done, on_error):
        body = {
            "model":      self.model,
            "messages":   messages,
            "max_tokens": max_tokens,
            "stream":     True,
            **self._extra_body(),
        }
        try:
            res = requests.post(
                self._completions_url(),
                headers=self._headers(),
                json=body,
                stream=True,
                timeout=self.timeout_stream,
            )
            if res.status_code in (429, 401, 402):
                self._mark_rate_limited()
                on_error()
                return
            res.raise_for_status()
            for line in res.iter_lines():
                if not line:
                    continue
                if line.startswith(b"data: "):
                    data = line[6:]
                    if data == b"[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        token = chunk["choices"][0]["delta"].get("content", "")
                        if token:
                            on_token(token)
                    except Exception:
                        pass
            on_done()
        except Exception as e:
            log(f"[{self.name} STREAM] {e}")
            on_error()

    def complete(self, messages, max_tokens=400, timeout=30):
        body = {
            "model":      self.model,
            "messages":   messages,
            "max_tokens": max_tokens,
            **self._extra_body(),
        }
        try:
            res = requests.post(
                self._completions_url(),
                headers=self._headers(),
                json=body,
                timeout=timeout,
            )
            if res.status_code in (429, 401, 402):
                self._mark_rate_limited()
                return ""
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log(f"[{self.name} COMPLETE] {e}")
            return ""

    def stream_vision(self, image_b64, messages, max_tokens, on_token, on_done, on_error):
        if not self.vision_model:
            raise NotImplementedError(f"{self.name}: no vision model configured")
        body = {
            "model":      self.vision_model,
            "messages":   _inject_image(messages, image_b64),
            "max_tokens": max_tokens,
            "stream":     True,
        }
        try:
            res = requests.post(
                self._completions_url(),
                headers=self._headers(),
                json=body,
                stream=True,
                timeout=self.timeout_stream,
            )
            if res.status_code in (429, 401, 402):
                self._mark_rate_limited()
                on_error()
                return
            res.raise_for_status()
            for line in res.iter_lines():
                if not line:
                    continue
                if line.startswith(b"data: "):
                    data = line[6:]
                    if data == b"[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        token = chunk["choices"][0]["delta"].get("content", "")
                        if token:
                            on_token(token)
                    except Exception:
                        pass
            on_done()
        except Exception as e:
            log(f"[{self.name} VISION] {e}")
            on_error()

    def supports_vision(self) -> bool:
        return bool(self.vision_model)


def _inject_image(messages: list[dict], image_b64: str) -> list[dict]:
    """Add a base64 image to the last user message in OpenAI multimodal format."""
    out = []
    for i, msg in enumerate(messages):
        if i == len(messages) - 1 and msg.get("role") == "user":
            content = msg["content"]
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            content = list(content) + [{
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
            }]
            out.append({"role": "user", "content": content})
        else:
            out.append(msg)
    return out
