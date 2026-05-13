"""
ai.py — AI call layer and Ollama lifecycle management.

Provider selection and fallback is handled by providers.registry.
This module owns:
  - Ollama process lifecycle (start, stop)
  - Model download (download_model_bg)
  - Health checks (is_ollama_running, is_model_pulled, etc.)
  - Public streaming/completion entry points used by the UI
  - Background context builder (call_context_builder)
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
    OLLAMA_EXE, OLLAMA_MODELS_DIR, OLLAMA_PORT, OLLAMA_API,
    OLLAMA_MODEL, OLLAMA_VISION, OLLAMA_CONTEXT_MODEL,
)

# Pre-import at module level so the first AI call doesn't trigger deep importlib
# chains inside a PyInstaller frozen app (which would eat into the recursion budget).
try:
    from retrieval_engine import retrieve_for_action as _retrieve_for_action
except Exception:
    _retrieve_for_action = None
from log import log
import state
from brain.context_bundle import ContextBundle


# ── Ollama health checks ──────────────────────────────────────────────────────

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
    from config import NVIDIA_API_KEY
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


# ── Ollama process lifecycle ──────────────────────────────────────────────────

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


# ── Model download ────────────────────────────────────────────────────────────

def download_model_bg(model: str):
    """Pull an Ollama model in a background thread. No Tkinter calls — writes to state only."""
    state.model_dl_status[model] = {"text": "Connecting…"}
    t_start = time.time()
    try:
        res = requests.post(f"{OLLAMA_API}/api/pull",
                            json={"name": model}, stream=True, timeout=None)
        for line in res.iter_lines():
            if not line:
                continue
            data = json.loads(line)
            if "error" in data:
                state.model_dl_status[model] = {"error": True, "text": data["error"]}
                log(f"[PULL FAILED] {model}: {data['error']}")
                return
            if "total" in data and "completed" in data and data["total"] > 0:
                completed = data["completed"]
                total     = data["total"]
                pct       = int(completed / total * 100)
                mb        = completed // (1024 * 1024)
                tot       = total     // (1024 * 1024)
                elapsed   = time.time() - t_start
                speed_mbs = round(completed / (1024 * 1024) / elapsed, 1) if elapsed > 1 else 0
                eta_secs  = int((total - completed) / (completed / elapsed)) if completed > 0 and elapsed > 1 else 0
                state.model_dl_status[model] = {
                    "pct": pct, "mb": mb, "tot": tot,
                    "text": f"{pct}%  —  {mb} MB / {tot} MB",
                    "speed_mbs": speed_mbs,
                    "eta_secs":  eta_secs,
                }
            elif data.get("status"):
                state.model_dl_status[model] = {"text": data["status"]}
        state.model_dl_status[model] = {"done": True, "pct": 100, "text": "Ready ✓"}
        log(f"[OLLAMA] {model} download complete")
    except Exception as e:
        state.model_dl_status[model] = {"error": True, "text": str(e)}
        log(f"[PULL FAILED] {model}: {e}")


# ── Text streaming (public) ───────────────────────────────────────────────────

def call_ai_streaming(text: str, action: str, tone: str,
                      on_token, on_done, on_error,
                      custom_instruction: str = "",
                      bundle: "ContextBundle | None" = None,
                      status_cb=None,
                      on_sources=None):
    from prompts import build_prompt
    from log import log_prompt
    from config import ACTION_MAX_TOKENS, _DEFAULT_MAX_TOKENS
    from providers.registry import stream_with_fallback

    if state.ai_active_count >= 2:
        log(f"[THROTTLE] {state.ai_active_count} calls active — dropping '{action}'")
        on_error()
        return

    def _run():
        state.ai_active_count += 1
        _t0 = time.monotonic()

        def _done():
            state.ai_active_count    = max(0, state.ai_active_count - 1)
            state.last_ai_latency_ms = int((time.monotonic() - _t0) * 1000)
            on_done()

        def _err():
            state.ai_active_count    = max(0, state.ai_active_count - 1)
            state.last_ai_latency_ms = int((time.monotonic() - _t0) * 1000)
            on_error()

        # Retrieval phase — runs before prompt is built so docs are injected
        active_bundle = bundle
        if active_bundle is not None and _retrieve_for_action is not None:
            try:
                docs = _retrieve_for_action(text, action, active_bundle,
                                            status_cb=status_cb)
                if docs:
                    active_bundle.retrieved_docs = docs
                    if on_sources:
                        try:
                            on_sources(docs)
                        except Exception:
                            pass
            except Exception as e:
                log(f"[RAG] retrieval skipped: {e}")

        if status_cb:
            try:
                status_cb("thinking…")
            except Exception:
                pass

        max_tokens = ACTION_MAX_TOKENS.get(action, _DEFAULT_MAX_TOKENS)
        prompt     = build_prompt(text, action, tone,
                                  custom_instruction=custom_instruction,
                                  bundle=active_bundle)
        log_prompt(action, prompt)
        messages = [{"role": "user", "content": prompt}]

        stream_with_fallback(messages, max_tokens, on_token, _done, _err)

    threading.Thread(target=_run, daemon=True).start()


# ── Simple (non-streaming) AI call ───────────────────────────────────────────

def _call_ai_simple(prompt: str, max_tokens: int = 400, timeout: int = 30) -> str:
    """Blocking AI call with provider fallback. Returns response text or ''."""
    from providers.registry import complete_with_fallback
    return complete_with_fallback(
        [{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        timeout=timeout,
    )


# ── Vision streaming ──────────────────────────────────────────────────────────

def call_ai_vision_streaming(screenshot_b64: str, action: str,
                              on_token, on_done, on_error,
                              custom_instruction: str = "",
                              prompt_override: str = ""):
    from prompts import VISION_PROMPTS
    from providers.registry import vision_with_fallback

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

    messages = [{"role": "user", "content": prompt}]

    def _run():
        vision_with_fallback(screenshot_b64, messages, 512, on_token, on_done, on_error)

    threading.Thread(target=_run, daemon=True).start()


# ── Link-aware streaming ──────────────────────────────────────────────────────

def call_link_aware_streaming(text: str, urls: list, action: str, tone: str,
                               on_token, on_done, on_error,
                               status_cb=None, app_name: str = ""):
    """Fetch each URL via Jina Reader, then stream an AI response referencing them."""
    from hyperlinks import _jina_read, _build_link_aware_prompt
    from providers.registry import stream_with_fallback

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
            call_ai_streaming(text, action, tone, on_token, on_done, on_error)
            return

        log(f"[LINK-AWARE] Read {len(page_contents)} pages, building response")
        if status_cb:
            try:
                status_cb("thinking...")
            except Exception:
                pass

        from config import ACTION_MAX_TOKENS, _DEFAULT_MAX_TOKENS
        prompt     = _build_link_aware_prompt(page_contents, text, action, tone)
        max_tokens = ACTION_MAX_TOKENS.get(action, _DEFAULT_MAX_TOKENS)
        messages   = [{"role": "user", "content": prompt}]
        stream_with_fallback(messages, max_tokens, on_token, on_done, on_error)

    threading.Thread(target=_run, daemon=True).start()


# ── Background context builder ────────────────────────────────────────────────

_cb_unhealthy_until: float = 0.0
_CB_COOLDOWN: int = 60


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

    if time.time() < _cb_unhealthy_until:
        return None

    existing = ""
    if current_ctx.get("situation"):
        existing = f'\nCurrent understanding: {current_ctx["situation"]}'

    signals_line = f"Signals: {signals.summary()}\n" if signals else ""

    # Entity hint guides what type of entity to extract for this market context
    try:
        from rag_config import ENTITY_HINTS
        entity_hint = ENTITY_HINTS.get(market_hint.split()[0].lower() if market_hint else "generic",
                                       "people, companies, topics, IDs")
    except Exception:
        entity_hint = "people, companies, topics, IDs"

    prompt = (
        f"App: {app_name}\n"
        f"Window: {window_title}\n"
        f"Domain: {market_hint}\n"
        f"{signals_line}"
        f"Screen content:\n{text}"
        f"{existing}\n\n"
        f"Entity focus for this domain: {entity_hint}\n"
        "List entities most useful for web search FIRST (e.g. ticker symbols before company names).\n"
        "Return ONLY valid JSON — no markdown, no explanation:\n"
        '{"situation":"one sentence what the user is doing",'
        '"entities":["most search-useful entity first, then others"],'
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
                timeout=20,
            )
            if res.status_code != 200:
                continue
            raw = res.json().get("response", "").strip()
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                _cb_unhealthy_until = 0.0
                return json.loads(m.group())
        except Exception as e:
            log(f"[CONTEXT BUILDER] port {port}: {e}")

    _cb_unhealthy_until = time.time() + _CB_COOLDOWN
    log(f"[CONTEXT BUILDER] Ollama unreachable — pausing {_CB_COOLDOWN}s")
    return None
