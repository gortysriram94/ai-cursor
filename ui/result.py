"""
ui/result.py — show_result_window + all visual dashboard renderers.
"""

import re
import time
import threading
import webbrowser
import urllib.parse

import tkinter as tk
import tkinter.ttk as ttk
import pyperclip
import pyautogui

from config import (
    WIN32_AVAILABLE, VISUAL_ACTIONS, HYPERLINK_ACTIONS,
    COPY_PRIMARY_ACTIONS, REPLACE_ACTIONS, TONE_INSTRUCTIONS,
)
from log import log
import state
from storage import save_history, save_style_sample
from ai import (
    call_ai_streaming, call_ai_vision_streaming, call_link_aware_streaming,
    is_vision_model_available, _call_ai_simple,
)
from prompts import get_inspect_prompt
from hyperlinks import (
    _extract_urls, enrich_with_hyperlinks, _render_markdown_links,
)
from capture import capture_screenshot_b64, extract_dominant_colors
from ui.icons import (
    PAW_COLOR, PAW_COLOR_DARK, PAW_COLOR_SOFT, create_paw_photo,
)


# ── Smart Dispatch helpers ────────────────────────────────────────────────────

def _get_running_apps() -> set[str]:
    """Return set of lowercase exe names for running processes."""
    try:
        import psutil
        return {p.info["name"].lower()
                for p in psutil.process_iter(["name"])
                if p.info.get("name")}
    except Exception:
        return set()


_APP_DISPATCH = [
    ("slack.exe",    "→ Slack",    "slack"),
    ("notion.exe",   "→ Notion",   "notion"),
    ("obsidian.exe", "→ Obsidian", "obsidian"),
    ("discord.exe",  "→ Discord",  "discord"),
    ("teams.exe",    "→ Teams",    "teams"),
    ("code.exe",     "→ VS Code",  "vscode"),
]

# Content types where Copy is the primary action (analytical output)
_COPY_PRIMARY_CONTENT = {
    "earnings_release", "trade_thesis", "property_listing",
    "research_report", "job_posting", "key_takeaways",
    "pros_cons", "legal_contract", "explain_contract",
}


def _bring_app_forward(key: str) -> None:
    """Copy to clipboard then bring the target app window to the foreground."""
    _KEY_TO_EXE = {
        "slack":    "slack.exe",
        "notion":   "notion.exe",
        "obsidian": "obsidian.exe",
        "discord":  "discord.exe",
        "teams":    "teams.exe",
        "vscode":   "code.exe",
    }
    exe = _KEY_TO_EXE.get(key, "")
    if not exe or not WIN32_AVAILABLE:
        return
    try:
        import win32gui
        import win32process
        import psutil as _ps

        target_hwnd = [None]

        def _cb(hwnd, _):
            if not win32gui.IsWindowVisible(hwnd):
                return
            try:
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                name = _ps.Process(pid).name().lower()
                if name == exe and target_hwnd[0] is None:
                    target_hwnd[0] = hwnd
            except Exception:
                pass

        win32gui.EnumWindows(_cb, None)
        if target_hwnd[0]:
            win32gui.SetForegroundWindow(target_hwnd[0])
    except Exception as e:
        log(f"[DISPATCH] bring_forward failed for {key}: {e}")


# ── Visual result color palette ───────────────────────────────────────────────

_VR_BG      = "#1A1611"
_VR_SURFACE = "#211E18"
_VR_HOVER   = "#2A2620"
_VR_BORDER  = "#38332A"
_VR_FG      = "#F0EAE0"
_VR_DIM     = "#C8BEB0"
_VR_MUTED   = "#5A504A"
_VR_ACCENT  = "#DA7756"
_VR_GREEN   = "#4a8c5c"
_VR_GREEN_B = "#2a5c38"
_VR_RED     = "#8b3a3a"
_VR_RED_B   = "#5c2020"
_VR_YELLOW  = "#b89440"


# ── Scrollable canvas helper ──────────────────────────────────────────────────

