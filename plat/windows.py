"""
platform/windows.py — Win32 implementation of PlatformBase.

Consolidates all Windows-specific code that was previously scattered
across main.py, hover.py, ui/icons.py, and capture.py.
"""

import ctypes
import ctypes.wintypes
import queue
import threading
import time
from typing import Optional

import pyautogui
from PIL import Image

from .base import PlatformBase, WindowInfo
from log import log


# ── Win32 constants ────────────────────────────────────────────────────────────

OCR_NORMAL          = 32512
WM_HOTKEY           = 0x0312
WM_QUIT             = 0x0012
WM_POWERBROADCAST   = 0x0218   # sent on sleep/resume
PBT_APMRESUMEAUTOMATIC = 0x0012  # system resumed from sleep

# ── Optional win32 imports ─────────────────────────────────────────────────────

try:
    import win32gui
    import win32process
    import psutil
    _W32 = True
except ImportError:
    _W32 = False
    log("[PLATFORM] pywin32 not available — window detection limited")

# ── Optional UIA imports (reuses hover.py pattern) ────────────────────────────

try:
    import comtypes
    import comtypes.client
    comtypes.client.GetModule("UIAutomationCore.dll")
    import comtypes.gen.UIAutomationClient as _UIA_MOD
    _uia = comtypes.client.CreateObject(
        "{ff48dba4-60ef-4201-aa87-54103eef594e}",
        interface=_UIA_MOD.IUIAutomation,
    )
    _UIA = True
except Exception:
    _uia = None
    _UIA_MOD = None
    _UIA = False


# ── App name normaliser ────────────────────────────────────────────────────────

_EXE_NAMES = {
    "chrome.exe":   "Chrome",
    "msedge.exe":   "Edge",
    "firefox.exe":  "Firefox",
    "brave.exe":    "Brave",
    "code.exe":     "VS Code",
    "cursor.exe":   "Cursor",
    "slack.exe":    "Slack",
    "discord.exe":  "Discord",
    "outlook.exe":  "Outlook",
    "figma.exe":    "Figma",
    "notion.exe":   "Notion",
    "teams.exe":    "Teams",
    "zoom.exe":     "Zoom",
    "winword.exe":  "Word",
    "excel.exe":    "Excel",
    "powerpnt.exe": "PowerPoint",
    "explorer.exe": "Explorer",
    "powershell.exe": "PowerShell",
    "windowsterminal.exe": "Terminal",
}

def _clean_name(exe: str) -> str:
    return _EXE_NAMES.get(exe.lower(), exe.lower().replace(".exe", "").title())


# ── Platform implementation ────────────────────────────────────────────────────

