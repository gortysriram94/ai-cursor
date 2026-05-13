"""
ai.py — all AI provider code: NVIDIA, Ollama, streaming (text + vision),
        link-aware mode, and Ollama lifecycle management.
"""

import os
import re
import json
import time
import threading
import subprocess
import platform as _platform
import requests

from config import (
    OLLAMA_EXE, OLLAMA_MODELS_DIR, OLLAMA_PORT, OLLAMA_BASE, OLLAMA_API,
    OLLAMA_MODEL, OLLAMA_VISION, OLLAMA_CONTEXT_MODEL,
    NVIDIA_API_KEY, NVIDIA_BASE, NVIDIA_MODEL, NVIDIA_VISION_MODEL,
)
from log import log
import state
from brain.context_bundle import ContextBundle


# ── Provider rate-limit exception ─────────────────────────────────────────────

class _ProviderRateLimited(Exception):
    pass


# ── NVIDIA helpers ────────────────────────────────────────────────────────────

def _nvidia_available() -> bool:
    return bool(NVIDIA_API_KEY) and time.time() > state._nvidia_cooldown_until[0]


def _mark_nvidia_limited(seconds: int = 120):
    state._nvidia_cooldown_until[0] = time.time() + seconds
    log(f"[NVIDIA] Rate limited / expired — pausing {seconds}s, falling back to local Ollama")


# ── Ollama helpers ────────────────────────────────────────────────────────────

def get_ollama_api() -> str:
    """Returns /v1 base URL of the running Ollama instance, or empty string."""
    for port in [11434, OLLAMA_PORT]:
        try:
            if requests.get(f"http://localhost:{port}", timeout=2).status_code == 200:
                return f"http://localhost:{port}/v1"
        except Exception:
            pass
    return ""


def is_ollama_running() -> bool:
    return bool(get_ollama_api())


def get_vision_api() -> str:
    """Returns API base URL of a running Ollama that has the vision model, or ''."""
    for api in [OLLAMA_API, "http://localhost:11434"]:
        try:
            r = requests.post(
                f"{api}/api/show",
                json={"name": OLLAMA_VISION},
                timeout=3,
            )
            if r.status_code == 200:
                return api
        except Exception:
            pass
    return ""


def is_vision_model_available() -> bool:
    return bool(NVIDIA_API_KEY) or bool(get_vision_api())


def is_model_pulled() -> bool:
    for port in [11434, OLLAMA_PORT]:
        try:
            r = requests.post(
                f"http://localhost:{port}/api/show",
                json={"name": OLLAMA_MODEL},
                timeout=5,
            )
            if r.status_code == 200:
                return True
        except Exception:
            pass
    return False


