"""
plat/macos.py — macOS implementation of PlatformBase.

Required packages:
  pip install pyobjc-framework-Cocoa pyobjc-framework-Quartz \
              pyobjc-framework-ApplicationServices pynput pyautogui Pillow

Permissions required (System Settings → Privacy & Security):
  • Accessibility  — AXUIElement text/form field access
  • Screen Recording — screenshot capture
"""

import queue
import threading
import time
from typing import Optional

import pyautogui
from PIL import Image

from .base import PlatformBase, WindowInfo, FormField
from log import log


# ── Optional imports — degrade gracefully if pyobjc not installed ─────────────

try:
    import AppKit
    import Quartz
    _APPKIT = True
except ImportError:
    _APPKIT = False
    log("[PLATFORM-macOS] pyobjc not available — window detection limited")

try:
    import ApplicationServices as _AS
    _AX = True
except ImportError:
    _AX = False
    log("[PLATFORM-macOS] ApplicationServices not available — text/form extraction disabled")

try:
    from pynput import keyboard as _pynput_kb
    _PYNPUT = True
except ImportError:
    _PYNPUT = False
    log("[PLATFORM-macOS] pynput not available — hotkeys disabled")


# ── AX attribute constants (string-based API) ─────────────────────────────────

_AX_WINDOWS          = "AXWindows"
_AX_FOCUSED_WINDOW   = "AXFocusedWindow"
_AX_TITLE            = "AXTitle"
_AX_ROLE             = "AXRole"
_AX_VALUE            = "AXValue"
_AX_CHILDREN         = "AXChildren"
_AX_POSITION         = "AXPosition"
_AX_SIZE             = "AXSize"
_AX_FOCUSED          = "AXFocused"
_AX_PLACEHOLDER      = "AXPlaceholderValue"
_AX_HELP             = "AXHelp"

_AX_ROLE_TEXT_FIELD  = "AXTextField"
_AX_ROLE_TEXT_AREA   = "AXTextArea"
_AX_ROLE_COMBOBOX    = "AXComboBox"
_AX_ROLE_CHECKBOX    = "AXCheckBox"
_AX_ROLE_STATIC_TEXT = "AXStaticText"
_AX_ROLE_GROUP       = "AXGroup"
_AX_ROLE_WEB_AREA    = "AXWebArea"

_FILLABLE_ROLES = {_AX_ROLE_TEXT_FIELD, _AX_ROLE_TEXT_AREA,
                   _AX_ROLE_COMBOBOX, _AX_ROLE_CHECKBOX}

# Win32 modifier bits → pynput modifier keys
_MOD_TO_PYNPUT: dict[int, "_pynput_kb.Key"] = {}
if _PYNPUT:
    _MOD_TO_PYNPUT = {
        0x0001: _pynput_kb.Key.alt,
        0x0002: _pynput_kb.Key.ctrl,
        0x0004: _pynput_kb.Key.shift,
        0x0008: _pynput_kb.Key.cmd,
    }

# Win32 VK codes → character (A-Z, 0-9)
_VK_TO_CHAR = {
    **{0x41 + i: chr(ord('a') + i) for i in range(26)},
    **{0x30 + i: str(i)             for i in range(10)},
}


# ── AX helper ─────────────────────────────────────────────────────────────────

def _ax_get(element, attribute: str):
    """Return the AX attribute value or None on any error."""
    if not _AX or element is None:
        return None
    try:
        err, value = _AS.AXUIElementCopyAttributeValue(element, attribute, None)
        if err == 0:
            return value
    except Exception:
        pass
    return None


def _ax_children(element) -> list:
    children = _ax_get(element, _AX_CHILDREN)
    return list(children) if children else []


def _ax_walk_text(element, parts: list, depth: int = 0, max_depth: int = 10):
    """Recursively collect text from AX element tree."""
    if depth > max_depth or element is None:
        return

    role = _ax_get(element, _AX_ROLE) or ""

    # Web areas: try AXValue first, then continue into children either way.
    # Chrome/Safari suppress AXValue unless Accessibility is granted — do NOT
    # return early here, or the entire subtree is silently abandoned.
    if role == _AX_ROLE_WEB_AREA:
        val = _ax_get(element, _AX_VALUE)
        if val and str(val).strip():
            parts.append(str(val).strip()[:2000])
        # Always recurse into web area children for partial content access

    elif role in (_AX_ROLE_TEXT_FIELD, _AX_ROLE_TEXT_AREA, _AX_ROLE_STATIC_TEXT):
        val = _ax_get(element, _AX_VALUE) or _ax_get(element, _AX_TITLE) or ""
        if val and str(val).strip():
            parts.append(str(val).strip())

    for child in _ax_children(element):
        _ax_walk_text(child, parts, depth + 1, max_depth)


