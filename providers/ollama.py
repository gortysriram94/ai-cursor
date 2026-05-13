"""
providers/ollama.py — Ollama provider.
Extends OpenAICompatibleProvider with:
  - dynamic port discovery (system 11434 or bundled 11435)
  - Ollama-specific options (num_ctx, num_thread) for CPU performance
  - local multimodal vision via /api/generate + images field
"""
import json
import requests

from config import OLLAMA_PORT
from log import log
from .openai_compat import OpenAICompatibleProvider


class OllamaProvider(OpenAICompatibleProvider):
    def __init__(self, model: str, vision_model: str = ""):
        super().__init__(
            base_url         = f"http://localhost:{OLLAMA_PORT}/v1",
            api_key          = "",
            model            = model,
            name             = "Ollama",
            vision_model     = vision_model,
            timeout_stream   = 120,
            timeout_complete = 60,
        )
        self._active_api = f"http://localhost:{OLLAMA_PORT}"

    def _extra_body(self) -> dict:
        return {"options": {"num_ctx": 2048, "num_thread": 8}}

    def is_available(self) -> bool:
        for port in [11434, OLLAMA_PORT]:
            try:
                r = requests.get(f"http://localhost:{port}", timeout=2)
                if r.status_code == 200:
                    self.base_url    = f"http://localhost:{port}/v1"
                    self._active_api = f"http://localhost:{port}"
                    return True
            except Exception:
                pass
        return False

    def stream_vision(self, image_b64, messages, max_tokens, on_token, on_done, on_error):
        if not self.vision_model:
            on_error()
            return
        # Extract prompt text from the last user message
        prompt = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
        )
        if isinstance(prompt, list):
            prompt = " ".join(
                p.get("text", "") for p in prompt if p.get("type") == "text"
            )
        try:
            res = requests.post(
                f"{self._active_api}/api/generate",
                json={
                    "model":  self.vision_model,
                    "prompt": prompt,
                    "images": [image_b64],
                    "stream": True,
                },
                stream=True,
                timeout=60,
            )
            res.raise_for_status()
            for line in res.iter_lines():
                if not line:
                    continue
                try:
                    data  = json.loads(line)
                    token = data.get("response", "")
                    if token:
                        on_token(token)
                    if data.get("done"):
                        break
                except Exception:
                    pass
            on_done()
        except Exception as e:
            log(f"[Ollama VISION] {e}")
            on_error()

    def supports_vision(self) -> bool:
        return bool(self.vision_model)
