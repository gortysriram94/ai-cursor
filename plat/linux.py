"""
plat/linux.py — Linux implementation of PlatformBase.

Required packages:
  pip install python-xlib pyatspi pynput mss pyautogui Pillow

Notes:
  • Wayland: xlib and XGrabKey only work under XWayland. Native Wayland
    requires separate wlroots/KDE/GNOME portal implementations (future work).
  • AT-SPI: requires the accessibility stack to be running.
    Enable via: gsettings set org.gnome.desktop.interface toolkit-accessibility true
"""

import queue
import threading
import time
from typing import Optional

import pyautogui
from PIL import Image

from .base import PlatformBase, WindowInfo, FormField
from log import log


# ── Optional imports ──────────────────────────────────────────────────────────

try:
    from Xlib import display as _Xdisplay, X as _X, Xatom as _Xatom
    _XLIB    = True
    _display = _Xdisplay.Display()
    _root    = _display.screen().root
    _xlock   = threading.Lock()   # Xlib is not thread-safe — all calls must hold this
except Exception:
    _XLIB    = False
    _display = None
    _root    = None
    _xlock   = threading.Lock()
    log("[PLATFORM-Linux] python-xlib not available — window detection limited")

try:
    import pyatspi as _atspi
    _ATSPI = True
    # Role.STATIC_TEXT is the correct constant — Role.STATIC does not exist in pyatspi 2.x
    _ATSPI_STATIC = _atspi.Role.STATIC_TEXT
except AttributeError:
    try:
        _ATSPI_STATIC = _atspi.Role.LABEL   # older pyatspi fallback
    except AttributeError:
        _ATSPI_STATIC = None
except ImportError:
    _ATSPI = False
    _ATSPI_STATIC = None
    log("[PLATFORM-Linux] pyatspi not available — text/form extraction disabled")

try:
    from pynput import keyboard as _pynput_kb
    _PYNPUT = True
except ImportError:
    _PYNPUT = False
    log("[PLATFORM-Linux] pynput not available — hotkeys disabled")

try:
    import mss as _mss
    _MSS = True
except ImportError:
    _MSS = False


# ── Win32 modifier bits → pynput ──────────────────────────────────────────────

_MOD_TO_PYNPUT: dict[int, "_pynput_kb.Key"] = {}
if _PYNPUT:
    _MOD_TO_PYNPUT = {
        0x0001: _pynput_kb.Key.alt,
        0x0002: _pynput_kb.Key.ctrl,
        0x0004: _pynput_kb.Key.shift,
        0x0008: _pynput_kb.Key.cmd,
    }

_VK_TO_CHAR = {
    **{0x41 + i: chr(ord('a') + i) for i in range(26)},
    **{0x30 + i: str(i)             for i in range(10)},
}

# AT-SPI role → control_type string
_ATSPI_ROLES: dict = {}
if _ATSPI:
    _ATSPI_ROLES = {
        _atspi.Role.TEXT:        "text",
        _atspi.Role.PASSWORD_TEXT: "password",
        _atspi.Role.ENTRY:       "text",
        _atspi.Role.COMBO_BOX:   "combobox",
        _atspi.Role.CHECK_BOX:   "checkbox",
    }
    _FILLABLE_ROLES_ATSPI = set(_ATSPI_ROLES.keys())


# ── AT-SPI helpers ────────────────────────────────────────────────────────────

def _atspi_pid(accessible) -> int:
    """Get process ID from an AT-SPI accessible — handles both API conventions."""
    try:
        return accessible.get_process_id()   # GObject-based pyatspi (newer)
    except AttributeError:
        pass
    try:
        return accessible.getProcessId()     # dbus-based pyatspi (older Ubuntu/Fedora)
    except Exception:
        return -1


def _atspi_get_text(accessible) -> str:
    """Extract text content from an AT-SPI accessible."""
    try:
        iface = accessible.queryText()
        return iface.getText(0, iface.characterCount) or ""
    except Exception:
        return ""


def _atspi_walk_text(accessible, parts: list, depth: int = 0, max_depth: int = 10):
    if depth > max_depth or accessible is None:
        return
    try:
        role = accessible.getRole()
        text_roles = {_atspi.Role.TEXT, _atspi.Role.ENTRY, _atspi.Role.PARAGRAPH}
        if _ATSPI_STATIC:
            text_roles.add(_ATSPI_STATIC)
        if role in text_roles:
            t = _atspi_get_text(accessible)
            if t.strip():
                parts.append(t.strip())
        for i in range(accessible.childCount):
            _atspi_walk_text(accessible.getChildAtIndex(i), parts, depth + 1, max_depth)
    except Exception:
        pass