def start_bundled_ollama() -> bool:
    if not OLLAMA_EXE.exists():
        return False
    if is_ollama_running():
        return True

    OLLAMA_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["OLLAMA_HOST"]   = f"127.0.0.1:{OLLAMA_PORT}"
    env["OLLAMA_MODELS"] = str(OLLAMA_MODELS_DIR)

    extra = {}
    if _platform.system() == "Windows":
        extra["creationflags"] = subprocess.CREATE_NO_WINDOW

    state._ollama_proc = subprocess.Popen(
        [str(OLLAMA_EXE), "serve"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **extra,
    )

    for _ in range(40):
        time.sleep(0.75)
        if is_ollama_running():
            return True
    return False


def stop_bundled_ollama():
    if state._ollama_proc:
        state._ollama_proc.terminate()
        state._ollama_proc = None


# ── Simple (non-streaming) AI call ───────────────────────────────────────────

def _call_ai_simple(prompt: str, max_tokens: int = 400, timeout: int = 30) -> str:
    """Blocking AI call with provider fallback. Returns response text or ''."""
    if _nvidia_available():
        try:
            res = requests.post(
                f"{NVIDIA_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model":      NVIDIA_MODEL,
                    "messages":   [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                },
                timeout=timeout,
            )
            if res.status_code in (429, 401, 402):
                _mark_nvidia_limited()
            else:
                res.raise_for_status()
                return res.json()["choices"][0]["message"]["content"].strip()
        except _ProviderRateLimited:
            pass
        except Exception as e:
            log(f"[NVIDIA simple] {e}")

    api = get_ollama_api()
    if api:
        try:
            res = requests.post(
                f"{api}/chat/completions",
                json={
                    "model":      OLLAMA_MODEL,
                    "messages":   [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                },
                timeout=max(timeout * 2, 60),
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log(f"[Ollama simple] {e}")
    return ""


# ── OpenAI-compatible streaming ───────────────────────────────────────────────

def _stream_openai(base: str, key: str, model: str, prompt: str,
                   on_token, on_done, on_error, timeout: int = 30):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        res = requests.post(
            f"{base}/chat/completions",
            headers=headers,
            json={
                "model":      model,
                "messages":   [{"role": "user", "content": prompt}],
                "max_tokens": 512,
                "stream":     True,
            },
            stream=True,
            timeout=timeout,
        )
        if res.status_code in (429, 401, 402):
            raise _ProviderRateLimited(res.status_code)
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
    except _ProviderRateLimited:
        raise
    except Exception as e:
        log(f"[STREAM ERROR] {e}")
        on_error()


# ── Text streaming (public) ───────────────────────────────────────────────────

def call_ai_streaming(text: str, action: str, tone: str,
                      on_token, on_done, on_error,
                      custom_instruction: str = "",
                      bundle: "ContextBundle | None" = None):
    from prompts import build_prompt
    from log import log_prompt

    prompt = build_prompt(text, action, tone,
                          custom_instruction=custom_instruction,
                          bundle=bundle)
    log_prompt(action, prompt)

    # Throttle: max 2 concurrent AI calls — beyond that, queue is backing up
    if state.ai_active_count >= 2:
        log(f"[THROTTLE] {state.ai_active_count} calls active — dropping request for '{action}'")
        on_error()
        return

    def _run():
        import time as _time
        state.ai_active_count += 1
        _t0 = _time.monotonic()

        def _done_wrap():
            state.ai_active_count  = max(0, state.ai_active_count - 1)
            state.last_ai_latency_ms = int((_time.monotonic() - _t0) * 1000)
            on_done()

        def _err_wrap():
            state.ai_active_count  = max(0, state.ai_active_count - 1)
            state.last_ai_latency_ms = int((_time.monotonic() - _t0) * 1000)
            on_error()

        def _try_ollama():
            api = get_ollama_api()
            if api:
                state._log_stats["actions"] += 1
                state._log_stats["provider"] = "Ollama"
                state.last_ai_provider  = "Ollama"
                state.last_ai_fallback  = True   # we're here because NVIDIA failed/absent
                _stream_openai(api, "", OLLAMA_MODEL, prompt,
                               on_token, _done_wrap, _err_wrap, timeout=120)
            else:
                log("[ERROR] No model available — set NVIDIA_API_KEY or start Ollama")
                _err_wrap()

        if _nvidia_available():
            try:
                state._log_stats["actions"] += 1
                state._log_stats["provider"] = "NVIDIA"
                state.last_ai_provider = "NVIDIA"
                state.last_ai_fallback = False
                _stream_openai(NVIDIA_BASE, NVIDIA_API_KEY, NVIDIA_MODEL, prompt,
                               on_token, _done_wrap, _try_ollama)
                return
            except _ProviderRateLimited:
                _mark_nvidia_limited()

        _try_ollama()

    threading.Thread(target=_run, daemon=True).start()


# ── Vision streaming ──────────────────────────────────────────────────────────

def _stream_nvidia_vision(screenshot_b64: str, prompt: str,
                           on_token, on_done, on_error):
    """Cloud vision via NVIDIA NIM."""
    try:
        res = requests.post(
            f"{NVIDIA_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model": NVIDIA_VISION_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:image/jpeg;base64,{screenshot_b64}"
                        }},
                    ],
                }],
                "max_tokens": 512,
                "stream":     True,
            },
            stream=True,
            timeout=30,
        )
        if res.status_code in (429, 401, 402):
            raise _ProviderRateLimited(res.status_code)
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
    except _ProviderRateLimited:
        raise
    except Exception as e:
        log(f"[NVIDIA VISION ERROR] {e}")
        on_error()


