"""
platform/base.py — Abstract interface for every OS-specific operation.

The rest of the app imports from platform/ and calls these methods.
It never calls Win32, AppKit, or X11 directly.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from PIL import Image


@dataclass
class WindowInfo:
    app_name:     str     # human-readable ("Chrome", "VS Code")
    window_title: str     # full window title string
    pid:          int     # process ID
    handle:       object  # platform-specific handle (HWND, AXUIElement, XID)


@dataclass
class FormField:
    index:           int     # 0-based visual order (top → bottom)
    label:           str     # field label ("First Name", "Email")
    placeholder:     str     # hint text in the empty field, if any
    current_value:   str     # value already in the field
    suggested_value: str     # what the brain recommends putting here
    control_type:    str     # "text" | "textarea" | "combobox" | "checkbox" | "password"
    handle:          object  # platform-specific element reference
    rect:            tuple   = field(default_factory=tuple)  # (l, t, r, b)
    filled:          bool    = False
    # PII classification — set by security.classify_fields() after scanning
    pii_level:       str     = "none"   # "none"|"low"|"medium"|"high"|"blocked"
    pii_label:       str     = ""       # human label, e.g. "Credit Card"
    pii_mask:        bool    = False    # True → mask suggested value in UI
    pii_can_fill:    bool    = True     # False → controller must not fill


class PlatformBase(ABC):

    # ── Active window ──────────────────────────────────────────────────────────

    @abstractmethod
    def get_active_window(self) -> Optional[WindowInfo]:
        """Return info about the currently focused window, or None."""

    @abstractmethod
    def get_window_text(self, window: WindowInfo) -> str:
        """
        Extract all readable text content from the given window.
        Returns a plain string, capped at ~4000 chars.
        """

    # ── Hotkeys ────────────────────────────────────────────────────────────────

    @abstractmethod
    def register_hotkey(self, hotkey_id: int, modifiers: int, vk: int) -> bool:
        """Register a global hotkey. Returns True on success."""

    @abstractmethod
    def unregister_hotkey(self, hotkey_id: int) -> None:
        """Unregister a previously registered hotkey."""

    @abstractmethod
    def poll_hotkey(self) -> Optional[int]:
        """
        Non-blocking check for a pending hotkey event.
        Returns the hotkey_id that fired, or None.
        """

    # ── Cursor ─────────────────────────────────────────────────────────────────

    @abstractmethod
    def get_cursor_position(self) -> tuple[int, int]:
        """Return current (x, y) cursor position in screen coordinates."""

    @abstractmethod
    def set_custom_cursor(self, cursor_path: str) -> bool:
        """Point the system cursor at a .cur/.ico file. Returns True on success."""

    @abstractmethod
    def restore_default_cursor(self) -> None:
        """Restore the OS default arrow cursor."""

    # ── Screen ─────────────────────────────────────────────────────────────────

    @abstractmethod
    def capture_screenshot(self, region: Optional[tuple] = None) -> Image.Image:
        """
        Capture the primary screen, or a (left, top, width, height) region.
        Returns a PIL Image.
        """

    @abstractmethod
    def get_screen_size(self) -> tuple[int, int]:
        """Return (width, height) of the primary monitor."""

    # ── Form automation ────────────────────────────────────────────────────────

    @abstractmethod
    def get_form_fields(self, window: WindowInfo) -> "list[FormField]":
        """
        Scan the given window for fillable input controls.
        Returns fields sorted top-to-bottom by visual position.
        Empty list if no fillable fields found or automation unavailable.
        """

    @abstractmethod
    def set_field_value(self, field: "FormField", value: str) -> bool:
        """
        Write value into the given field.
        Returns True on success, False if the field could not be filled.
        """

    @abstractmethod
    def focus_field(self, field: "FormField") -> None:
        """Bring the given field into view and give it input focus."""

    # ── Identity ───────────────────────────────────────────────────────────────

    @property
    @abstractmethod
    def name(self) -> str:
        """Platform identifier: 'windows' | 'macos' | 'linux'."""
