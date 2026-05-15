"""
providers/ollama.py — Ollama provider.

Uses Python's built-in http.client instead of requests/urllib3 for all calls.
urllib3's call stack is 60-80 Python frames deep; http.client is ~10 frames,
which eliminates the RecursionError that happened in PyInstaller frozen builds
when urllib3 was used on top of an already-deep thread stack.
"""
import http.client
import json
import time
import urllib.parse

from config import OLLAMA_PORT
from log import log
from .base import AIProvider


class OllamaProvider(AIProvider):
    name = "Ollama"

    def __init__(self, model: str, vision_model: str = ""):
        self.model        = model
        self.vision_model = vision_model
        self._api_port    = OLLAMA_PORT   # updated by is_available()
        self._avail_until = 0.0           # cache expiry timestamp

    # ── Port discovery ────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        # Cache positive result for 5 seconds to avoid an HTTP round-trip
        # before every single AI call.
        if time.time() < self._avail_until:
            return True
        for port in [OLLAMA_PORT, 11434]:
            try:
                conn = http.client.HTTPConnection("localhost", port, timeout=2)
                conn.request("GET", "/")
                resp = conn.getresponse()
                conn.close()
                if resp.status == 200:
                    self._api_port    = port
                    self._avail_until = time.time() + 5   # cache for 5s
                    return True
            except Exception:
                pass
        self._avail_until = 0.0   # force re-check on next call
        return False

    # ── Text streaming ────────────────────────────────────────────────────────

    def stream(self, messages, max_tokens, on_token, on_done, on_error):
        """Try up to 3 times before falling back to cloud providers."""
        import time as _t
        body = json.dumps({
            "model":      self.model,
            "messages":   messages,
            "max_tokens": max_tokens,
            "stream":     True,
            "options":    {"num_ctx": 2048, "num_thread": 8},
            "keep_alive": -1,   # keep model in RAM indefinitely
        }).encode("utf-8")

        for attempt in range(3):
            try:
                conn = http.client.HTTPConnection(
                    "localhost", self._api_port, timeout=120)
                conn.request("POST", "/v1/chat/completions", body=body,
                             headers={"Content-Type": "application/json"})
                resp = conn.getresponse()

                if resp.status in (429, 401, 402):
                    conn.close()
                    break   # rate-limited — fall through to cloud

                if resp.status >= 500:
                    body = resp.read().decode("utf-8", errors="replace")[:200]
                    conn.close()
                    log(f"[Ollama STREAM] HTTP {resp.status}: {body}")
                    if attempt < 2:
                        _t.sleep(2)
                        self.is_available()
                    continue   # retry — 500 is often transient (model still loading)

                for raw_line in resp:
                    line = raw_line.strip()
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
                conn.close()
                return   # success — done

            except Exception as e:
                log(f"[Ollama STREAM] attempt {attempt + 1}/3: {e}")
                if attempt < 2:
                    _t.sleep(2)   # wait before retry
                    self.is_available()   # re-discover port in case Ollama restarted

        log("[Ollama] all 3 attempts failed — falling back to cloud")
        on_error()

    # ── Blocking completion ───────────────────────────────────────────────────

    def complete(self, messages, max_tokens=400, timeout=60) -> str:
        body = json.dumps({
            "model":      self.model,
            "messages":   messages,
            "max_tokens": max_tokens,
            "options":    {"num_ctx": 2048, "num_thread": 8},
        }).encode("utf-8")
        try:
            conn = http.client.HTTPConnection("localhost", self._api_port, timeout=timeout)
            conn.request("POST", "/v1/chat/completions", body=body,
                         headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            if resp.status >= 400:
                log(f"[Ollama COMPLETE] HTTP {resp.status}")
                conn.close()
                return ""
            raw = json.loads(resp.read().decode("utf-8"))
            conn.close()
            return raw["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log(f"[Ollama COMPLETE] {e}")
            return ""

    # ── Vision streaming ──────────────────────────────────────────────────────

    def stream_vision(self, image_b64, messages, max_tokens, on_token, on_done, on_error):
        if not self.vision_model:
            on_error()
            return
        prompt = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        if isinstance(prompt, list):
            prompt = " ".join(
                p.get("text", "") for p in prompt if p.get("type") == "text")

        body = json.dumps({
            "model":  self.vision_model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": True,
        }).encode("utf-8")
        try:
            conn = http.client.HTTPConnection("localhost", self._api_port, timeout=60)
            conn.request("POST", "/api/generate", body=body,
                         headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            for raw_line in resp:
                line = raw_line.strip()
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
            conn.close()
        except Exception as e:
            log(f"[Ollama VISION] {e}")
            on_error()

    def supports_vision(self) -> bool:
        return bool(self.vision_model)