def _ax_walk_fields(element, fields: list, depth: int = 0, max_depth: int = 8):
    """Recursively collect fillable fields from AX element tree."""
    if depth > max_depth or element is None:
        return

    role = _ax_get(element, _AX_ROLE) or ""

    if role in _FILLABLE_ROLES:
        try:
            pos  = _ax_get(element, _AX_POSITION)
            size = _ax_get(element, _AX_SIZE)
            if pos and size:
                x, y   = pos.x, pos.y
                w, h   = size.width, size.height
                rect   = (int(x), int(y), int(x + w), int(y + h))
                # Skip zero-size elements
                if w < 4 or h < 4:
                    return
            else:
                rect = ()

            label       = str(_ax_get(element, _AX_TITLE)       or "")
            placeholder = str(_ax_get(element, _AX_PLACEHOLDER) or
                              _ax_get(element, _AX_HELP)        or "")
            current_val = str(_ax_get(element, _AX_VALUE)       or "")

            ctrl_str = {
                _AX_ROLE_TEXT_AREA: "textarea",
                _AX_ROLE_COMBOBOX:  "combobox",
                _AX_ROLE_CHECKBOX:  "checkbox",
            }.get(role, "text")

            fields.append(FormField(
                index           = len(fields),
                label           = label.strip(),
                placeholder     = placeholder.strip(),
                current_value   = current_val,
                suggested_value = "",
                control_type    = ctrl_str,
                handle          = element,
                rect            = rect,
            ))
        except Exception:
            pass

    for child in _ax_children(element):
        _ax_walk_fields(child, fields, depth + 1, max_depth)


# ── Platform implementation ────────────────────────────────────────────────────

