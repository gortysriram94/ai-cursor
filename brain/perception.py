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


# ── Observation ────────────────────────────────────────────────────────────────

@dataclass
class Observation:
    timestamp:    float
    app_name:     str
    window_title: str
    visible_text: str
    event_type:   str   # "window_change" | "content_change" | "periodic"
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

    def __init__(self, obs_queue: queue.Queue):
        self._q               = obs_queue
        self._running         = False
        self._thread: threading.Thread | None = None
        self._last_handle     = None
        self._last_title      = ""
        self._last_text       = ""
        self._last_content_ts = 0.0
        self._last_periodic_ts = 0.0

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
            self._last_handle = window.handle
            self._last_title  = window.window_title
            text = self._safe_get_text(plat, window)
            self._last_text        = text
            self._last_content_ts  = now
            self._last_periodic_ts = now
            self._emit(window, text, "window_change")
            return

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

    def _emit(self, window, text: str, event_type: str):
        obs = Observation(
            timestamp    = time.time(),
            app_name     = window.app_name,
            window_title = window.window_title,
            visible_text = text,
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
        except queue.Full:
            pass