def _vr_scrollable(parent: tk.Frame, height: int = 220) -> tuple:
    canvas = tk.Canvas(parent, bg=_VR_BG, highlightthickness=0,
                       height=height, bd=0)
    sb = tk.Scrollbar(parent, orient="vertical", command=canvas.yview, width=6)
    canvas.configure(yscrollcommand=sb.set)
    inner  = tk.Frame(canvas, bg=_VR_BG)
    win_id = canvas.create_window((0, 0), window=inner, anchor="nw")

    def _on_inner(e):
        canvas.configure(scrollregion=canvas.bbox("all"))
        if inner.winfo_reqheight() > height:
            sb.pack(side="right", fill="y")
        else:
            sb.pack_forget()

    def _on_canvas(e):
        canvas.itemconfig(win_id, width=e.width)

    inner.bind("<Configure>",  _on_inner)
    canvas.bind("<Configure>", _on_canvas)
    canvas.bind("<MouseWheel>", lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
    inner.bind( "<MouseWheel>", lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
    canvas.pack(side="left", fill="both", expand=True)
    return canvas, inner


# ── Visual card primitives ────────────────────────────────────────────────────

def _vr_section_label(parent, text, color=None):
    tk.Label(parent, text=text, bg=_VR_BG,
             fg=color or _VR_ACCENT,
             font=("Segoe UI", 9, "bold"),
             anchor="w").pack(fill="x", padx=14, pady=(10, 3))


def _vr_bullet(parent, text, color=None, indent=14):
    row = tk.Frame(parent, bg=_VR_BG)
    row.pack(fill="x", padx=indent, pady=1)
    tk.Label(row, text="·", bg=_VR_BG, fg=color or _VR_DIM,
             font=("Segoe UI", 10), width=2).pack(side="left", anchor="nw")
    tk.Label(row, text=text.strip(), bg=_VR_BG, fg=_VR_FG,
             font=("Segoe UI", 9), wraplength=280,
             justify="left", anchor="nw").pack(side="left", fill="x", expand=True)


def _vr_field_row(parent, label, value):
    row = tk.Frame(parent, bg=_VR_SURFACE, padx=12, pady=7)
    row.pack(fill="x", padx=10, pady=2)
    tk.Label(row, text=label, bg=_VR_SURFACE, fg=_VR_MUTED,
             font=("Segoe UI", 8, "bold"), width=12, anchor="w").pack(side="left")
    tk.Label(row, text=value, bg=_VR_SURFACE, fg=_VR_FG,
             font=("Segoe UI", 9), wraplength=230,
             justify="left", anchor="w").pack(side="left", fill="x", expand=True)


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _parse_bullets(text: str) -> list[str]:
    items = []
    for line in text.split("\n"):
        s = line.strip()
        if s and s[0] in "-•*·" and len(s) > 2:
            items.append(s[1:].strip().lstrip(" "))
        elif re.match(r"^\d+\.\s", s):
            items.append(re.sub(r"^\d+\.\s*", "", s))
    return items


def _parse_sections(text: str, *headers) -> dict[str, list[str]]:
    result  = {h: [] for h in headers}
    current = None
    for line in text.split("\n"):
        low     = line.lower().strip()
        matched = next((h for h in headers if h.lower() in low), None)
        if matched:
            current = matched
        elif current and line.strip().startswith(("-", "•", "*", "·")):
            result[current].append(line.strip().lstrip("-•*· ").strip())
        elif current and line.strip() and not any(
                h.lower() in line.lower() for h in headers):
            if result[current]:
                result[current][-1] += " " + line.strip()
    return result


def _parse_labeled_fields(text: str, *field_names) -> dict[str, str]:
    fields = {}
    for field in field_names:
        pattern = (
            rf"(?:^|\n)\s*{re.escape(field)}\s*[:\-]\s*(.+?)"
            rf"(?=\n\s*(?:{'|'.join(field_names)})\s*[:\-]|\Z)"
        )
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            fields[field] = m.group(1).strip()
    return fields


# ── Card builders ─────────────────────────────────────────────────────────────

def _build_two_column(container, col1_title, col1_items,
                       col2_title, col2_items,
                       col1_color, col2_color, verdict=""):
    cols = tk.Frame(container, bg=_VR_BG)
    cols.pack(fill="x", padx=8, pady=4)

    left = tk.Frame(cols, bg=_VR_SURFACE, padx=10, pady=8)
    left.pack(side="left", fill="both", expand=True, padx=(0, 3))
    tk.Label(left, text=col1_title, bg=_VR_SURFACE, fg=col1_color,
             font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 4))
    for item in col1_items:
        row = tk.Frame(left, bg=_VR_SURFACE)
        row.pack(fill="x", pady=1)
        tk.Label(row, text="✓", bg=_VR_SURFACE, fg=col1_color,
                 font=("Segoe UI", 9), width=2).pack(side="left", anchor="nw")
        tk.Label(row, text=item, bg=_VR_SURFACE, fg=_VR_FG,
                 font=("Segoe UI", 9), wraplength=130,
                 justify="left", anchor="nw").pack(side="left", fill="x")

    right = tk.Frame(cols, bg=_VR_SURFACE, padx=10, pady=8)
    right.pack(side="left", fill="both", expand=True, padx=(3, 0))
    tk.Label(right, text=col2_title, bg=_VR_SURFACE, fg=col2_color,
             font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 4))
    for item in col2_items:
        row = tk.Frame(right, bg=_VR_SURFACE)
        row.pack(fill="x", pady=1)
        tk.Label(row, text="✗", bg=_VR_SURFACE, fg=col2_color,
                 font=("Segoe UI", 9), width=2).pack(side="left", anchor="nw")
        tk.Label(row, text=item, bg=_VR_SURFACE, fg=_VR_FG,
                 font=("Segoe UI", 9), wraplength=130,
                 justify="left", anchor="nw").pack(side="left", fill="x")

    if verdict:
        tk.Frame(container, bg=_VR_BORDER, height=1).pack(fill="x", padx=8, pady=(6, 0))
        vrow = tk.Frame(container, bg=_VR_HOVER, padx=12, pady=8)
        vrow.pack(fill="x", padx=8, pady=(0, 4))
        tk.Label(vrow, text="Verdict", bg=_VR_HOVER, fg=_VR_MUTED,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w")
        tk.Label(vrow, text=verdict, bg=_VR_HOVER, fg=_VR_FG,
                 font=("Segoe UI", 9), wraplength=300,
                 justify="left", anchor="w").pack(anchor="w")


def _build_score_card(container, big_label, big_color,
                       score_text="", details: list = None):
    top = tk.Frame(container, bg=_VR_SURFACE, padx=14, pady=14)
    top.pack(fill="x", padx=8, pady=(4, 2))
    tk.Label(top, text=big_label, bg=_VR_SURFACE, fg=big_color,
             font=("Segoe UI", 18, "bold")).pack(anchor="w")
    if score_text:
        tk.Label(top, text=score_text, bg=_VR_SURFACE, fg=_VR_DIM,
                 font=("Segoe UI", 9)).pack(anchor="w", pady=(2, 0))
    if details:
        for d in details[:6]:
            _vr_bullet(container, d)


def _build_hype_bar(container, score: int, details: list = None):
    top = tk.Frame(container, bg=_VR_SURFACE, padx=14, pady=12)
    top.pack(fill="x", padx=8, pady=(4, 2))
    tk.Label(top, text="Hype Score", bg=_VR_SURFACE, fg=_VR_MUTED,
             font=("Segoe UI", 8, "bold")).pack(anchor="w")
    tk.Label(top, text=f"{score}/10", bg=_VR_SURFACE, fg=_VR_ACCENT,
             font=("Segoe UI", 20, "bold")).pack(anchor="w")

    bar_frame = tk.Frame(top, bg=_VR_BORDER, height=6)
    bar_frame.pack(fill="x", pady=(6, 0))
    bar_frame.pack_propagate(False)

    def _draw_bar(e, s=score):
        w     = int(bar_frame.winfo_width() * s / 10)
        color = _VR_GREEN if s <= 4 else (_VR_YELLOW if s <= 7 else _VR_RED)
        tk.Frame(bar_frame, bg=color, width=w, height=6).place(x=0, y=0)

    bar_frame.bind("<Configure>", _draw_bar)

    if details:
        for d in details[:5]:
            _vr_bullet(container, d)


def _vr_code_block(parent: tk.Frame, label: str, code: str):
    if not code.strip():
        return
    _vr_section_label(parent, label)
    box = tk.Frame(parent, bg="#0f0e0c", padx=10, pady=8)
    box.pack(fill="x", padx=10, pady=(0, 6))
    tk.Label(box, text=code.strip(), bg="#0f0e0c", fg="#c8beb0",
             font=("Courier New", 8), justify="left", anchor="nw",
             wraplength=290).pack(anchor="w")


def _extract_code_section(response: str, heading: str) -> str:
    pattern = rf"^{re.escape(heading)}[:\s]*\n((?:[ \t]+.+\n?)+)"
    m = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
    if m:
        return m.group(1).strip()
    lines      = response.split("\n")
    collecting = False
    collected  = []
    for line in lines:
        if re.match(rf"^{re.escape(heading)}[:\s]*$", line, re.IGNORECASE):
            collecting = True
            continue
        if collecting:
            if re.match(r"^[A-Z][a-zA-Z /]+:", line):
                break
            collected.append(line)
    return "\n".join(collected).strip()


def _build_design_card(inner: tk.Frame, response: str, colors: list, mode: str = "art"):
    if colors:
        _vr_section_label(inner, "Colors detected")
        swatch_row = tk.Frame(inner, bg=_VR_BG)
        swatch_row.pack(fill="x", padx=14, pady=(2, 10))
        for hex_col in colors:
            col_frame = tk.Frame(swatch_row, bg=_VR_BG)
            col_frame.pack(side="left", padx=(0, 8))
            tk.Frame(col_frame, bg=hex_col, width=30, height=30,
                     relief="flat").pack()
            tk.Label(col_frame, text=hex_col, bg=_VR_BG, fg=_VR_MUTED,
                     font=("Courier", 7)).pack()

    if mode == "dev":
        _vr_section_label(inner, "Element")
        for field in ("Element type", "Typography", "Shape", "State"):
            pattern = rf"^{re.escape(field)}[:\s]+(.+?)$"
            m = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
            if m and m.group(1).strip():
                _vr_field_row(inner, field, m.group(1).strip())
        css = _extract_code_section(response, "CSS")
        _vr_code_block(inner, "CSS", css)
        tailwind_m = re.search(r"^Tailwind[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if tailwind_m:
            _vr_code_block(inner, "Tailwind", tailwind_m.group(1).strip())
        flutter = _extract_code_section(response, "Flutter/Dart") or _extract_code_section(response, "Flutter")
        _vr_code_block(inner, "Flutter / Dart", flutter)
        swift = _extract_code_section(response, "SwiftUI")
        _vr_code_block(inner, "SwiftUI", swift)
        android = _extract_code_section(response, "Android/XML") or _extract_code_section(response, "Android")
        _vr_code_block(inner, "Android / XML", android)
        notes_m = re.search(r"^Notes[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if notes_m:
            _vr_section_label(inner, "Notes", _VR_DIM)
            _vr_bullet(inner, notes_m.group(1).strip())

    elif mode == "design":
        _vr_section_label(inner, "Specs")
        for field in ("Element type", "Typography", "Colors", "Shape",
                      "Layout", "Design pattern", "State"):
            pattern = rf"^{re.escape(field)}[:\s]+(.+?)$"
            m = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
            if m and m.group(1).strip():
                _vr_field_row(inner, field, m.group(1).strip())
        figma = _extract_code_section(response, "Figma recreation")
        if figma:
            _vr_section_label(inner, "Figma recreation")
            for line in figma.split("\n"):
                line = re.sub(r"^\d+\.\s*", "", line.strip())
                if line:
                    _vr_bullet(inner, line)
        tokens_m = re.search(r"^Design tokens[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if tokens_m:
            _vr_code_block(inner, "Design tokens", tokens_m.group(1).strip())
        notes_m = re.search(r"^Notes[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if notes_m:
            _vr_section_label(inner, "Notes", _VR_DIM)
            _vr_bullet(inner, notes_m.group(1).strip())

    else:  # art
        _vr_section_label(inner, "Visual style")
        for field in ("Element type", "Artistic style", "Visual weight",
                      "Color mood", "Dominant tone"):
            pattern = rf"^{re.escape(field)}[:\s]+(.+?)$"
            m = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
            if m and m.group(1).strip():
                _vr_field_row(inner, field, m.group(1).strip())
        _vr_section_label(inner, "Lighting & materials")
        for field in ("Lighting", "Shadow", "Materials", "Depth", "Composition"):
            pattern = rf"^{re.escape(field)}[:\s]+(.+?)$"
            m = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
            if m and m.group(1).strip():
                _vr_field_row(inner, field, m.group(1).strip())
        feel_m   = re.search(r"^(?:Feel|Animation feel)[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        easing_m = re.search(r"^(?:Suggested easing|Easing)[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        motion_m = re.search(r"^(?:Natural motion|Motion)[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if any([feel_m, easing_m, motion_m]):
            _vr_section_label(inner, "Motion & animation")
            for label, m in [("Feel", feel_m), ("Easing", easing_m), ("Motion", motion_m)]:
                if m and m.group(1).strip():
                    _vr_field_row(inner, label, m.group(1).strip())
        ref_m = re.search(r"^(?:Style references|References)[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if ref_m:
            _vr_section_label(inner, "Style references", _VR_DIM)
            _vr_bullet(inner, ref_m.group(1).strip())
        notes_m = re.search(r"^Notes[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        if notes_m:
            _vr_bullet(inner, notes_m.group(1).strip())


# ── Visual result dispatcher ──────────────────────────────────────────────────

def _apply_visual_result(text_frame: tk.Frame, text_widget: tk.Text,
                          action: str, response: str, extra: dict | None = None):
    if action not in VISUAL_ACTIONS:
        return

    text_widget.pack_forget()
    for w in text_frame.winfo_children():
        try:
            w.destroy()
        except Exception:
            pass

    _, inner = _vr_scrollable(text_frame, height=220)

    if action == "pros_cons":
        sections = _parse_sections(response, "Pros", "Cons")
        _build_two_column(inner, "Pros", sections["Pros"],
                          "Cons", sections["Cons"],
                          _VR_GREEN, _VR_RED)

    elif action == "bull_bear":
        sections  = _parse_sections(response, "Bull Case", "Bear Case")
        verdict_m = re.search(r"Verdict[:\s]+(.+?)$", response, re.IGNORECASE | re.MULTILINE)
        verdict   = verdict_m.group(1).strip() if verdict_m else ""
        _build_two_column(inner, "🟢 Bull Case", sections["Bull Case"],
                          "🔴 Bear Case", sections["Bear Case"],
                          _VR_GREEN, _VR_RED, verdict=verdict)

    elif action == "sentiment":
        low = response.lower()
        if "bullish" in low:
            label, color = "BULLISH", _VR_GREEN
        elif "bearish" in low:
            label, color = "BEARISH", _VR_RED
        else:
            label, color = "NEUTRAL", _VR_YELLOW
        conv_m     = re.search(r"conviction[:\s]+(\w+)", response, re.IGNORECASE)
        score_text = conv_m.group(1).title() if conv_m else ""
        bullets    = _parse_bullets(response)
        _build_score_card(inner, label, color, score_text, bullets)

    elif action == "hype_score":
        score_m = re.search(r"(\d+)\s*/\s*10", response)
        score   = int(score_m.group(1)) if score_m else 5
        bullets = _parse_bullets(response)
        _build_hype_bar(inner, score, bullets)

    elif action == "trade_thesis":
        fields = _parse_labeled_fields(response, "Setup", "Catalyst", "Risk", "Timeframe")
        _vr_section_label(inner, "Trade Thesis")
        for label, value in fields.items():
            if value:
                _vr_field_row(inner, label, value)
        extras = _parse_bullets(response)
        if extras:
            _vr_section_label(inner, "Additional", _VR_DIM)
            for b in extras[:4]:
                _vr_bullet(inner, b)

    elif action in ("market_impact", "guidance_summary", "important_changes", "market_reaction"):
        fields = _parse_labeled_fields(
            response,
            "Immediate reaction", "Direction",
            "Who wins", "Who loses", "Key risk",
            "Revenue guidance", "EPS", "Verdict",
            "Initial reaction", "Bears", "Bulls",
        )
        _vr_section_label(inner, action.replace("_", " ").title())
        for label, value in fields.items():
            if value:
                _vr_field_row(inner, label, value)
        bullets = _parse_bullets(response)
        for b in bullets[:5]:
            _vr_bullet(inner, b)

    elif action in ("explain_contract", "contract_risks"):
        for emoji, title, color in [
            ("⚠️", "Key Risks",          _VR_RED),
            ("📅", "Important Deadlines", _VR_YELLOW),
            ("✅", "Protections",         _VR_GREEN),
        ]:
            pattern      = rf"{re.escape(emoji)}.*?(?:\n|$)(.*?)(?={re.escape('⚠️')}|{re.escape('📅')}|{re.escape('✅')}|\Z)"
            m            = re.search(pattern, response, re.DOTALL)
            section_text = m.group(1).strip() if m else ""
            bullets      = _parse_bullets(section_text) if section_text else []
            if bullets:
                _vr_section_label(inner, f"{emoji}  {title}", color)
                for b in bullets:
                    _vr_bullet(inner, b, color)

    elif action == "inspect":
        _ex = extra or {}
        _build_design_card(inner, response, _ex.get("colors", []), _ex.get("mode", "art"))

    else:
        bullets = _parse_bullets(response)
        label   = action.replace("_", " ").title()
        _vr_section_label(inner, label)
        if bullets:
            for b in bullets:
                _vr_bullet(inner, b)
        else:
            for para in response.strip().split("\n\n"):
                para = para.strip()
                if para:
                    tk.Label(inner, text=para, bg=_VR_BG, fg=_VR_FG,
                             font=("Segoe UI", 9), wraplength=300,
                             justify="left", anchor="w",
                             pady=4).pack(fill="x", padx=14)


# ── Themed scrollbar style (applied once) ────────────────────────────────────

def _apply_scrollbar_style():
    s = ttk.Style()
    try:
        s.theme_use("clam")
    except Exception:
        pass
    s.configure(
        "Flame.Vertical.TScrollbar",
        background=  "#3D3530",
        troughcolor= "#1A1611",
        arrowcolor=  "#5A4A42",
        bordercolor= "#1A1611",
        lightcolor=  "#3D3530",
        darkcolor=   "#1A1611",
        relief="flat",
        arrowsize=10,
    )
    s.map("Flame.Vertical.TScrollbar",
          background=[("active", "#5A4A42"), ("pressed", "#DA7756")])


_scrollbar_style_applied = [False]


# ── Rich content renderer (prose + code blocks) ───────────────────────────────

_CODE_BG  = "#0f0d0b"
_CODE_FG  = "#c8d4d8"
_CODE_HDR = "#1a1715"


def _render_rich_content(text_widget: tk.Text, response: str,
                          accent: str, surface: str, fg: str):
    """
    Re-render the AI response in the Text widget, distinguishing:
      • Prose paragraphs  — normal readable style
      • Code blocks       — dark bg, monospace, language label + copy button
    """
    import pyperclip as _clip

    text_widget.configure(state="normal")
    text_widget.delete("1.0", "end")

    # Configure text tags
    text_widget.tag_configure("prose",
        font=("Segoe UI", 10),
        foreground=fg,
        spacing1=3, spacing3=3,
        lmargin1=0, lmargin2=0)

    text_widget.tag_configure("code_text",
        font=("Consolas", 9),
        foreground=_CODE_FG,
        background=_CODE_BG,
        spacing1=2, spacing3=2,
        lmargin1=14, lmargin2=14,
        rmargin=10)

    text_widget.tag_configure("inline_code",
        font=("Consolas", 9),
        foreground=_CODE_FG,
        background="#1e1b18")

    text_widget.tag_configure("bold",
        font=("Segoe UI", 10, "bold"),
        foreground=fg)

    # Split on fenced code blocks
    parts = re.split(r"(```[\w]*\n[\s\S]*?```)", response)

    for part in parts:
        fence = re.match(r"```([\w]*)\n([\s\S]*?)```", part, re.DOTALL)
        if fence:
            lang = fence.group(1).strip() or "code"
            code = fence.group(2).rstrip()

            # Embed a header widget: [lang label]  [Copy]
            hdr_frame = tk.Frame(text_widget, bg=_CODE_HDR,
                                  padx=10, pady=4)
            lang_lbl = tk.Label(hdr_frame, text=lang.upper(),
                                 bg=_CODE_HDR, fg=accent,
                                 font=("Segoe UI", 7, "bold"))
            lang_lbl.pack(side="left")

            def _copy_code(c=code):
                try:
                    _clip.copy(c)
                except Exception:
                    pass  # clipboard contention — best effort
                copy_lbl.configure(text="✓ Copied")
                text_widget.after(1500,
                    lambda: copy_lbl.configure(text="Copy"))

            copy_lbl = tk.Label(hdr_frame, text="Copy",
                                 bg=_CODE_HDR, fg="#5A504A",
                                 font=("Segoe UI", 7),
                                 cursor="hand2")
            copy_lbl.pack(side="right")
            copy_lbl.bind("<Button-1>", lambda e, c=code: _copy_code(c))
            copy_lbl.bind("<Enter>",
                lambda e, l=copy_lbl: l.configure(fg=accent))
            copy_lbl.bind("<Leave>",
                lambda e, l=copy_lbl: l.configure(fg="#5A504A"))

            text_widget.insert("end", "\n")
            text_widget.window_create("end", window=hdr_frame,
                                       stretch=True)
            text_widget.insert("end", "\n" + code + "\n", "code_text")
            text_widget.insert("end", "\n")

        else:
            # Prose — handle inline `code`, **bold**, newlines
            if not part.strip():
                continue
            segments = re.split(r"(`[^`]+`|\*\*[^*]+\*\*)", part)
            for seg in segments:
                if seg.startswith("`") and seg.endswith("`"):
                    text_widget.insert("end", seg[1:-1], "inline_code")
                elif seg.startswith("**") and seg.endswith("**"):
                    text_widget.insert("end", seg[2:-2], "bold")
                else:
                    text_widget.insert("end", seg, "prose")

    text_widget.configure(state="disabled")


# ── Result window ─────────────────────────────────────────────────────────────

def show_result_window(root: tk.Tk, text: str, action: str, tone: str,
                       x: int, y: int,
                       screenshot: str = "",
                       custom_instruction: str = "",
                       target_hwnd=None,
                       on_back=None,
                       bundle=None,
                       proactive_result: str = ""):

    from brain.context_bundle import ContextBundle
    b        = bundle or ContextBundle.empty()
    app_name     = b.app_name
    context      = b.market or "generic"
    context_type = b.context_type or context

    R_BG      = "#1A1611"
    R_SURFACE = "#211E18"
    R_HOVER   = "#2A2620"
    R_BORDER  = "#38332A"
    R_FG      = "#F0EAE0"
    R_DIM     = "#C8BEB0"
    R_MUTED   = "#5A504A"
    R_GHOST   = "#3D3530"
    R_ACCENT  = "#DA7756"
    R_DANGER  = "#E05C5C"

    action_label = action.replace("_", " ").title()

    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.98)
    win.configure(bg=R_BORDER)

    outer = tk.Frame(win, bg=R_BG, padx=0, pady=0)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    # ── Header ────────────────────────────────────────────────────────────────
    hdr  = tk.Frame(outer, bg=R_BG, padx=14, pady=10)
    hdr.pack(fill="x")
    left = tk.Frame(hdr, bg=R_BG)
    left.pack(side="left", fill="x", expand=True)
    tk.Label(left, text=action_label, bg=R_BG, fg=R_FG,
             font=("Segoe UI", 10, "bold")).pack(side="left")
    if app_name:
        chip = tk.Frame(left, bg=R_SURFACE, padx=6, pady=1)
        chip.pack(side="left", padx=(8, 0))
        tk.Label(chip, text=app_name, bg=R_SURFACE, fg=R_DIM,
                 font=("Segoe UI", 8)).pack()

    status_lbl = tk.Label(hdr, text="", bg=R_BG, fg=R_MUTED,
                          font=("Segoe UI", 8))
    status_lbl.pack(side="right")

    close_btn = tk.Label(hdr, text="✕", bg=R_BG, fg=R_MUTED,
                         font=("Segoe UI", 10), cursor="hand2", padx=4)
    close_btn.pack(side="right")
    close_btn.bind("<Button-1>", lambda e: win.destroy())
    close_btn.bind("<Enter>",    lambda e: close_btn.configure(fg=R_DANGER))
    close_btn.bind("<Leave>",    lambda e: close_btn.configure(fg=R_MUTED))

    tk.Frame(outer, bg=R_BORDER, height=1).pack(fill="x")

    # body_frame holds the result view; canvas_frame holds the inline canvas
    body_frame   = tk.Frame(outer, bg=R_BG)
    body_frame.pack(fill="both", expand=True)
    canvas_frame = tk.Frame(outer, bg=R_BG)
    _canvas_built = [False]

    # ── Thinking animation ────────────────────────────────────────────────────
    _thinking_states = ["thinking ·", "thinking · ·", "thinking · · ·", "thinking · ·"]
    _pulse_idx  = [0]
    _pulsing    = [True]
    _pulse_imgs = [create_paw_photo(12, c, R_BG)
                   for c in (R_ACCENT, PAW_COLOR_DARK, PAW_COLOR_SOFT, PAW_COLOR_DARK)]

    thinking_lbl = tk.Label(body_frame, text=_thinking_states[0],
                             bg=R_BG, fg=R_MUTED, font=("Segoe UI", 8), pady=6)
    thinking_lbl.pack(anchor="w", padx=14)

    # ── Result text area ──────────────────────────────────────────────────────
    text_wrap   = tk.Frame(body_frame, bg=R_SURFACE, padx=0, pady=0)
    text_wrap.pack(fill="x", padx=10, pady=(0, 6))

    # Apply themed scrollbar style once per session
    if not _scrollbar_style_applied[0]:
        _apply_scrollbar_style()
        _scrollbar_style_applied[0] = True

    result_text = tk.Text(
        text_wrap,
        bg=R_SURFACE, fg=R_FG,
        font=("Segoe UI", 10),
        width=36, height=7,
        wrap="word",
        relief="flat", bd=0,
        padx=12, pady=10,
        insertbackground=R_FG,
        selectbackground=R_HOVER,
        selectforeground=R_FG,
        spacing1=2, spacing3=2,
        state="disabled",
        cursor="arrow",
    )
    scrollbar = ttk.Scrollbar(text_wrap, orient="vertical",
                               command=result_text.yview,
                               style="Flame.Vertical.TScrollbar")
    result_text.configure(yscrollcommand=scrollbar.set)
    result_text.pack(side="left", fill="both", expand=True)

    _edit_mode = [False]

    def get_result() -> str:
        return result_text.get("1.0", "end-1c").strip()

    def enter_edit(edit_btn):
        try:
            if not result_text.winfo_exists():
                return
        except Exception:
            return
        if _edit_mode[0]:
            _edit_mode[0] = False
            _buf[0] = get_result()
            try:
                result_text.configure(state="disabled", cursor="arrow")
                scrollbar.pack_forget()
                edit_btn.configure(text="Edit", bg=R_SURFACE, fg=R_DIM)
            except tk.TclError:
                pass
        else:
            _edit_mode[0] = True
            try:
                result_text.configure(state="normal", cursor="xterm")
                scrollbar.pack(side="right", fill="y")
                result_text.focus_set()
                result_text.mark_set("insert", "end")
                edit_btn.configure(text="Done", bg=R_HOVER, fg=R_FG)
            except tk.TclError:
                _edit_mode[0] = False

    result_text.bind("<MouseWheel>",
                     lambda e: result_text.yview_scroll(int(-1*(e.delta/120)), "units"))

    footer      = tk.Frame(body_frame, bg=R_BG)
    sources_bar = tk.Frame(body_frame, bg=R_BG)   # populated after retrieval

    win.geometry(f"+{x}+{y}")
    win.bind("<Escape>", lambda e: win.destroy())
    win.focus_force()

    def _pulse():
        if not _pulsing[0]:
            return
        try:
            thinking_lbl.configure(text=_thinking_states[_pulse_idx[0] % 4])
            _pulse_idx[0] += 1
            win.after(400, _pulse)
        except Exception:
            pass

    _pulse()

    _buf = [""]

    def on_token(token: str):
        _buf[0] += token
        try:
            def _insert(t=token):
                try:
                    if not win.winfo_exists() or not result_text.winfo_exists():
                        return
                    result_text.configure(state="normal")
                    result_text.insert("end", t)
                    result_text.see("end")
                    if not _edit_mode[0]:
                        result_text.configure(state="disabled")
                except tk.TclError:
                    pass
            win.after(0, _insert)
        except Exception:
            pass

    def reposition():
        try:
            win.update_idletasks()
            from main import _get_monitor_rect
            ml, mt, mr, mb = _get_monitor_rect(x, y)
            w  = win.winfo_reqwidth()
            h  = win.winfo_reqheight()
            nx = min(x, mr - w - 10)
            ny = min(y, mb - h - 10)
            if ny < mt + 10:
                ny = mt + 10
            win.geometry(f"+{nx}+{ny}")
        except Exception:
            pass

    def finish(result: str):
        _pulsing[0] = False
        try:
            thinking_lbl.pack_forget()
            status_lbl.configure(text="done", fg=R_ACCENT)
            win.after(1500, lambda: status_lbl.configure(text="", fg=R_MUTED))
        except Exception:
            pass

        if not result.strip():
            _on_error()
            return

        save_history(app_name, action, result, tone)
        win.after(100, _show_sources)

        # Detect code presence for the Canvas button shown in footer
        from ui.canvas import _is_code_response
        _has_code = action not in VISUAL_ACTIONS and _is_code_response(result)

        if action in VISUAL_ACTIONS:
            try:
                _apply_visual_result(text_wrap, result_text, action, result,
                                     extra=_inspect_extra)
            except Exception as e:
                log(f"[VISUAL] Build failed: {e}")
        elif action in HYPERLINK_ACTIONS:
            if _is_link_aware:
                try:
                    _render_markdown_links(result_text)
                except Exception:
                    pass
            else:
                enrich_with_hyperlinks(result_text, result)
        else:
            # Rich rendering — distinct code blocks vs prose
            try:
                _render_rich_content(result_text, result,
                                     R_ACCENT, R_SURFACE, R_FG)
            except Exception as e:
                log(f"[RICH] Render failed: {e}")

        for w in footer.winfo_children():
            w.destroy()

        def _clipboard_copy(text: str, retries: int = 3) -> bool:
            """Copy to clipboard with retries — handles clipboard contention."""
            for attempt in range(retries):
                try:
                    pyperclip.copy(text)
                    return True
                except Exception:
                    if attempt < retries - 1:
                        time.sleep(0.05)
            return False

        def do_copy():
            _clipboard_copy(get_result())
            copy_btn.configure(text="Copied!")
            win.after(1500, lambda: copy_btn.configure(text="Copy"))
            try:
                from storage import record_action_used
                _ct = getattr(b, "context_type", "generic") or "generic"
                threading.Thread(
                    target=record_action_used, args=(_ct, action), daemon=True
                ).start()
            except Exception:
                pass
            from telemetry import track
            track("result_copied", {"action": action})

        def do_insert():
            state._bump("inserts")
            try:
                from storage import record_action_used
                _ct = getattr(b, "context_type", "generic") or "generic"
                threading.Thread(
                    target=record_action_used, args=(_ct, action), daemon=True
                ).start()
            except Exception:
                pass
            from telemetry import track
            track("result_inserted", {"action": action})
            # Mark the matching process_log entry as user_approved
            try:
                from storage import append_audit_entry
                from brain.action_schema import classify_risk
                append_audit_entry({
                    "app":         app_name or "",
                    "action":      action,
                    "risk_level":  classify_risk(action),
                    "approval":    "user_approved",
                    "result_preview": get_result()[:120].replace("\n", " "),
                })
            except Exception:
                pass
            content = get_result()

            # Capture insert target at click time (not hotkey time)
            insert_hwnd = None
            if WIN32_AVAILABLE:
                try:
                    import win32gui
                    insert_hwnd = target_hwnd if (
                        target_hwnd and win32gui.IsWindow(target_hwnd)
                    ) else win32gui.GetForegroundWindow()
                except Exception:
                    pass

            threading.Thread(
                target=lambda: save_style_sample(content, app_name),
                daemon=True,
            ).start()
            win.withdraw()
            win.update()

            # Save clipboard for crash recovery
            try:
                state._pre_insert_clipboard = pyperclip.paste() or ""
            except Exception:
                state._pre_insert_clipboard = ""

            # Execute via the verified insert pipeline (rate limiter + focus guard + verify)
            from plat.executor import verified_insert
            from brain import rollback as _rollback
            _before = _rollback.save_state("insert")
            try:
                result_exec = verified_insert(content, target_hwnd=insert_hwnd)
            except Exception as _e:
                _rollback.restore_state(_before)
                raise

            state._pre_insert_clipboard = ""   # crash.py no longer needs to restore

            if not result_exec.success:
                _rollback.restore_state(_before)
                log(f"[INSERT] failed: {result_exec.error}")
                win.deiconify()   # show window again so user can retry
                return

            if not result_exec.verified:
                log("[INSERT] completed but focus verification inconclusive")

            win.destroy()

        tk.Frame(body_frame, bg=R_BORDER, height=1).pack(fill="x")
        footer.configure(bg=R_BG, padx=10, pady=8)
        footer.pack(fill="x")

        def _btn(parent, text, command, primary=False):
            bg  = R_ACCENT  if primary else R_SURFACE
            fg  = R_BG      if primary else R_DIM
            abg = PAW_COLOR_DARK if primary else R_HOVER
            afg = R_BG      if primary else R_FG
            return tk.Button(
                parent, text=text, command=command,
                bg=bg, fg=fg, activebackground=abg, activeforeground=afg,
                relief="flat", bd=0, padx=14 if primary else 12, pady=6,
                font=("Segoe UI", 9, "bold" if primary else "normal"),
                cursor="hand2",
            )

        # ── Smart Dispatch — context-aware destination buttons ────────────────
        _content_type = getattr(b, "content_type", "generic")
        _running      = _get_running_apps()

        # Primary action: Copy-first for analytical output, Insert-first otherwise
        _copy_first = _content_type in _COPY_PRIMARY_CONTENT or action in COPY_PRIMARY_ACTIONS

        if _copy_first:
            copy_btn = _btn(footer, "Copy", do_copy, primary=True)
            copy_btn.pack(side="left")
            insert_btn = _btn(footer, "Insert ↵", do_insert)
            insert_btn.pack(side="left", padx=(6, 0))
        else:
            insert_btn = _btn(footer, "Insert ↵", do_insert, primary=True)
            insert_btn.pack(side="left")
            copy_btn = _btn(footer, "Copy", do_copy)
            copy_btn.pack(side="left", padx=(6, 0))

        # Detected app dispatch buttons (max 2)
        _app_count = 0
        for _exe, _lbl, _key in _APP_DISPATCH:
            if _exe in _running and _app_count < 2:
                def _make_dispatch(key=_key, lbl=_lbl):
                    def _go():
                        content = get_result()
                        _clipboard_copy(content)
                        _bring_app_forward(key)
                        log(f"[DISPATCH] copied + focused {lbl}")
                    return _go
                app_btn = _btn(footer, _lbl, _make_dispatch())
                app_btn.pack(side="left", padx=(6, 0))
                _app_count += 1

        edit_btn = _btn(footer, "Edit", None)
        edit_btn.configure(command=lambda: enter_edit(edit_btn))
        edit_btn.pack(side="left", padx=(6, 0))

        # ── Saved custom actions (top 2 by usage) ────────────────────────────
        try:
            from storage import load_custom_actions, save_custom_action
            _saved = load_custom_actions()[:2]
        except Exception:
            _saved = []

        for _ca in _saved:
            def _make_custom_dispatch(instr=_ca["instruction"], lbl=_ca["label"]):
                def _go():
                    close_result = [False]
                    _orig = text
                    _prompt = f"{instr}\n\nContent:\n{_orig[:2000]}"
                    _buf2 = [""]
                    result_text.configure(state="normal")
                    result_text.delete("1.0", "end")
                    result_text.configure(state="disabled")

                    def _tok(t):
                        _buf2[0] += t
                        result_text.configure(state="normal")
                        result_text.insert("end", t)
                        result_text.configure(state="disabled")
                        result_text.see("end")

                    def _dn():
                        threading.Thread(
                            target=save_custom_action, args=(instr,), daemon=True
                        ).start()

                    from ai import call_ai_streaming
                    call_ai_streaming(_orig, "custom", tone, _tok, _dn,
                                      lambda: None,
                                      custom_instruction=instr, bundle=b)
                return _go
            ca_btn = _btn(footer, f"+ {_ca['label'][:18]}", _make_custom_dispatch())
            ca_btn.pack(side="left", padx=(6, 0))

        # ── [+] Custom action input ───────────────────────────────────────────
        _plus_frame = tk.Frame(footer, bg=R_BG)
        _plus_frame.pack(side="left", padx=(6, 0))

        _plus_btn = tk.Label(
            _plus_frame, text="[+]",
            bg=R_BG, fg=R_MUTED,
            font=("Segoe UI", 8), cursor="hand2", padx=6, pady=6,
        )
        _plus_btn.pack()

        _custom_entry = tk.Entry(
            _plus_frame,
            bg=R_SURFACE, fg=R_FG,
            insertbackground=R_FG,
            relief="flat", bd=0,
            font=("Segoe UI", 8),
            width=22,
        )

        def _show_custom_input(e=None):
            _plus_btn.pack_forget()
            _custom_entry.pack(ipady=4, padx=2)
            _custom_entry.focus_set()

        def _run_custom_action(e=None):
            instr = _custom_entry.get().strip()
            if not instr:
                return
            _custom_entry.pack_forget()
            _plus_btn.configure(text="Running…")
            _plus_btn.pack()

            def _tok(t):
                result_text.configure(state="normal")
                result_text.insert("end", t)
                result_text.configure(state="disabled")
                result_text.see("end")

            def _dn():
                _plus_btn.configure(text="Saved ✓")
                win.after(1500, lambda: _plus_btn.configure(text="[+]"))
                threading.Thread(
                    target=save_custom_action, args=(instr,), daemon=True
                ).start()

            result_text.configure(state="normal")
            result_text.delete("1.0", "end")
            result_text.configure(state="disabled")

            from ai import call_ai_streaming
            call_ai_streaming(text, "custom", tone, _tok, _dn,
                              lambda: _plus_btn.configure(text="[+]"),
                              custom_instruction=instr, bundle=b)

        def _cancel_custom(e=None):
            _custom_entry.pack_forget()
            _plus_btn.pack()

        _plus_btn.bind("<Button-1>", _show_custom_input)
        _custom_entry.bind("<Return>", _run_custom_action)
        _custom_entry.bind("<Escape>", _cancel_custom)

        if on_back:
            tk.Button(
                footer, text="← Back",
                bg=R_BG, fg=R_MUTED,
                activebackground=R_SURFACE, activeforeground=R_DIM,
                relief="flat", bd=0, padx=10, pady=6,
                font=("Segoe UI", 9), cursor="hand2",
                command=lambda: (win.destroy(), on_back()),
            ).pack(side="right")

        # ── Canvas toggle — inline view inside the same window ───────────────
        if _has_code:
            def _toggle_canvas():
                from ui.canvas import _extract_code_block, embed_canvas
                if not _canvas_built[0]:
                    code = _extract_code_block(result)

                    def _go_back():
                        canvas_frame.pack_forget()
                        body_frame.pack(fill="both", expand=True)

                    embed_canvas(canvas_frame, root, code,
                                 app_name=app_name, context=context,
                                 on_back=_go_back)
                    _canvas_built[0] = True

                body_frame.pack_forget()
                canvas_frame.pack(fill="both", expand=True)

            canvas_btn = tk.Button(
                footer, text="⬡ Canvas",
                bg=R_SURFACE, fg=R_ACCENT,
                activebackground=R_HOVER, activeforeground=R_ACCENT,
                relief="flat", bd=0, padx=12, pady=6,
                font=("Segoe UI", 9, "bold"), cursor="hand2",
                command=_toggle_canvas,
            )
            canvas_btn.pack(side="right", padx=(6, 0))

        win.bind("<Return>", lambda e: do_insert())

        # ── Follow-up input ───────────────────────────────────────────────────
        tk.Frame(body_frame, bg=R_BORDER, height=1).pack(fill="x")
        fu_wrap   = tk.Frame(body_frame, bg=R_BG, padx=10, pady=8)
        fu_wrap.pack(fill="x")
        fu_border = tk.Frame(fu_wrap, bg=R_BORDER, padx=1, pady=1)
        fu_border.pack(fill="x")
        fu_inner  = tk.Frame(fu_border, bg=R_SURFACE, padx=10, pady=6)
        fu_inner.pack(fill="x")
        fu_entry  = tk.Entry(
            fu_inner, bg=R_SURFACE, fg=R_GHOST,
            insertbackground=R_FG, relief="flat", bd=0,
            font=("Segoe UI", 9),
        )
        fu_entry.pack(fill="x")
        fu_entry.insert(0, "Ask a follow-up…")

        def _fu_focus_in(e):
            fu_border.configure(bg=R_ACCENT)
            if fu_entry.get() == "Ask a follow-up…":
                fu_entry.delete(0, "end")
                fu_entry.configure(fg=R_FG)

        def _fu_focus_out(e):
            fu_border.configure(bg=R_BORDER)
            if not fu_entry.get().strip():
                fu_entry.delete(0, "end")
                fu_entry.insert(0, "Ask a follow-up…")
                fu_entry.configure(fg=R_GHOST)

        def _submit_followup(e=None):
            instruction = fu_entry.get().strip()
            if not instruction or instruction == "Ask a follow-up…":
                return

            fu_entry.delete(0, "end")
            fu_entry.insert(0, "Ask a follow-up…")
            fu_entry.configure(fg=R_GHOST)

            current = get_result()
            _buf[0] = ""

            parts = [TONE_INSTRUCTIONS[tone]]
            if text:
                parts.append(f"Original content:\n{text}")
            parts.append(f"Previously generated:\n{current}")
            parts.append(f"Now: {instruction}\n\nReturn only the result.")
            fu_prompt = "\n\n".join(parts)

            thinking_lbl.pack(anchor="w", padx=14)
            status_lbl.configure(text="", fg=R_MUTED)
            result_text.configure(state="normal")
            result_text.delete("1.0", "end")
            if not _edit_mode[0]:
                result_text.configure(state="disabled")

            win.bind("<Return>", lambda ev: None)
            for w in (edit_btn, copy_btn, insert_btn):
                w.configure(state="disabled")

            _pulsing[0] = True
            _pulse_idx[0] = 0
            _pulse()

            def _fu_done():
                _pulsing[0]  = False
                new_result   = _buf[0].strip()
                try:
                    win.after(0, lambda: _fu_finish(new_result))
                except Exception:
                    pass

            def _fu_finish(new_result):
                _pulsing[0] = False
                thinking_lbl.pack_forget()
                status_lbl.configure(text="done", fg=R_ACCENT)
                win.after(1500, lambda: status_lbl.configure(text="", fg=R_MUTED))
                for w in (edit_btn, copy_btn, insert_btn):
                    w.configure(state="normal")
                win.bind("<Return>", lambda ev: (
                    None if win.focus_get() is fu_entry else do_insert()
                ))
                if new_result:
                    save_history(app_name, "follow_up", new_result, tone)
                reposition()

            call_ai_streaming("", "custom", tone,
                              on_token, _fu_done, _on_error,
                              custom_instruction=fu_prompt,
                              bundle=b)

        fu_entry.bind("<FocusIn>",  _fu_focus_in)
        fu_entry.bind("<FocusOut>", _fu_focus_out)
        fu_entry.bind("<Return>",   _submit_followup)

        win.bind("<Return>", lambda e: (
            None if win.focus_get() is fu_entry else do_insert()
        ))

        reposition()

        if context == "shopping":
            _fetch_similar(result)

    def _fetch_similar(result: str):
        source = (text or result)[:600]
        prompt = (
            "Extract the product name (brand + model) from this text. "
            "Return only the product name, nothing else. Max 6 words.\n\n"
            + source
        )

        def _run():
            name = _call_ai_simple(prompt, max_tokens=20, timeout=10)
            if name:
                try:
                    win.after(0, lambda n=name: _show_links(n))
                except Exception:
                    pass

        threading.Thread(target=_run, daemon=True).start()

    def _show_links(product_name: str):
        enc   = urllib.parse.quote_plus(product_name)
        links = [
            ("Amazon", f"https://www.amazon.com/s?k={enc}"),
            ("Google", f"https://www.google.com/search?tbm=shop&q={enc}"),
            ("eBay",   f"https://www.ebay.com/sch/i.html?_nkw={enc}"),
        ]

        tk.Frame(body_frame, bg=R_BORDER, height=1).pack(fill="x")
        sim_row = tk.Frame(body_frame, bg=R_BG, padx=14, pady=8)
        sim_row.pack(fill="x")
        tk.Label(sim_row, text="Find similar", bg=R_BG, fg=R_MUTED,
                 font=("Segoe UI", 8)).pack(side="left", padx=(0, 10))

        for name, url in links:
            lbl = tk.Label(sim_row, text=name, bg=R_SURFACE, fg=R_DIM,
                           font=("Segoe UI", 8), padx=8, pady=3, cursor="hand2")
            lbl.pack(side="left", padx=(0, 5))
            lbl.bind("<Button-1>", lambda e, u=url: webbrowser.open(u))
            lbl.bind("<Enter>",    lambda e, l=lbl: l.configure(bg=R_HOVER, fg=R_FG))
            lbl.bind("<Leave>",    lambda e, l=lbl: l.configure(bg=R_SURFACE, fg=R_DIM))

        reposition()

    def on_done():
        _pulsing[0] = False
        result      = _buf[0].strip()
        try:
            win.after(0, lambda: finish(result))
        except Exception:
            pass

    def _on_error():
        _pulsing[0] = False
        try:
            def _show_err():
                thinking_lbl.pack_forget()
                status_lbl.configure(text="failed — try again", fg=R_DANGER)
                win.after(2500, win.destroy)
            win.after(0, _show_err)
        except Exception:
            pass

    # ── Inspect: always use vision on element crop ────────────────────────────
    _inspect_extra: dict         = {}
    _inspect_prompt_override     = ""
    if action == "inspect":
        inspect_prompt, inspect_mode = get_inspect_prompt(context)
        _inspect_prompt_override     = inspect_prompt
        _inspect_extra["mode"]       = inspect_mode
        rect = state._last_trigger_rect[0]
        if rect:
            try:
                element_b64 = capture_screenshot_b64(crop=rect)
                if element_b64:
                    colors = extract_dominant_colors(element_b64)
                    _inspect_extra["colors"] = colors
                    log(f"[INSPECT] mode={inspect_mode} rect={rect} colors={len(colors)}")
                    screenshot = element_b64
            except Exception as e:
                log(f"[INSPECT] Crop failed: {e}")
        text = ""

    if text and len(text.strip()) < 20:
        log(f"[MODE] text too short ({len(text.strip())} chars) → using vision fallback")
        text = ""

    _detected_urls = _extract_urls(text) if text else []
    _is_link_aware = len(_detected_urls) >= 2 and action in HYPERLINK_ACTIONS

    if not text and not screenshot:
        _pulsing[0] = False
        thinking_lbl.pack_forget()
        status_lbl.configure(text="no text selected", fg=R_MUTED)
        win.after(2000, win.destroy)
        return

    _retrieved_sources: list = []

    def _status_cb(msg: str):
        try:
            win.after(0, lambda: status_lbl.configure(text=msg, fg=R_MUTED))
        except Exception:
            pass

    def _on_sources(docs: list):
        _retrieved_sources.clear()
        _retrieved_sources.extend(docs)

    def _show_sources():
        """Render source attribution bar below the result footer."""
        if not _retrieved_sources:
            return
        try:
            import time as _t
            import webbrowser
            for w in sources_bar.winfo_children():
                w.destroy()
            tk.Frame(sources_bar, bg=R_BORDER, height=1).pack(fill="x")
            row = tk.Frame(sources_bar, bg=R_BG, padx=12, pady=6)
            row.pack(fill="x")
            tk.Label(row, text="Sources:", bg=R_BG, fg=R_MUTED,
                     font=("Segoe UI", 7, "bold")).pack(side="left", padx=(0, 8))
            for doc in _retrieved_sources[:4]:
                label  = (doc.title or doc.source or "")[:40]
                age    = int(_t.time() - doc.fetched_at)
                age_s  = f"{age//60}m" if age < 3600 else f"{age//3600}h"
                tip    = f"{label} · {age_s} ago"
                lbl    = tk.Label(row, text=label or "source", bg=R_SURFACE,
                                  fg=R_DIM, font=("Segoe UI", 7),
                                  padx=6, pady=2, cursor="hand2")
                lbl.pack(side="left", padx=2)
                if doc.source:
                    lbl.bind("<Button-1>", lambda e, u=doc.source: webbrowser.open(u))
                lbl.bind("<Enter>", lambda e, w=lbl: w.configure(bg=R_HOVER))
                lbl.bind("<Leave>", lambda e, w=lbl: w.configure(bg=R_SURFACE))
            sources_bar.pack(fill="x")
            win.update_idletasks()
        except Exception as e:
            log(f"[SOURCES] render failed: {e}")

    if proactive_result:
        # Cached result from proactive generation — replay it with staggered delays
        # so on_done is always scheduled after the last on_token callback.
        log(f"[MODE] proactive cache hit → {action} ({len(proactive_result)} chars)")
        chunk_size = 40
        delay = 0
        for i in range(0, len(proactive_result), chunk_size):
            root.after(delay, lambda t=proactive_result[i:i+chunk_size]: on_token(t))
            delay += 8
        root.after(delay + 30, on_done)
    elif text and _is_link_aware:
        call_link_aware_streaming(text, _detected_urls, action, tone,
                                  on_token, on_done, _on_error,
                                  status_cb=_status_cb, app_name=b.app_name)
    elif text:
        log(f"[MODE] text ({len(text)} chars) → {action}")
        call_ai_streaming(text, action, tone, on_token, on_done, _on_error,
                          custom_instruction=custom_instruction,
                          bundle=b,
                          status_cb=_status_cb,
                          on_sources=_on_sources)
    elif screenshot and is_vision_model_available():
        log(f"[MODE] vision → {action} (no text captured)")
        call_ai_vision_streaming(screenshot, action, on_token, on_done, _on_error,
                                 custom_instruction=custom_instruction,
                                 prompt_override=_inspect_prompt_override)
    else:
        _on_error()