def _atspi_walk_fields(accessible, fields: list, depth: int = 0, max_depth: int = 8):
    if depth > max_depth or accessible is None:
        return
    try:
        role = accessible.getRole()
        if role in _FILLABLE_ROLES_ATSPI:
            try:
                comp  = accessible.queryComponent()
                ext   = comp.getExtents(_atspi.CoordType.SCREEN)
                rect  = (ext.x, ext.y, ext.x + ext.width, ext.y + ext.height)
                if ext.width < 4 or ext.height < 4:
                    return
            except Exception:
                rect = ()

            label       = accessible.name or ""
            current_val = _atspi_get_text(accessible)
            ctrl_str    = _ATSPI_ROLES.get(role, "text")

            fields.append(FormField(
                index           = len(fields),
                label           = label.strip(),
                placeholder     = "",
                current_value   = current_val,
                suggested_value = "",
                control_type    = ctrl_str,
                handle          = accessible,
                rect            = rect,
            ))
        for i in range(accessible.childCount):
            _atspi_walk_fields(accessible.getChildAtIndex(i), fields, depth + 1, max_depth)
    except Exception:
        pass


# ── Platform implementation ────────────────────────────────────────────────────

class LinuxPlatform(PlatformBase):

    def __init__(self):
        self._hq      = queue.Queue()
        self._hotkeys: dict[int, tuple] = {}  # id -> (frozenset_mods, char)
        self._pressed: set              = set()
        self._lock    = threading.Lock()
        if _PYNPUT:
            self._start_listener()

    @property
    def name(self) -> str:
        return "linux"

    # ── Active window ──────────────────────────────────────────────────────────

    def get_active_window(self) -> Optional[WindowInfo]:
        if not _XLIB or _display is None:
            return None
        try:
            with _xlock:
                net_active = _display.intern_atom("_NET_ACTIVE_WINDOW")
                prop = _root.get_full_property(net_active, _X.AnyPropertyType)
                if not prop or not prop.value:
                    return None
                xid = prop.value[0]
                win = _display.create_resource_object("window", xid)

                net_name  = _display.intern_atom("_NET_WM_NAME")
                utf8_atom = _display.intern_atom("UTF8_STRING")
                title_prop = win.get_full_property(net_name, utf8_atom)
                if title_prop and title_prop.value:
                    title = title_prop.value.decode("utf-8", errors="replace")
                else:
                    title = win.get_wm_name() or ""

                net_pid  = _display.intern_atom("_NET_WM_PID")
                pid_prop = win.get_full_property(net_pid, _X.AnyPropertyType)
                pid      = int(pid_prop.value[0]) if pid_prop and pid_prop.value else 0

                wm_class = win.get_wm_class()
                app_name = (wm_class[1] if wm_class and len(wm_class) > 1
                            else (wm_class[0] if wm_class else ""))

            return WindowInfo(
                app_name     = app_name,
                window_title = title,
                pid          = pid,
                handle       = (xid, pid),
            )
        except Exception as e:
            log(f"[PLATFORM-Linux] get_active_window: {e}")
            return None

    # ── Window text ────────────────────────────────────────────────────────────

    def get_window_text(self, window: WindowInfo) -> str:
        if not _ATSPI:
            return ""
        parts: list[str] = []
        try:
            _, pid = window.handle if isinstance(window.handle, tuple) else (None, window.pid)
            if not pid:
                return ""
            desktop = _atspi.Registry.getDesktop(0)
            for app_idx in range(desktop.childCount):
                app = desktop.getChildAtIndex(app_idx)
                try:
                    if _atspi_pid(app) == pid:
                        _atspi_walk_text(app, parts, max_depth=10)
                        break
                except Exception:
                    continue
        except Exception as e:
            log(f"[PLATFORM-Linux] get_window_text: {e}")

        combined = "\n".join(dict.fromkeys(parts))
        return combined[:4000]

    # ── Hotkeys ────────────────────────────────────────────────────────────────

    def _start_listener(self):
        if not _PYNPUT:
            return

        def on_press(key):
            self._pressed.add(key)
            with self._lock:
                for hid, (req_mods, req_char) in self._hotkeys.items():
                    if self._matches(req_mods, req_char):
                        self._hq.put(hid)
                        break

        def on_release(key):
            self._pressed.discard(key)

        listener = _pynput_kb.Listener(on_press=on_press, on_release=on_release)
        listener.daemon = True
        listener.start()

    def _matches(self, req_mods: frozenset, req_char: str) -> bool:
        for mod_key in req_mods:
            held = any(
                k == mod_key or
                (hasattr(k, 'vk') and hasattr(mod_key, 'vk') and k.vk == mod_key.vk)
                for k in self._pressed
            )
            if not held:
                return False
        return any(hasattr(k, 'char') and k.char == req_char for k in self._pressed)

    def register_hotkey(self, hotkey_id: int, modifiers: int, vk: int) -> bool:
        if not _PYNPUT:
            return False
        char = _VK_TO_CHAR.get(vk)
        if char is None:
            log(f"[PLATFORM-Linux] unsupported VK code: {vk:#x}")
            return False
        mods = frozenset(
            pynput_key
            for bit, pynput_key in _MOD_TO_PYNPUT.items()
            if modifiers & bit
        )
        with self._lock:
            self._hotkeys[hotkey_id] = (mods, char)
        log(f"[PLATFORM-Linux] hotkey {hotkey_id} registered")
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
        if _XLIB and _display:
            try:
                with _xlock:
                    _display.close()
            except Exception:
                pass

    # ── Cursor ─────────────────────────────────────────────────────────────────

    def get_cursor_position(self) -> tuple[int, int]:
        try:
            if _XLIB and _display:
                with _xlock:
                    data = _root.query_pointer()
                return (data.root_x, data.root_y)
        except Exception:
            pass
        x, y = pyautogui.position()
        return (x, y)

    def set_custom_cursor(self, cursor_path: str) -> bool:
        # X11 cursor theming requires writing Xcursor files and calling XDefineCursor.
        # For now, pyautogui doesn't expose this — return False gracefully.
        log("[PLATFORM-Linux] set_custom_cursor: not implemented (X11 Xcursor required)")
        return False

    def restore_default_cursor(self) -> None:
        try:
            if _XLIB and _display:
                _root.define_cursor(_X.None_)
                _display.flush()
        except Exception:
            pass

    # ── Screen ─────────────────────────────────────────────────────────────────

    def capture_screenshot(self, region: Optional[tuple] = None) -> Image.Image:
        if _MSS:
            with _mss.mss() as sct:
                if region:
                    left, top, width, height = region
                    monitor = {"top": top, "left": left, "width": width, "height": height}
                else:
                    monitor = sct.monitors[1]  # primary monitor
                shot = sct.grab(monitor)
                return Image.frombytes("RGB", shot.size, shot.raw, "raw", "BGRX")
        if region:
            return pyautogui.screenshot(region=region)
        return pyautogui.screenshot()

    def get_screen_size(self) -> tuple[int, int]:
        try:
            if _XLIB and _display:
                with _xlock:
                    screen = _display.screen()
                    return (screen.width_in_pixels, screen.height_in_pixels)
        except Exception:
            pass
        return pyautogui.size()

    # ── Form automation ────────────────────────────────────────────────────────

    def get_form_fields(self, window: WindowInfo) -> list:
        if not _ATSPI:
            return []
        fields: list[FormField] = []
        try:
            _, pid = window.handle if isinstance(window.handle, tuple) else (None, window.pid)
            if not pid:
                return []
            desktop = _atspi.Registry.getDesktop(0)
            for app_idx in range(desktop.childCount):
                app = desktop.getChildAtIndex(app_idx)
                try:
                    if _atspi_pid(app) == pid:
                        _atspi_walk_fields(app, fields, max_depth=8)
                        break
                except Exception:
                    continue
        except Exception as e:
            log(f"[PLATFORM-Linux] get_form_fields: {e}")

        fields.sort(key=lambda f: (f.rect[1] if f.rect else 0,
                                   f.rect[0] if f.rect else 0))
        for i, f in enumerate(fields):
            f.index = i
        return fields

    def set_field_value(self, field: "object", value: str) -> bool:
        if not _ATSPI or field.handle is None:
            return False
        try:
            iface = field.handle.queryEditableText()
            iface.setTextContents(value)
            return True
        except Exception:
            pass
        # Keyboard fallback
        try:
            self.focus_field(field)
            time.sleep(0.05)
            pyautogui.hotkey("ctrl", "a")
            time.sleep(0.02)
            pyautogui.typewrite(value, interval=0.02)
            return True
        except Exception as e:
            log(f"[PLATFORM-Linux] set_field_value keyboard fallback: {e}")
            return False

    def focus_field(self, field: "object") -> None:
        if field.handle is None:
            return
        try:
            if _ATSPI:
                field.handle.queryComponent().grabFocus()
        except Exception:
            pass
        if field.rect:
            try:
                cx = (field.rect[0] + field.rect[2]) // 2
                cy = (field.rect[1] + field.rect[3]) // 2
                pyautogui.click(cx, cy)
            except Exception:
                pass