class WindowsPlatform(PlatformBase):

    # Internal message ID for cross-thread registration requests
    _WM_REG = 0x0401   # WM_USER + 1

    def __init__(self):
        self._user32         = ctypes.windll.user32
        self._kernel32       = ctypes.windll.kernel32
        self._hq:      queue.Queue       = queue.Queue()
        self._reg_q:   queue.Queue       = queue.Queue()
        self._tid      = [0]
        self._hotkeys: set[int]          = set()
        self._hotkey_params: dict[int, tuple] = {}  # id -> (mods, vk) for re-registration
        self._start_hotkey_thread()

    @property
    def name(self) -> str:
        return "windows"

    # ── Active window ──────────────────────────────────────────────────────────

    def get_active_window(self) -> Optional[WindowInfo]:
        if not _W32:
            return None
        try:
            hwnd  = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            try:
                exe = psutil.Process(pid).name()
            except Exception:
                exe = ""
            return WindowInfo(
                app_name=_clean_name(exe),
                window_title=title,
                pid=pid,
                handle=hwnd,
            )
        except Exception as e:
            log(f"[PLATFORM] get_active_window: {e}")
            return None

    # ── Window text ────────────────────────────────────────────────────────────

    def get_window_text(self, window: WindowInfo) -> str:
        """
        Two-pass text extraction:
        1. UIA TextPattern on the root element (catches web content, documents).
        2. EnumChildWindows fallback (catches native controls).
        """
        parts: list[str] = []
        hwnd = window.handle

        # Pass 1 — UIA
        if _UIA and hwnd:
            try:
                root = _uia.ElementFromHandle(hwnd)
                # Try TextPattern (documents, web pages, editors)
                try:
                    tp = root.GetCurrentPattern(10014)  # UIA_TextPatternId
                    if tp:
                        itp = tp.QueryInterface(_UIA_MOD.IUIAutomationTextPattern)
                        text = itp.DocumentRange.GetText(4000)
                        if text and text.strip():
                            parts.append(text.strip())
                except Exception:
                    pass
                # Walk direct children for Name/Value (forms, toolbars)
                if not parts:
                    try:
                        children = root.FindAll(
                            _UIA_MOD.TreeScope_Children,
                            _uia.CreateTrueCondition(),
                        )
                        for i in range(min(children.Length, 30)):
                            el = children.GetElement(i)
                            for attr in ("CurrentName", "CurrentValue"):
                                try:
                                    val = getattr(el, attr, "") or ""
                                    if val.strip():
                                        parts.append(val.strip())
                                except Exception:
                                    pass
                    except Exception:
                        pass
            except Exception:
                pass

        # Pass 2 — EnumChildWindows fallback
        if not parts and _W32 and hwnd:
            child_texts: list[str] = []
            def _cb(h, _):
                try:
                    t = win32gui.GetWindowText(h)
                    if t and t.strip():
                        child_texts.append(t.strip())
                except Exception:
                    pass
            try:
                win32gui.EnumChildWindows(hwnd, _cb, None)
                parts.extend(child_texts)
            except Exception:
                pass

        combined = "\n".join(dict.fromkeys(parts))  # deduplicate, preserve order
        return combined[:4000]

    # ── Hotkeys ────────────────────────────────────────────────────────────────

    def _start_hotkey_thread(self):
        t = threading.Thread(target=self._hotkey_loop, daemon=True, name="hotkey")
        t.start()

    def _hotkey_loop(self):
        self._tid[0] = self._kernel32.GetCurrentThreadId()
        # Drain any registrations that arrived before the loop started
        self._drain_reg_queue()

        msg = ctypes.wintypes.MSG()
        while True:
            ret = self._user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret == 0 or ret == -1:
                break
            if msg.message == WM_HOTKEY:
                self._hq.put(int(msg.wParam))
            elif msg.message == self._WM_REG:
                self._drain_reg_queue()
            elif msg.message == WM_POWERBROADCAST:
                # System resumed from sleep — Windows unregisters all hotkeys
                # on suspend; re-register every known hotkey on resume.
                if msg.wParam == PBT_APMRESUMEAUTOMATIC:
                    self._reregister_all()
            self._user32.TranslateMessage(ctypes.byref(msg))
            self._user32.DispatchMessageW(ctypes.byref(msg))
        self._tid[0] = 0

    def _drain_reg_queue(self):
        """Execute all pending register/unregister ops in the hotkey thread."""
        while True:
            try:
                op, hid, mods, vk = self._reg_q.get_nowait()
            except queue.Empty:
                break
            if op == "reg":
                ok = bool(self._user32.RegisterHotKey(None, hid, mods, vk))
                if ok:
                    log(f"[PLATFORM] hotkey {hid} registered")
                else:
                    log(f"[PLATFORM] RegisterHotKey {hid} failed (key in use?)")
                    import state as _state
                    _state.hotkey_registration_failed = True
            elif op == "unreg":
                self._user32.UnregisterHotKey(None, hid)

    def _reregister_all(self):
        """Re-register all known hotkeys after sleep/wake resume."""
        log("[PLATFORM] wake detected — re-registering hotkeys")
        for hid, (mods, vk) in list(self._hotkey_params.items()):
            ok = bool(self._user32.RegisterHotKey(None, hid, mods, vk))
            if not ok:
                log(f"[PLATFORM] re-register {hid} failed")

    def register_hotkey(self, hotkey_id: int, modifiers: int, vk: int) -> bool:
        """
        Queue a RegisterHotKey call for execution inside the hotkey thread.
        Win32 requires RegisterHotKey and GetMessageW to run in the same thread.
        """
        self._hotkeys.add(hotkey_id)
        self._hotkey_params[hotkey_id] = (modifiers, vk)   # saved for sleep/wake re-reg
        self._reg_q.put(("reg", hotkey_id, modifiers, vk))
        # If thread is already spinning, wake it with a posted message
        tid = self._tid[0]
        if tid:
            self._user32.PostThreadMessageW(tid, self._WM_REG, 0, 0)
        return True  # actual result logged inside _drain_reg_queue

    def unregister_hotkey(self, hotkey_id: int) -> None:
        self._hotkeys.discard(hotkey_id)
        self._hotkey_params.pop(hotkey_id, None)
        self._reg_q.put(("unreg", hotkey_id, 0, 0))
        tid = self._tid[0]
        if tid:
            self._user32.PostThreadMessageW(tid, self._WM_REG, 0, 0)

    def poll_hotkey(self) -> Optional[int]:
        try:
            return self._hq.get_nowait()
        except queue.Empty:
            return None

    def stop(self):
        """Unregister all hotkeys and shut down the message loop."""
        for hid in list(self._hotkeys):
            self.unregister_hotkey(hid)
        tid = self._tid[0]
        if tid:
            self._user32.PostThreadMessageW(tid, WM_QUIT, 0, 0)

    # ── Cursor ─────────────────────────────────────────────────────────────────

    def get_cursor_position(self) -> tuple[int, int]:
        pt = ctypes.wintypes.POINT()
        self._user32.GetCursorPos(ctypes.byref(pt))
        return (pt.x, pt.y)

    def set_custom_cursor(self, cursor_path: str) -> bool:
        try:
            hcur = self._user32.LoadCursorFromFileW(cursor_path)
            if not hcur:
                return False
            self._user32.SetSystemCursor(hcur, OCR_NORMAL)
            return True
        except Exception as e:
            log(f"[PLATFORM] set_custom_cursor: {e}")
            return False

    def restore_default_cursor(self) -> None:
        self._user32.SystemParametersInfoW(0x0057, 0, None, 0)  # SPI_SETCURSORS

    # ── Screen ─────────────────────────────────────────────────────────────────

    def capture_screenshot(self, region: Optional[tuple] = None) -> Image.Image:
        if region:
            return pyautogui.screenshot(region=region)
        return pyautogui.screenshot()

    def get_screen_size(self) -> tuple[int, int]:
        return (
            self._user32.GetSystemMetrics(0),  # SM_CXSCREEN
            self._user32.GetSystemMetrics(1),  # SM_CYSCREEN
        )

    # ── Form automation ────────────────────────────────────────────────────────

    # UIA control type IDs
    _CT_EDIT      = 50004
    _CT_COMBOBOX  = 50003
    _CT_CHECKBOX  = 50002
    _CT_RADIO     = 50012
    _CT_STATIC    = 50020   # StaticText (labels)
    _CT_PASSWORD  = 50004   # Edit with IsPassword=True

    def get_form_fields(self, window: WindowInfo) -> "list":
        """
        Scan the window for fillable input controls using IUIAutomation.
        Returns a list of FormField objects sorted top-to-bottom.
        """
        from .base import FormField
        if not _UIA or not window.handle:
            return []

        fields: list[FormField] = []
        try:
            root = _uia.ElementFromHandle(window.handle)

            # Find all Edit and ComboBox descendants
            fillable = (self._CT_EDIT, self._CT_COMBOBOX, self._CT_CHECKBOX)
            condition = _uia.CreateOrCondition(
                _uia.CreatePropertyCondition(30003, self._CT_EDIT),      # UIA_ControlTypePropertyId
                _uia.CreateOrCondition(
                    _uia.CreatePropertyCondition(30003, self._CT_COMBOBOX),
                    _uia.CreatePropertyCondition(30003, self._CT_CHECKBOX),
                )
            )
            elements = root.FindAll(
                _UIA_MOD.TreeScope_Descendants, condition
            )

            for i in range(elements.Length):
                el = elements.GetElement(i)
                try:
                    rect   = el.CurrentBoundingRectangle
                    box    = (rect.left, rect.top, rect.right, rect.bottom)
                    # Skip invisible / zero-size elements
                    if rect.right - rect.left < 4 or rect.bottom - rect.top < 4:
                        continue

                    ct     = el.CurrentControlType
                    label  = self._get_field_label(el, root)
                    placeholder = ""
                    try:
                        placeholder = el.CurrentHelpText or ""
                    except Exception:
                        pass

                    current_val = ""
                    try:
                        vp = el.GetCurrentPattern(10002)  # UIA_ValuePatternId
                        if vp:
                            iv = vp.QueryInterface(_UIA_MOD.IUIAutomationValuePattern)
                            current_val = iv.CurrentValue or ""
                    except Exception:
                        pass

                    # Determine control type string
                    if ct == self._CT_CHECKBOX:
                        ctrl_str = "checkbox"
                    elif ct == self._CT_COMBOBOX:
                        ctrl_str = "combobox"
                    else:
                        try:
                            is_pw = el.CurrentIsPassword
                        except Exception:
                            is_pw = False
                        ctrl_str = "password" if is_pw else "text"

                    fields.append(FormField(
                        index           = len(fields),
                        label           = label,
                        placeholder     = placeholder,
                        current_value   = current_val,
                        suggested_value = "",
                        control_type    = ctrl_str,
                        handle          = el,
                        rect            = box,
                    ))
                except Exception:
                    continue

        except Exception as e:
            log(f"[PLATFORM] get_form_fields: {e}")

        # Sort top-to-bottom, left-to-right
        fields.sort(key=lambda f: (f.rect[1] if f.rect else 0,
                                   f.rect[0] if f.rect else 0))
        # Re-index after sort
        for i, f in enumerate(fields):
            f.index = i
        return fields

    def _get_field_label(self, el, root) -> str:
        """
        Find the label text associated with a form field.
        Tries (in order): element Name, preceding sibling StaticText,
        parent container label.
        """
        # 1. Element's own Name property (often set in web apps via aria-label)
        try:
            name = el.CurrentName
            if name and name.strip():
                return name.strip()
        except Exception:
            pass

        # 2. Look for a preceding StaticText sibling
        try:
            walker = _uia.ControlViewWalker
            prev = walker.GetPreviousSiblingElement(el)
            if prev and prev.CurrentControlType == self._CT_STATIC:
                lbl = prev.CurrentName or ""
                if lbl.strip():
                    return lbl.strip()
        except Exception:
            pass

        # 3. Parent group/pane label
        try:
            walker = _uia.ControlViewWalker
            parent = walker.GetParentElement(el)
            if parent:
                plbl = parent.CurrentName or ""
                if plbl.strip() and len(plbl) < 60:
                    return plbl.strip()
        except Exception:
            pass

        return ""

    def set_field_value(self, field: "object", value: str) -> bool:
        """Write value into the field using ValuePattern, falling back to keyboard."""
        el = field.handle
        if not el:
            return False
        try:
            # Method 1 — ValuePattern (native + web inputs)
            vp = el.GetCurrentPattern(10002)  # UIA_ValuePatternId
            if vp:
                iv = vp.QueryInterface(_UIA_MOD.IUIAutomationValuePattern)
                if not iv.CurrentIsReadOnly:
                    iv.SetValue(value)
                    return True
        except Exception:
            pass

        # Method 2 — keyboard fallback
        try:
            self.focus_field(field)
            time.sleep(0.05)
            import pyautogui as _pg
            _pg.hotkey("ctrl", "a")
            time.sleep(0.02)
            _pg.typewrite(value, interval=0.02)
            return True
        except Exception as e:
            log(f"[PLATFORM] set_field_value keyboard fallback failed: {e}")
            return False

    def focus_field(self, field: "object") -> None:
        """Focus the field and scroll it into view."""
        el = field.handle
        if not el:
            return
        try:
            el.SetFocus()
        except Exception:
            pass
        # Click the centre of the field's bounding rect as a fallback
        if field.rect:
            try:
                cx = (field.rect[0] + field.rect[2]) // 2
                cy = (field.rect[1] + field.rect[3]) // 2
                import pyautogui as _pg
                _pg.click(cx, cy)
            except Exception:
                pass