class MacOSPlatform(PlatformBase):

    _DEBOUNCE_S = 0.5  # minimum seconds between successive fires of the same hotkey

    def __init__(self):
        self._hq:          queue.Queue       = queue.Queue()
        self._hotkeys:     dict[int, tuple]  = {}   # id -> (frozenset_mods, char)
        self._pressed:     set               = set()
        self._last_fired:  dict[int, float]  = {}   # id -> last fire timestamp
        self._listener:    "Optional[object]" = None
        self._lock         = threading.Lock()
        if _PYNPUT:
            self._start_listener()

    @property
    def name(self) -> str:
        return "macos"

    # ── Active window ──────────────────────────────────────────────────────────

    def get_active_window(self) -> Optional[WindowInfo]:
        if not _APPKIT:
            return None
        try:
            ws       = AppKit.NSWorkspace.sharedWorkspace()
            app      = ws.frontmostApplication()
            app_name = str(app.localizedName())
            pid      = int(app.processIdentifier())

            ax_app = _AS.AXUIElementCreateApplication(pid) if _AX else None

            # Get focused window title via AXUIElement
            title = app_name
            if ax_app:
                focused = _ax_get(ax_app, _AX_FOCUSED_WINDOW)
                if focused:
                    t = _ax_get(focused, _AX_TITLE)
                    if t:
                        title = str(t)

            return WindowInfo(
                app_name     = app_name,
                window_title = title,
                pid          = pid,
                handle       = ax_app,
            )
        except Exception as e:
            log(f"[PLATFORM-macOS] get_active_window: {e}")
            return None

    # ── Window text ────────────────────────────────────────────────────────────

    def get_window_text(self, window: WindowInfo) -> str:
        if not _AX or window.handle is None:
            return ""
        parts: list[str] = []
        try:
            ax_app  = window.handle
            focused = _ax_get(ax_app, _AX_FOCUSED_WINDOW)
            root    = focused or ax_app
            _ax_walk_text(root, parts, max_depth=10)
        except Exception as e:
            log(f"[PLATFORM-macOS] get_window_text: {e}")

        combined = "\n".join(dict.fromkeys(parts))
        return combined[:4000]

    # ── Hotkeys ────────────────────────────────────────────────────────────────

    def _start_listener(self):
        if not _PYNPUT:
            return

        def on_press(key):
            self._pressed.add(key)
            now = time.time()
            with self._lock:
                for hid, (req_mods, req_char) in self._hotkeys.items():
                    if self._matches(req_mods, req_char):
                        if now - self._last_fired.get(hid, 0) >= self._DEBOUNCE_S:
                            self._last_fired[hid] = now
                            self._hq.put(hid)
                        break

        def on_release(key):
            self._pressed.discard(key)

        self._listener = _pynput_kb.Listener(
            on_press=on_press, on_release=on_release)
        self._listener.daemon = True
        self._listener.start()

    def _matches(self, req_mods: frozenset, req_char: str) -> bool:
        """True if currently pressed keys satisfy the hotkey combination."""
        # Check all required modifiers are held
        for mod_key in req_mods:
            held = any(
                k == mod_key or
                (hasattr(k, 'vk') and hasattr(mod_key, 'vk') and k.vk == mod_key.vk)
                for k in self._pressed
            )
            if not held:
                return False
        # Check the character key is pressed
        char_held = any(
            (hasattr(k, 'char') and k.char == req_char)
            for k in self._pressed
        )
        return char_held

    def register_hotkey(self, hotkey_id: int, modifiers: int, vk: int) -> bool:
        if not _PYNPUT:
            return False
        char = _VK_TO_CHAR.get(vk)
        if char is None:
            log(f"[PLATFORM-macOS] unsupported VK code: {vk:#x}")
            return False

        mods = frozenset(
            pynput_key
            for bit, pynput_key in _MOD_TO_PYNPUT.items()
            if modifiers & bit
        )
        with self._lock:
            self._hotkeys[hotkey_id] = (mods, char)
        log(f"[PLATFORM-macOS] hotkey {hotkey_id} registered")
        return True

    def unregister_hotkey(self, hotkey_id: int) -> None:
        with self._lock:
            self._hotkeys.pop(hotkey_id, None)

    def poll_hotkey(self) -> Optional[int]:
        try:
            return self._hq.get_nowait()
        except queue.Empty:
            return None

    def stop(self):
        with self._lock:
            self._hotkeys.clear()
        if self._listener:
            try:
                self._listener.stop()
            except Exception:
                pass

    # ── Cursor ─────────────────────────────────────────────────────────────────

    def get_cursor_position(self) -> tuple[int, int]:
        try:
            if _APPKIT:
                pt = AppKit.NSEvent.mouseLocation()
                # NSEvent uses bottom-left origin; convert to top-left
                screen_h = AppKit.NSScreen.mainScreen().frame().size.height
                return (int(pt.x), int(screen_h - pt.y))
        except Exception:
            pass
        # pyautogui fallback
        x, y = pyautogui.position()
        return (x, y)

    def set_custom_cursor(self, cursor_path: str) -> bool:
        # macOS cursors use .tiff or NSCursor named cursors, not .cur files.
        # Custom cursor via .tiff image:
        try:
            if not _APPKIT:
                return False
            img = AppKit.NSImage.alloc().initWithContentsOfFile_(cursor_path)
            if not img:
                return False
            hot_spot = AppKit.NSMakePoint(0, 0)
            cursor   = AppKit.NSCursor.alloc().initWithImage_hotSpot_(img, hot_spot)
            cursor.set()
            return True
        except Exception as e:
            log(f"[PLATFORM-macOS] set_custom_cursor: {e}")
            return False

    def restore_default_cursor(self) -> None:
        try:
            if _APPKIT:
                AppKit.NSCursor.arrowCursor().set()
        except Exception:
            pass

    # ── Screen ─────────────────────────────────────────────────────────────────

    def capture_screenshot(self, region: Optional[tuple] = None) -> Image.Image:
        if region:
            return pyautogui.screenshot(region=region)
        return pyautogui.screenshot()

    def get_screen_size(self) -> tuple[int, int]:
        try:
            if _APPKIT:
                frame = AppKit.NSScreen.mainScreen().frame()
                return (int(frame.size.width), int(frame.size.height))
        except Exception:
            pass
        return pyautogui.size()

    # ── Form automation ────────────────────────────────────────────────────────

    def get_form_fields(self, window: WindowInfo) -> list:
        if not _AX or window.handle is None:
            return []
        fields: list[FormField] = []
        try:
            ax_app  = window.handle
            focused = _ax_get(ax_app, _AX_FOCUSED_WINDOW)
            root    = focused or ax_app
            _ax_walk_fields(root, fields, max_depth=8)
        except Exception as e:
            log(f"[PLATFORM-macOS] get_form_fields: {e}")

        # Sort top-to-bottom, left-to-right
        fields.sort(key=lambda f: (f.rect[1] if f.rect else 0,
                                   f.rect[0] if f.rect else 0))
        for i, f in enumerate(fields):
            f.index = i
        return fields

    def set_field_value(self, field: "object", value: str) -> bool:
        el = field.handle
        if not el or not _AX:
            return False
        try:
            # Method 1 — AXValue (works for native text fields)
            err = _AS.AXUIElementSetAttributeValue(el, _AX_VALUE, value)
            if err == 0:
                return True
        except Exception:
            pass
        # Method 2 — keyboard fallback
        try:
            self.focus_field(field)
            time.sleep(0.05)
            pyautogui.hotkey("command", "a")
            time.sleep(0.02)
            pyautogui.typewrite(value, interval=0.02)
            return True
        except Exception as e:
            log(f"[PLATFORM-macOS] set_field_value keyboard fallback: {e}")
            return False

    def focus_field(self, field: "object") -> None:
        el = field.handle
        if not el or not _AX:
            return
        try:
            _AS.AXUIElementSetAttributeValue(el, _AX_FOCUSED, True)
        except Exception:
            pass
        if field.rect:
            try:
                cx = (field.rect[0] + field.rect[2]) // 2
                cy = (field.rect[1] + field.rect[3]) // 2
                pyautogui.click(cx, cy)
            except Exception:
                pass
