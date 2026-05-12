"""
plat/__init__.py — Auto-detect OS and return the correct singleton instance.

Usage anywhere in the app:
    from plat import platform
    win = platform().get_active_window()
"""

import sys
import threading
from .base import PlatformBase, WindowInfo

_instance: PlatformBase | None = None
_lock = threading.Lock()


def platform() -> PlatformBase:
    """Return the singleton platform instance for the current OS."""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:   # double-checked locking
                if sys.platform == "win32":
                    from .windows import WindowsPlatform
                    _instance = WindowsPlatform()
                elif sys.platform == "darwin":
                    from .macos import MacOSPlatform
                    _instance = MacOSPlatform()
                else:
                    from .linux import LinuxPlatform
                    _instance = LinuxPlatform()
    return _instance


__all__ = ["platform", "PlatformBase", "WindowInfo"]
