"""
providers/base.py — abstract AI provider interface.
All backends (Ollama, NVIDIA, Azure, Bedrock, Vertex, custom) implement these methods.
"""
from abc import ABC, abstractmethod


class AIProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    def stream(
        self,
        messages: list[dict],
        max_tokens: int,
        on_token,
        on_done,
        on_error,
    ) -> None:
        """Stream tokens synchronously. Calls on_token(str) per token,
        on_done() on completion, on_error() on failure.
        Caller is responsible for running this in a background thread."""

    @abstractmethod
    def complete(
        self,
        messages: list[dict],
        max_tokens: int = 400,
        timeout: int = 30,
    ) -> str:
        """Blocking single call. Returns response text or '' on failure."""

    @abstractmethod
    def is_available(self) -> bool:
        """True if the provider is reachable and configured right now."""

    def stream_vision(
        self,
        image_b64: str,
        messages: list[dict],
        max_tokens: int,
        on_token,
        on_done,
        on_error,
    ) -> None:
        raise NotImplementedError(f"{self.name} does not support vision")

    def supports_vision(self) -> bool:
        return False
