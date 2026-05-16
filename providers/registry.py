"""
providers/registry.py — manages the ordered list of active AI providers.
Default priority: enterprise cloud → NVIDIA → Ollama.
Enterprise providers are inserted at position 0 via add_provider().
"""
import state
from log import log
from .base import AIProvider


_providers: list[AIProvider] = []


def _build_defaults() -> None:
    from config import (
        NVIDIA_API_KEY, NVIDIA_BASE, NVIDIA_MODEL, NVIDIA_VISION_MODEL,
        OLLAMA_VISION,
        GROQ_API_KEY,      GROQ_BASE,      GROQ_MODEL,
        CEREBRAS_API_KEY,  CEREBRAS_BASE,  CEREBRAS_MODEL,
        TOGETHER_API_KEY,  TOGETHER_BASE,  TOGETHER_MODEL,
        OPENROUTER_API_KEY,OPENROUTER_BASE,OPENROUTER_MODEL,
        MISTRAL_API_KEY,   MISTRAL_BASE,   MISTRAL_MODEL,
    )
    from storage import load_active_model
    from .openai_compat import OpenAICompatibleProvider
    from .ollama import OllamaProvider

    # ── Priority 1: enterprise cloud (inserted at 0 by Connections tab) ────────

    # ── Priority 2: NVIDIA (if key set) ───────────────────────────────────────
    if NVIDIA_API_KEY:
        _providers.append(OpenAICompatibleProvider(
            base_url     = NVIDIA_BASE,
            api_key      = NVIDIA_API_KEY,
            model        = NVIDIA_MODEL,
            name         = "NVIDIA",
            vision_model = NVIDIA_VISION_MODEL,
        ))

    # ── Priority 3: Ollama local — auto-upgrade away from bundled 0.5b ──────────
    active_model = load_active_model()

    # If the active model is the bundled starter (0.5b), try to find the best
    # non-bundled downloaded model and use that instead.
    try:
        from models import MODELS
        from storage import load_downloaded_models
        bundled_ids  = {m["id"] for m in MODELS if m.get("bundled")}
        if active_model in bundled_ids:
            downloaded = load_downloaded_models()
            capable = sorted(
                [m for m in MODELS
                 if not m.get("bundled")
                 and m["id"] in downloaded
                 and m["category"] == "main"],
                key=lambda m: m.get("size_gb", 0),
                reverse=True,
            )
            if capable:
                active_model = capable[0]["id"]
                log(f"[REGISTRY] bundled model active — auto-upgraded to {active_model}")
            else:
                state.only_bundled_model = True
                log("[REGISTRY] only bundled starter model available — real tasks limited")
    except Exception as _e:
        log(f"[REGISTRY] model upgrade check failed: {_e}")

    _providers.append(OllamaProvider(active_model, OLLAMA_VISION))
    log(f"[REGISTRY] Ollama model: {active_model}")

    # ── Priority 4-8: free cloud fallbacks (tried only if Ollama fails) ───────
    _free = [
        (GROQ_API_KEY,       GROQ_BASE,       GROQ_MODEL,       "Groq"),
        (CEREBRAS_API_KEY,   CEREBRAS_BASE,   CEREBRAS_MODEL,   "Cerebras"),
        (TOGETHER_API_KEY,   TOGETHER_BASE,   TOGETHER_MODEL,   "Together"),
        (OPENROUTER_API_KEY, OPENROUTER_BASE, OPENROUTER_MODEL, "OpenRouter"),
        (MISTRAL_API_KEY,    MISTRAL_BASE,    MISTRAL_MODEL,    "Mistral"),
    ]
    for key, base, model, name in _free:
        if key:
            _providers.append(OpenAICompatibleProvider(
                base_url = base,
                api_key  = key,
                model    = model,
                name     = name,
            ))
            log(f"[REGISTRY] fallback: {name}")


def get_providers() -> list[AIProvider]:
    if not _providers:
        _build_defaults()
    return _providers


def add_provider(provider: AIProvider, position: int = 0) -> None:
    """Insert a provider at the given position (0 = highest priority)."""
    get_providers()
    _providers.insert(position, provider)


def remove_provider(name: str) -> None:
    """Remove all providers with the given name."""
    get_providers()
    _providers[:] = [p for p in _providers if p.name != name]


def set_active_ollama_model(model_id: str) -> None:
    """
    Switch the active Ollama model live without restarting the app.
    Removes the existing Ollama provider and adds a new one with the given model.
    """
    from .ollama import OllamaProvider
    from config import OLLAMA_VISION
    from storage import save_active_model
    get_providers()
    _providers[:] = [p for p in _providers if p.name != "Ollama"]
    _providers.append(OllamaProvider(model_id, OLLAMA_VISION))
    save_active_model(model_id)
    log(f"[REGISTRY] switched Ollama model → {model_id}")


def stream_with_fallback(
    messages: list[dict],
    max_tokens: int,
    on_token,
    on_done,
    on_error,
) -> None:
    """Try providers in priority order. on_error fires only if all fail."""
    available = [p for p in get_providers() if p.is_available()]
    if not available:
        log("[AI] No provider available")
        on_error()
        return

    def _try(idx: int) -> None:
        if idx >= len(available):
            on_error()
            return
        p = available[idx]
        state.last_ai_provider       = p.name
        state.last_ai_fallback       = idx > 0
        state._log_stats["actions"] += 1
        state._log_stats["provider"] = p.name

        def _next():
            log(f"[AI] {p.name} failed — trying next provider")
            _try(idx + 1)

        p.stream(messages, max_tokens, on_token, on_done, _next)

    _try(0)


def complete_with_fallback(
    messages: list[dict],
    max_tokens: int = 400,
    timeout: int = 30,
) -> str:
    """Try providers in order, return first non-empty response."""
    for p in get_providers():
        if p.is_available():
            result = p.complete(messages, max_tokens, timeout)
            if result:
                return result
    return ""


def vision_with_fallback(
    image_b64: str,
    messages: list[dict],
    max_tokens: int,
    on_token,
    on_done,
    on_error,
) -> None:
    """Try vision-capable providers in order. on_error fires only if all fail."""
    available = [p for p in get_providers() if p.supports_vision() and p.is_available()]
    if not available:
        log("[VISION] No vision provider available")
        on_error()
        return

    def _try(idx: int) -> None:
        if idx >= len(available):
            on_error()
            return
        p = available[idx]

        def _next():
            log(f"[VISION] {p.name} failed — trying next provider")
            _try(idx + 1)

        p.stream_vision(image_b64, messages, max_tokens, on_token, on_done, _next)

    _try(0)
