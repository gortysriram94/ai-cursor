"""
brain/perception.py — Continuous screen perception thread.

Watches the active window and emits Observation objects whenever
something meaningful changes. The ContextBrain consumes these.

Emission triggers:
  - Window focus changes        → "window_change"
  - Text content changes > N chars → "content_change"
  - Periodic heartbeat          → "periodic"
"""

import time
import queue
import threading
from dataclasses import dataclass

from log import log
import state


# ── Observation ────────────────────────────────────────────────────────────────

@dataclass
class Observation:
    timestamp:    float
    app_name:     str
    window_title: str
    visible_text: str
    event_type:   str   # "window_change" | "content_change" | "selection_change" | "periodic"
    pid:          int = 0


# ── Perception thread ──────────────────────────────────────────────────────────

class PerceptionThread:
    """
    Background thread that feeds Observations into a queue.

    Designed so the ContextBrain can work at its own pace —
    if the queue fills up, the oldest observation is dropped (not blocked).
    """

    POLL_INTERVAL     = 0.5   # s — how often to check for window change
    CONTENT_INTERVAL  = 3.0   # s — how often to re-read text on same window
    PERIODIC_INTERVAL = 15.0  # s — heartbeat even when nothing changes
    MIN_TEXT_DELTA    = 60    # chars — minimum change to count as content_change
    QUEUE_MAX         = 20    # drop old observations if brain falls behind

    VISION_FALLBACK_COOLDOWN = 30.0   # seconds between vision fallback attempts

    def __init__(self, obs_queue: queue.Queue):
        self._q               = obs_queue
        self._running         = False
        self._thread: threading.Thread | None = None
        self._last_handle     = None
        self._last_title      = ""
        self._last_text       = ""
        self._last_selection  = ""   # tracks highlighted text separately
        self._last_content_ts = 0.0
        self._last_periodic_ts = 0.0
        self._last_vision_ts  = 0.0  # last time vision fallback was attempted
        self._vision_running  = False

    def start(self):
        self._running = True
        self._thread  = threading.Thread(
            target=self._loop, daemon=True, name="perception")
        self._thread.start()
        log("[PERCEPTION] started")

    def stop(self):
        self._running = False

    # ── Main loop ──────────────────────────────────────────────────────────────

    def _loop(self):
        from plat import platform as get_platform
        plat = get_platform()

        while self._running:
            try:
                self._tick(plat)
            except Exception as e:
                log(f"[PERCEPTION] tick error: {e}")
            time.sleep(self.POLL_INTERVAL)

    def _tick(self, plat):
        now    = time.time()
        window = plat.get_active_window()

        if window is None:
            return

        window_changed = (
            window.handle != self._last_handle or
            window.window_title != self._last_title
        )

        if window_changed:
            self._last_handle    = window.handle
            self._last_title     = window.window_title
            self._last_selection = ""
            text = self._safe_get_text(plat, window)
            self._last_text        = text
            self._last_content_ts  = now
            self._last_periodic_ts = now
            self._emit(window, text, "window_change")

            # OCR fallback — if UIA returned nothing, try vision model
            if not text.strip() and not self._vision_running:
                if now - self._last_vision_ts >= self.VISION_FALLBACK_COOLDOWN:
                    self._start_vision_fallback(window)
            return

        # Check selection — emit immediately when user highlights something new
        # Threshold lowered to 2 so short high-value strings (tickers, codes) aren't dropped
        try:
            if hasattr(plat, "get_selected_text"):
                sel = plat.get_selected_text(window)
                if sel and sel != self._last_selection and len(sel) > 2:
                    self._last_selection = sel
                    self._emit(window, sel, "selection_change")
                    return
        except Exception:
            pass

        # Same window — check if content changed
        if now - self._last_content_ts >= self.CONTENT_INTERVAL:
            text = self._safe_get_text(plat, window)
            self._last_content_ts = now

            if self._changed_significantly(text):
                self._last_text = text
                self._emit(window, text, "content_change")
                self._last_periodic_ts = now
                return

            # Periodic heartbeat even when content is static
            if now - self._last_periodic_ts >= self.PERIODIC_INTERVAL:
                self._last_periodic_ts = now
                self._emit(window, self._last_text, "periodic")

    def _changed_significantly(self, new_text: str) -> bool:
        if not self._last_text:
            return bool(new_text.strip())
        delta_len = abs(len(new_text) - len(self._last_text))
        delta_chars = sum(
            a != b for a, b in zip(new_text[:500], self._last_text[:500])
        )
        return delta_len > self.MIN_TEXT_DELTA or delta_chars > self.MIN_TEXT_DELTA

    def _safe_get_text(self, plat, window) -> str:
        """Get window text, skipping minimized windows to avoid UIA crashes."""
        try:
            import sys
            if sys.platform == "win32" and window.handle:
                import ctypes
                # IsIconic returns non-zero if the window is minimized
                if ctypes.windll.user32.IsIconic(window.handle):
                    return self._last_text   # return cached text — nothing new to read
        except Exception:
            pass
        try:
            return plat.get_window_text(window)
        except Exception:
            return self._last_text

    # Maximum characters accepted from a single window read
    MAX_OBS_TEXT = 8000

    def _start_vision_fallback(self, window) -> None:
        """
        Screenshot → vision model when UIA returns nothing.
        Runs in a background thread; injects result as a content_change observation.
        Only fires when a vision model is available and the cooldown has elapsed.
        """
        try:
            from ai import is_vision_model_available
            if not is_vision_model_available():
                return
        except Exception:
            return

        self._vision_running = True
        self._last_vision_ts = time.time()

        def _run():
            try:
                import base64, io
                import pyautogui
                from ai import call_ai_vision_streaming

                # Screenshot the whole screen — we don't have window rect
                img     = pyautogui.screenshot()
                buf     = io.BytesIO()
                img.save(buf, format="PNG")
                img_b64 = base64.b64encode(buf.getvalue()).decode()

                parts: list[str] = []

                def _tok(t):  parts.append(t)
                def _done():
                    text = "".join(parts).strip()
                    if text and len(text) > 20:
                        self._last_text = text
                        self._emit(window, text, "content_change")
                        log(f"[PERCEPTION] vision fallback: {len(text)} chars")
                def _err(): pass

                call_ai_vision_streaming(
                    img_b64, "inspect", _tok, _done, _err,
                    custom_instruction=(
                        "Extract all readable text from this screenshot. "
                        "Return only the text content, no descriptions or labels."
                    ),
                )
            except Exception as e:
                log(f"[PERCEPTION] vision fallback failed: {e}")
            finally:
                self._vision_running = False

        threading.Thread(target=_run, daemon=True, name="vision-fallback").start()

    def _emit(self, window, text: str, event_type: str):
        # ── Input validation ──────────────────────────────────────────────────
        # Sanitise before queuing — malformed input here would corrupt the brain.
        app_name     = (window.app_name     or "").strip()[:128] or "Unknown"
        window_title = (window.window_title or "").strip()[:256] or ""

        # Strip null bytes and non-printable control chars; clamp length
        safe_text = (text or "").replace("\x00", "").strip()[:self.MAX_OBS_TEXT]

        obs = Observation(
            timestamp    = time.time(),
            app_name     = app_name,
            window_title = window_title,
            visible_text = safe_text,
            event_type   = event_type,
            pid          = window.pid,
        )
        # Non-blocking put — drop oldest if queue is full
        if self._q.full():
            try:
                self._q.get_nowait()
            except queue.Empty:
                pass
        try:
            self._q.put_nowait(obs)
            state.obs_count_total += 1
            state.last_obs_ts = time.monotonic()
        except queue.Full:
            pass