def _stream_local_vision(api: str, screenshot_b64: str, prompt: str,
                          on_token, on_done, on_error):
    try:
        res = requests.post(
            f"{api}/api/generate",
            json={
                "model":  OLLAMA_VISION,
                "prompt": prompt,
                "images": [screenshot_b64],
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
        log(f"[LOCAL VISION ERROR] {e}")
        on_error()


def call_ai_vision_streaming(screenshot_b64: str, action: str,
                              on_token, on_done, on_error,
                              custom_instruction: str = "",
                              prompt_override: str = ""):
    from prompts import VISION_PROMPTS

    _base = (
        "You are an AI assistant reading a user's screen. "
        "Your first word must NOT be 'The', 'This', 'I', or 'Here'. "
        "Do not describe that you are viewing a screenshot or image. "
        "Go directly to the task. "
        "Content-type rules — follow exactly:\n"
        "- If you see CODE: start with the language or framework name, e.g. 'TypeScript component...' or 'Python function...'\n"
        "- If you see an ARTICLE or TEXT: start with the topic, e.g. 'Article about...' or 'Email discussing...'\n"
        "- If you see a WEBSITE or UI: start with what the page does, e.g. 'Dashboard showing...' or 'Checkout page...'\n"
        "- If you see an ERROR or TERMINAL: start with 'Error:' or 'Output:'\n"
        "- If you see a PHOTO or CHART: start with the subject, e.g. 'Chart comparing...' or 'Photo of...'\n\n"
    )
    if prompt_override:
        prompt = _base + prompt_override
    elif custom_instruction and action == "custom":
        prompt = _base + custom_instruction
    else:
        prompt = _base + VISION_PROMPTS.get(action, "Describe what you see on this screen.")

    def _run():
        def _try_local_vision():
            api = get_vision_api()
            if api:
                log("[VISION] Falling back to local vision model")
                _stream_local_vision(api, screenshot_b64, prompt, on_token, on_done, on_error)
            else:
                log("[VISION] No vision backend available")
                on_error()

        if _nvidia_available():
            try:
                log("[VISION] Using NVIDIA cloud vision")
                _stream_nvidia_vision(screenshot_b64, prompt, on_token, on_done, _try_local_vision)
                return
            except _ProviderRateLimited:
                _mark_nvidia_limited()

        _try_local_vision()

    threading.Thread(target=_run, daemon=True).start()


# ── Link-aware streaming ──────────────────────────────────────────────────────

def call_link_aware_streaming(text: str, urls: list, action: str, tone: str,
                               on_token, on_done, on_error,
                               status_cb=None, app_name: str = ""):
    """Fetch each URL via Jina Reader, then stream an AI response referencing them."""
    from hyperlinks import _jina_read, _build_link_aware_prompt

    def _run():
        if status_cb:
            try:
                status_cb("reading pages...")
            except Exception:
                pass

        page_contents: dict = {}
        lock = threading.Lock()

        def fetch(url):
            data = _jina_read(url)
            if data:
                with lock:
                    page_contents[url] = data

        threads = [threading.Thread(target=fetch, args=(u,), daemon=True) for u in urls]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        if not page_contents:
            log("[LINK-AWARE] No page content retrieved — falling back to normal mode")
            call_ai_streaming(text, action, tone, on_token, on_done, on_error,
                              app_name=app_name)
            return

        log(f"[LINK-AWARE] Read {len(page_contents)} pages, building response")
        if status_cb:
            try:
                status_cb("thinking...")
            except Exception:
                pass

        prompt = _build_link_aware_prompt(page_contents, text, action, tone)

        def _try_ollama():
            api = get_ollama_api()
            if api:
                _stream_openai(api, "", OLLAMA_MODEL, prompt,
                               on_token, on_done, on_error, timeout=120)
            else:
                on_error()

        if _nvidia_available():
            try:
                _stream_openai(NVIDIA_BASE, NVIDIA_API_KEY, NVIDIA_MODEL, prompt,
                               on_token, on_done, _try_ollama)
                return
            except _ProviderRateLimited:
                _mark_nvidia_limited()

        _try_ollama()

    threading.Thread(target=_run, daemon=True).start()


# ── Background context builder ────────────────────────────────────────────────

# ── Ollama health tracking for context builder ────────────────────────────────
# Prevents retry spam when Ollama is not running.  Shared mutable — module level.
_cb_unhealthy_until: float = 0.0
_CB_COOLDOWN: int = 60   # seconds between re-checks when Ollama is unreachable


def call_context_builder(
    app_name:     str,
    window_title: str,
    market_hint:  str,
    text:         str,
    current_ctx:  dict,
    signals:      "ContentSignals | None" = None,
) -> "dict | None":
    """
    Fast blocking call to the local context model.
    Extracts situation, entities, summary, and confidence from screen content.
    Returns a dict or None if the call fails / times out.

    Called from a background thread — never blocks the UI.
    """
    global _cb_unhealthy_until

    # Skip entirely if Ollama recently failed — avoids connection-refused flood
    if time.time() < _cb_unhealthy_until:
        return None

    existing = ""
    if current_ctx.get("situation"):
        existing = f'\nCurrent understanding: {current_ctx["situation"]}'

    signals_line = f"Signals: {signals.summary()}\n" if signals else ""

    prompt = (
        f"App: {app_name}\n"
        f"Window: {window_title}\n"
        f"Domain: {market_hint}\n"
        f"{signals_line}"
        f"Screen content:\n{text}"
        f"{existing}\n\n"
        "Return ONLY valid JSON — no markdown, no explanation:\n"
        '{"situation":"one sentence what the user is doing",'
        '"entities":["key names/values visible — people, companies, topics, IDs"],'
        '"summary":"2-3 sentence summary of screen content",'
        '"confidence":0.7}'
    )

    for port in [11434, OLLAMA_PORT]:
        try:
            res = requests.post(
                f"http://localhost:{port}/api/generate",
                json={
                    "model":   OLLAMA_CONTEXT_MODEL,
                    "prompt":  prompt,
                    "stream":  False,
                    "options": {"temperature": 0.1, "num_predict": 250},
                },
                timeout=8,
            )
            if res.status_code != 200:
                continue
            raw = res.json().get("response", "").strip()
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                _cb_unhealthy_until = 0.0   # successful call — clear cooldown
                return json.loads(m.group())
        except Exception as e:
            log(f"[CONTEXT BUILDER] port {port}: {e}")

    # All ports failed — back off to avoid flooding logs and CPU
    _cb_unhealthy_until = time.time() + _CB_COOLDOWN
    log(f"[CONTEXT BUILDER] Ollama unreachable — pausing {_CB_COOLDOWN}s")
    return None
