"""
ui/canvas.py — show_canvas_window (Canvas output builder).
"""

import os
import re
import tkinter as tk
import pyperclip

from log import log
from ai import (
    call_ai_streaming, call_ai_vision_streaming, is_vision_model_available,
)
from prompts import (
    _CANVAS_GROUPS, _CANVAS_BROWSER_NATIVE,
    _canvas_text_prompt, _canvas_vision_prompt,
)
from ui.icons import PAW_COLOR


def _extract_code_block(text: str) -> str:
    """Extract the largest code block from a mixed prose+code response.
    Falls back to the full text if no fenced block is found."""
    blocks = re.findall(r"```[\w]*\n?([\s\S]+?)```", text)
    if blocks:
        return max(blocks, key=len).strip()
    return text.strip()


def _is_code_response(text: str) -> bool:
    """Return True if the AI response looks like it contains code."""
    # Strongest signal: markdown code fences
    if re.search(r"```[\w]*\n.+?```", text, re.DOTALL):
        return True
    lines = text.strip().splitlines()
    if len(lines) < 4:
        return False
    # Count lines that look like code
    code_patterns = [
        r"^\s*(import|from|export|def |class |function |const |let |var |return |if |for |while |try |async |await )",
        r"^\s*[{}\[\]();]\s*$",
        r"=>\s*[{(]",
        r"^\s*<[A-Za-z][\w.]*[\s/>]",   # JSX / HTML tags
        r"^\s*@\w+",                      # decorators
        r"^\s*#include|^\s*#define",      # C/C++
        r"^\s*public\s+(static\s+)?class",
        r"^\s*\w+\s*:\s*\w+[\[\{<]",     # TypeScript types
    ]
    hits = sum(
        1 for line in lines
        if any(re.search(p, line) for p in code_patterns)
    )
    return hits >= 3


def _detect_code_format(code: str) -> tuple[str, str, str]:
    """Auto-detect (group, fmt, ext) from code content."""
    s = code.strip()
    lo = s.lower()
    top = lo[:300]

    # Extract inner code if wrapped in fences
    fence = re.search(r"```(\w*)\n([\s\S]+?)```", s)
    if fence:
        lang_hint = fence.group(1).lower()
        inner     = fence.group(2)
        _lang_map = {
            "html": ("Web",        "html",    ".html"),
            "tsx":  ("Web",        "react",   ".tsx"),
            "jsx":  ("Web",        "react",   ".jsx"),
            "vue":  ("Web",        "vue",     ".vue"),
            "svg":  ("Web",        "svg",     ".svg"),
            "py":   ("Code",       "python",  ".py"),
            "python":("Code",      "python",  ".py"),
            "js":   ("Code",       "js",      ".js"),
            "javascript":("Code",  "js",      ".js"),
            "ts":   ("Code",       "ts",      ".ts"),
            "typescript":("Code",  "ts",      ".ts"),
            "java": ("Code",       "java",    ".java"),
            "json": ("Data",       "json",    ".json"),
            "csv":  ("Data",       "csv",     ".csv"),
            "yaml": ("Data",       "yaml",    ".yaml"),
            "yml":  ("Data",       "yaml",    ".yaml"),
            "glsl": ("3D / Visual","glsl",    ".glsl"),
        }
        if lang_hint in _lang_map:
            # Generic JS/TS hints need a content pass — AIs often label TSX as "javascript"
            if lang_hint in ("js", "javascript", "ts", "typescript"):
                _ts = bool(re.search(
                    r":\s*(?:string|number|boolean|void|never|unknown|any"
                    r"|React\.\w+|FC|ReactNode|Metadata|Promise)\b"
                    r"|interface\s+\w+\s*[{<]|type\s+\w+\s*=|\}\s*:\s*\{",
                    inner,
                ))
                _jsx = bool(re.search(
                    r"(?:return|=>)\s*[\(\n]\s*<[A-Za-z]"
                    r"|\s<[A-Z]\w+[\s/>]|<html\b|<body\b|<head\b|<div\b",
                    inner,
                ))
                if _ts and _jsx:
                    return "Web", "react", ".tsx"
                if _ts:
                    return "Code", "ts", ".ts"
                if _jsx:
                    return "Web", "react", ".jsx"
            return _lang_map[lang_hint]
        # No lang hint — detect from inner content
        s  = inner.strip()
        lo = s.lower()
        top = lo[:300]

    if top.startswith("<!doctype html") or "<html" in top:
        if "tailwindcss.com" in lo:    return "Web",        "tailwind", ".html"
        if "text/babel" in lo:         return "Web",        "react",    ".jsx"
        if "three@" in lo or "three.js" in lo: return "3D / Visual", "threejs", ".html"
        return "Web", "html", ".html"
    if top.lstrip().startswith("<svg"):
        return "Web", "svg", ".svg"
    if re.search(r"import\s+\w+\s+from\s+['\"]react", s):
        return "Web", "react", ".jsx"
    if re.search(r"<template>|createApp\(", s):
        return "Web", "vue", ".vue"
    if re.search(r"interface\s+\w+\s*\{|:\s*string|:\s*number|<\w+>\s*=>", s):
        return "Code", "ts", ".ts"
    if re.search(r"^from\s+\w|^import\s+\w|^def\s+\w|^class\s+\w+:", s, re.M):
        return "Code", "python", ".py"
    if re.search(r"^public\s+(static\s+)?class\s|^import\s+java\.", s, re.M):
        return "Code", "java", ".java"
    if re.search(r"^(export\s+)?(default\s+)?(function|const|class)\s", s, re.M):
        return "Code", "js", ".js"
    if re.search(r'^\s*\{[\s\S]*\}\s*$', s) or re.search(r'^\s*\[[\s\S]*\]\s*$', s):
        return "Data", "json", ".json"
    if re.search(r"^[\w\-]+:\s", s, re.M):
        return "Data", "yaml", ".yaml"
    # fallback
    return "Code", "js", ".js"


def _apply_highlighting(widget: tk.Text, code: str, fmt: str):
    """Apply VS Code Dark+-style syntax highlighting via Pygments tags."""
    try:
        from pygments import lex
        from pygments.lexers import get_lexer_by_name, guess_lexer
        from pygments.util import ClassNotFound
    except ImportError:
        return  # Pygments not installed — plain text is fine

    _LEXER_MAP = {
        "html": "html",  "tailwind": "html",
        "react": "tsx" if re.search(             # TSX lexer when content has TS types
            r":\s*(?:string|number|boolean|React\.\w+|FC|ReactNode|Metadata)\b"
            r"|interface\s+\w+|type\s+\w+\s*=", code)
            else "jsx",
        "vue":  "html",  "svg":      "xml",   "threejs": "javascript",
        "python": "python", "js": "javascript", "ts": "typescript",
        "java": "java",  "json": "json",  "yaml": "yaml",
        "glsl": "glsl",  "csv": "text",
    }
    try:
        lexer = get_lexer_by_name(_LEXER_MAP[fmt], stripall=False)
    except (KeyError, ClassNotFound):
        try:
            lexer = guess_lexer(code, stripall=False)
        except ClassNotFound:
            return

    # VS Code Dark+ inspired palette
    _COLORS = {
        "Token.Keyword":            "#569cd6",
        "Token.Keyword.Namespace":  "#c586c0",
        "Token.Keyword.Import":     "#c586c0",
        "Token.Keyword.Type":       "#4ec9b0",
        "Token.Name.Function":      "#dcdcaa",
        "Token.Name.Class":         "#4ec9b0",
        "Token.Name.Decorator":     "#c586c0",
        "Token.Name.Builtin":       "#4ec9b0",
        "Token.Name.Tag":           "#569cd6",
        "Token.Name.Attribute":     "#9cdcfe",
        "Token.Literal.String":     "#ce9178",
        "Token.Literal.String.Doc": "#6a9955",
        "Token.Literal.Number":     "#b5cea8",
        "Token.Comment":            "#6a9955",
        "Token.Operator":           "#d4d4d4",
        "Token.Punctuation":        "#d4d4d4",
    }

    # Configure tag colors (idempotent — Tkinter merges duplicates)
    for name, color in _COLORS.items():
        widget.tag_configure(name, foreground=color)

    # Clear old highlight tags before re-applying
    for tag in _COLORS:
        widget.tag_remove(tag, "1.0", "end")

    pos = "1.0"
    for ttype, value in lex(code, lexer):
        if not value:
            continue
        end = widget.index(f"{pos}+{len(value)}c")
        # Walk up token hierarchy to find the nearest matching color
        key = str(ttype)
        while key and key != "Token":
            if key in _COLORS:
                widget.tag_add(key, pos, end)
                break
            key = key.rsplit(".", 1)[0] if "." in key else ""
        pos = end


_FMT_DISPLAY = {
    "html": "HTML",       "tailwind": "Tailwind CSS", "react": "React / JSX",
    "vue":  "Vue",        "svg": "SVG",               "threejs": "Three.js",
    "python": "Python",   "js": "JavaScript",         "ts": "TypeScript",
    "java": "Java",       "json": "JSON",              "csv": "CSV",
    "yaml": "YAML",       "glsl": "GLSL",              "gltf": "GLTF",
    "obj":  "OBJ",        "fbx": "FBX",
}


def _fmt_display_name(fmt: str, code: str = "") -> str:
    """Return the human-readable language name for the chip label.
    Falls back to Pygments auto-detection when fmt is unknown."""
    if fmt == "react" and code:
        # Distinguish TSX from plain JSX by checking for TypeScript markers
        if re.search(
            r":\s*(?:string|number|boolean|void|React\.\w+|FC|ReactNode|Metadata)\b"
            r"|interface\s+\w+|type\s+\w+\s*=",
            code,
        ):
            return "TypeScript (React)"
        return "React / JSX"
    if fmt in _FMT_DISPLAY:
        return _FMT_DISPLAY[fmt]
    if code:
        try:
            from pygments.lexers import guess_lexer
            return guess_lexer(code).name
        except Exception:
            pass
    return fmt.upper()


def show_canvas_window(root: tk.Tk,
                       screenshot: str = "",
                       text: str = "",
                       app_name: str = "",
                       context: str = "generic",
                       prefill_code: str = ""):
    import tempfile
    from pathlib import Path

    C_BG      = "#1A1611"
    C_PANEL   = "#211E18"
    C_BORDER  = "#38332A"
    C_FG      = "#F0EAE0"
    C_DIM     = "#C8BEB0"
    C_MUTED   = "#5A504A"
    C_ACCENT  = "#DA7756"
    C_CODE_BG = "#0d0c0a"
    C_CODE_FG = "#c8d4d8"

    win = tk.Toplevel(root)
    win.withdraw()
    win.title("Canvas — AI Cursor")
    win.configure(bg=C_BG)
    win.resizable(True, True)
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    W, H   = min(1020, sw - 40), min(700, sh - 60)
    win.geometry(f"{W}x{H}+{(sw - W) // 2}+{(sh - H) // 2}")

    _state    = {"group": "Web", "fmt": "html", "ext": ".html", "browser": True}
    _buf      = [""]
    _tmp_file = [None]

    # ── Header ────────────────────────────────────────────────────────────────
    hdr  = tk.Frame(win, bg=C_BG, padx=14, pady=10)
    hdr.pack(fill="x")
    lhdr = tk.Frame(hdr, bg=C_BG)
    lhdr.pack(side="left", fill="x", expand=True)
    tk.Label(lhdr, text="Canvas", bg=C_BG, fg=C_FG,
             font=("Segoe UI", 11, "bold")).pack(side="left")
    if app_name:
        chip = tk.Frame(lhdr, bg=C_PANEL, padx=6, pady=1)
        chip.pack(side="left", padx=(8, 0))
        tk.Label(chip, text=app_name, bg=C_PANEL, fg=C_DIM,
                 font=("Segoe UI", 8)).pack()

    status_lbl = tk.Label(hdr, text="generating…", bg=C_BG, fg=C_MUTED,
                          font=("Segoe UI", 8))
    status_lbl.pack(side="right", padx=(0, 10))
    close_x = tk.Label(hdr, text="✕", bg=C_BG, fg=C_MUTED,
                       font=("Segoe UI", 10), cursor="hand2", padx=4)
    close_x.pack(side="right")
    close_x.bind("<Button-1>", lambda e: win.destroy())
    close_x.bind("<Enter>",    lambda e: close_x.configure(fg="#e05c5c"))
    close_x.bind("<Leave>",    lambda e: close_x.configure(fg=C_MUTED))

    # ── Toolbar ───────────────────────────────────────────────────────────────
    tk.Frame(win, bg=C_BORDER, height=1).pack(fill="x")
    tb1 = tk.Frame(win, bg=C_BG, padx=12, pady=6)
    tb1.pack(fill="x")

    preview_lbl = [None]

    lang_chip = tk.Label(tb1,
                         text=f"● {_fmt_display_name(_state['fmt'])} ▾",
                         bg=C_PANEL, fg=C_ACCENT,
                         font=("Segoe UI", 9), padx=10, pady=3, cursor="hand2")
    lang_chip.pack(side="left")

    def _pick_lang(fmt: str, ext: str, browser: bool):
        _state["fmt"] = fmt
        _state["ext"] = ext
        _state["browser"] = browser
        lang_chip.configure(text=f"● {_fmt_display_name(fmt)} ▾")
        if preview_lbl[0]:
            preview_lbl[0].configure(text="▶  Preview" if browser else "▶  View")
        try:
            c = code_editor.get("1.0", "end-1c")
            if c.strip():
                _apply_highlighting(code_editor, c, fmt)
        except (NameError, tk.TclError):
            pass

    def _show_lang_menu(e=None):
        m = tk.Menu(win, tearoff=0,
                    bg=C_PANEL, fg=C_FG,
                    activebackground=C_ACCENT, activeforeground=C_BG,
                    relief="flat", bd=1, font=("Segoe UI", 9))
        for grp_name, formats in _CANVAS_GROUPS.items():
            m.add_command(label=grp_name, state="disabled",
                          font=("Segoe UI", 8, "bold"), foreground=C_MUTED)
            for label, fmt, ext in formats:
                browser = fmt in _CANVAS_BROWSER_NATIVE
                m.add_command(
                    label=f"  {label}",
                    command=lambda f=fmt, x=ext, b=browser: _pick_lang(f, x, b),
                )
        try:
            m.tk_popup(lang_chip.winfo_rootx(),
                       lang_chip.winfo_rooty() + lang_chip.winfo_height() + 2)
        finally:
            m.grab_release()

    lang_chip.bind("<Button-1>", _show_lang_menu)

    # shims used by prefill_code path below
    def select_fmt(fmt: str, ext: str, browser: bool): _pick_lang(fmt, ext, browser)
    def select_group(grp: str): pass

    # ── Toolbar action buttons ────────────────────────────────────────────────
    def _lbl_btn(parent, text, command, primary=False, side="right"):
        bg  = C_ACCENT if primary else C_PANEL
        fg  = C_BG     if primary else C_DIM
        lbl = tk.Label(parent, text=text, bg=bg, fg=fg,
                       font=("Segoe UI", 8, "bold" if primary else "normal"),
                       padx=10, pady=3, cursor="hand2")
        lbl.pack(side=side, padx=(4 if side == "right" else 0, 0 if side == "right" else 4))
        lbl.bind("<Button-1>", lambda e: command())
        return lbl

    def copy_code():
        pyperclip.copy(code_editor.get("1.0", "end-1c"))
        copy_btn.configure(text="Copied!")
        win.after(1500, lambda: copy_btn.configure(text="Copy"))

    def download_output():
        from tkinter import filedialog
        code = code_editor.get("1.0", "end-1c").strip()
        if not code:
            return
        ext      = _state["ext"]
        fmt      = _state["fmt"]
        all_types = [
            ("HTML", "*.html"), ("JSX",  "*.jsx"), ("JS",   "*.js"),
            ("TSX",  "*.tsx"),  ("TS",   "*.ts"),  ("CSS",  "*.css"),
            ("Python", "*.py"), ("Java", "*.java"),
            ("JSON", "*.json"), ("CSV",  "*.csv"), ("YAML", "*.yaml"),
            ("SVG",  "*.svg"),  ("GLTF", "*.gltf"),("OBJ",  "*.obj"),
            ("FBX script", "*.py"), ("Parquet script", "*.py"),
            ("All files", "*.*"),
        ]
        path = filedialog.asksaveasfilename(
            defaultextension=ext,
            filetypes=[(f"{fmt.upper()} file", f"*{ext}")] + all_types,
            initialfile=f"canvas{ext}",
        )
        if path:
            Path(path).write_text(code, encoding="utf-8")
            status_lbl.configure(text="saved ✓", fg=C_ACCENT)
            win.after(2000, lambda: status_lbl.configure(text="", fg=C_MUTED))

    def preview_or_view():
        code = code_editor.get("1.0", "end-1c").strip()
        if not code:
            return
        fmt     = _state["fmt"]
        browser = _state["browser"]
        try:
            if _tmp_file[0]:
                try:
                    os.unlink(_tmp_file[0])
                except Exception:
                    pass
            if browser:
                html = code
                if fmt == "svg":
                    html = (
                        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                        "<style>body{background:#1a1a1a;display:flex;"
                        "justify-content:center;align-items:center;min-height:100vh;margin:0}"
                        "</style></head><body>" + code + "</body></html>"
                    )
                suffix = ".html"
            else:
                escaped = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                html = (
                    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                    "<style>body{background:#0d0c0a;margin:0;padding:20px}"
                    "pre{color:#c8d4d8;font:13px/1.6 Consolas,monospace;"
                    "white-space:pre-wrap;word-break:break-all}</style></head>"
                    f"<body><pre>{escaped}</pre></body></html>"
                )
                suffix = ".html"
            import webbrowser as wb
            tf = tempfile.NamedTemporaryFile(mode="w", suffix=suffix,
                                             delete=False, encoding="utf-8")
            tf.write(html)
            tf.close()
            _tmp_file[0] = tf.name
            wb.open("file:///" + tf.name.replace("\\", "/"))
            status_lbl.configure(text="preview opened ✓", fg=C_ACCENT)
            win.after(3000, lambda: status_lbl.configure(text="", fg=C_MUTED))
        except Exception as e:
            log(f"[CANVAS] Preview failed: {e}")

    pv_btn   = _lbl_btn(tb1, "▶  Preview", preview_or_view, primary=True)
    preview_lbl[0] = pv_btn
    copy_btn = _lbl_btn(tb1, "Copy",       copy_code)
    _lbl_btn(tb1, "Export", download_output)

    # ── Code editor ───────────────────────────────────────────────────────────
    tk.Frame(win, bg=C_BORDER, height=1).pack(fill="x")
    editor_wrap = tk.Frame(win, bg=C_CODE_BG)
    editor_wrap.pack(fill="both", expand=True)

    vsb = tk.Scrollbar(editor_wrap, orient="vertical",   width=6)
    hsb = tk.Scrollbar(editor_wrap, orient="horizontal", width=6)
    code_editor = tk.Text(
        editor_wrap,
        bg=C_CODE_BG, fg=C_CODE_FG,
        font=("Consolas", 10),
        wrap="none",
        relief="flat", bd=0,
        padx=16, pady=12,
        insertbackground=C_FG,
        selectbackground="#1e3050",
        selectforeground=C_FG,
        spacing1=1, spacing3=1,
        undo=True,
        state="disabled",
    )
    vsb.configure(command=code_editor.yview)
    hsb.configure(command=code_editor.xview)
    code_editor.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
    vsb.pack(side="right",  fill="y")
    hsb.pack(side="bottom", fill="x")
    code_editor.pack(side="left", fill="both", expand=True)

    # ── Iteration footer ──────────────────────────────────────────────────────
    tk.Frame(win, bg=C_BORDER, height=1).pack(fill="x")
    fu_wrap   = tk.Frame(win, bg=C_BG, padx=12, pady=8)
    fu_wrap.pack(fill="x")
    fu_border = tk.Frame(fu_wrap, bg=C_BORDER, padx=1, pady=1)
    fu_border.pack(side="left", fill="x", expand=True)
    fu_inner  = tk.Frame(fu_border, bg=C_PANEL, padx=10, pady=6)
    fu_inner.pack(fill="x")
    fu_entry  = tk.Entry(fu_inner, bg=C_PANEL, fg=C_MUTED,
                         insertbackground=C_FG, relief="flat", bd=0,
                         font=("Segoe UI", 9))
    fu_entry.pack(fill="x")
    fu_entry.insert(0, "Describe what to change…")

    def _fu_in(e):
        fu_border.configure(bg=C_ACCENT)
        if fu_entry.get() == "Describe what to change…":
            fu_entry.delete(0, "end")
            fu_entry.configure(fg=C_FG)

    def _fu_out(e):
        fu_border.configure(bg=C_BORDER)
        if not fu_entry.get().strip():
            fu_entry.delete(0, "end")
            fu_entry.insert(0, "Describe what to change…")
            fu_entry.configure(fg=C_MUTED)

    fu_entry.bind("<FocusIn>",  _fu_in)
    fu_entry.bind("<FocusOut>", _fu_out)

    # ── AI generation ─────────────────────────────────────────────────────────
    def on_token(token: str):
        _buf[0] += token
        try:
            def _ins(t=token):
                code_editor.configure(state="normal")
                code_editor.insert("end", t)
                code_editor.see("end")
                code_editor.configure(state="disabled")
            win.after(0, _ins)
        except Exception:
            pass

    def on_done():
        raw = _buf[0].strip()
        raw = re.sub(r"^```[\w]*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw.rstrip())
        try:
            def _fin(c=raw):
                code_editor.configure(state="normal")
                code_editor.delete("1.0", "end")
                code_editor.insert("1.0", c)
                _apply_highlighting(code_editor, c, _state["fmt"])
                lbl = "▶  Preview" if _state["browser"] else "▶  View"
                status_lbl.configure(text=f"done — click {lbl}", fg=C_ACCENT)
                win.after(4000, lambda: status_lbl.configure(text="", fg=C_MUTED))
                preview_or_view()
            win.after(0, _fin)
        except Exception:
            pass

    def on_error():
        try:
            win.after(0, lambda: status_lbl.configure(
                text="generation failed — check API key", fg="#e05c5c"))
        except Exception:
            pass

    def _run_generation(iteration: str = ""):
        fmt = _state["fmt"]
        _buf[0] = ""
        code_editor.configure(state="normal")
        code_editor.delete("1.0", "end")
        code_editor.configure(state="disabled")
        status_lbl.configure(text="generating…", fg=C_MUTED)

        if iteration:
            current = code_editor.get("1.0", "end-1c")
            prompt  = _canvas_text_prompt(fmt, text, current, iteration)
            log(f"[CANVAS] Iterate ({fmt}): {iteration[:60]}")
            call_ai_streaming("", "custom", "professional",
                              on_token, on_done, on_error,
                              custom_instruction=prompt,
                              context=context, app_name=app_name)
        elif text:
            prompt = _canvas_text_prompt(fmt, text)
            log(f"[CANVAS] Text → {fmt}")
            call_ai_streaming("", "custom", "professional",
                              on_token, on_done, on_error,
                              custom_instruction=prompt,
                              context=context, app_name=app_name)
        elif screenshot and is_vision_model_available():
            prompt = _canvas_vision_prompt(fmt)
            log(f"[CANVAS] Vision → {fmt}")
            call_ai_vision_streaming(screenshot, "custom",
                                     on_token, on_done, on_error,
                                     prompt_override=prompt)
        else:
            on_error()

    def regenerate(e=None):
        instruction = fu_entry.get().strip()
        if instruction == "Describe what to change…":
            instruction = ""
        _run_generation(iteration=instruction)

    _lbl_btn(fu_wrap, "↺  Regenerate", regenerate)
    fu_entry.bind("<Return>", regenerate)

    win.bind("<Escape>", lambda e: win.destroy())
    win.deiconify()
    win.lift()
    win.focus_force()

    if prefill_code:
        # Strip markdown fences if present
        clean = re.sub(r"^```[\w]*\n?", "", prefill_code.strip())
        clean = re.sub(r"\n?```\s*$", "", clean.rstrip())
        # Auto-detect format and switch to the right group/sub-button
        grp, fmt, ext = _detect_code_format(prefill_code)
        select_group(grp)
        for label, fid, fext in _CANVAS_GROUPS.get(grp, []):
            if fid == fmt:
                select_fmt(fid, fext, fid in _CANVAS_BROWSER_NATIVE)
                break
        # Load code into editor
        code_editor.configure(state="normal")
        code_editor.insert("1.0", clean)
        _apply_highlighting(code_editor, clean, _state["fmt"])
        status_lbl.configure(text="done — click ▶ Preview", fg=C_ACCENT)
        win.after(4000, lambda: status_lbl.configure(text="", fg=C_MUTED))
        # Auto-preview web formats
        if _state["browser"]:
            preview_or_view()
    else:
        _run_generation()


# ── Embedded canvas (inline inside result window) ─────────────────────────────

def embed_canvas(parent: tk.Frame, root: tk.Tk, code: str,
                 app_name: str = "", context: str = "generic",
                 on_back=None):
    """Build a compact canvas view inside an existing frame (same-window mode)."""
    import os
    import tempfile
    import webbrowser as wb

    C_BG      = "#1A1611"
    C_PANEL   = "#211E18"
    C_BORDER  = "#38332A"
    C_FG      = "#F0EAE0"
    C_DIM     = "#C8BEB0"
    C_MUTED   = "#5A504A"
    C_ACCENT  = "#DA7756"
    C_CODE_BG = "#0d0c0a"
    C_CODE_FG = "#c8d4d8"

    _state = {"fmt": "html", "ext": ".html", "browser": True}
    _buf   = [""]
    _tmp   = [None]

    grp, fmt, ext = _detect_code_format(code)
    browser = fmt in _CANVAS_BROWSER_NATIVE
    _state.update({"fmt": fmt, "ext": ext, "browser": browser})

    # ── Compact single-row toolbar ─────────────────────────────────────
    tk.Frame(parent, bg=C_BORDER, height=1).pack(fill="x")
    toolbar = tk.Frame(parent, bg=C_BG, padx=10, pady=5)
    toolbar.pack(fill="x")

    pv_ref = [None]

    lang_chip = tk.Label(toolbar,
                         text=f"● {_fmt_display_name(fmt, code)} ▾",
                         bg=C_PANEL, fg=C_ACCENT,
                         font=("Segoe UI", 8), padx=8, pady=2, cursor="hand2")
    lang_chip.pack(side="left")

    def _pick_lang(f, x, br):
        _state["fmt"] = f
        _state["ext"] = x
        _state["browser"] = br
        lang_chip.configure(text=f"● {_fmt_display_name(f)} ▾")
        if pv_ref[0]:
            pv_ref[0].configure(text="▶ Preview" if br else "▶ View")
        try:
            c = code_editor.get("1.0", "end-1c")
            if c.strip():
                _apply_highlighting(code_editor, c, f)
        except (NameError, tk.TclError):
            pass

    def _show_lang_menu(e=None):
        m = tk.Menu(parent.winfo_toplevel(), tearoff=0,
                    bg=C_PANEL, fg=C_FG,
                    activebackground=C_ACCENT, activeforeground=C_BG,
                    relief="flat", bd=1, font=("Segoe UI", 8))
        for grp_name, formats in _CANVAS_GROUPS.items():
            m.add_command(label=grp_name, state="disabled",
                          font=("Segoe UI", 7, "bold"), foreground=C_MUTED)
            for label, fid, fext in formats:
                br = fid in _CANVAS_BROWSER_NATIVE
                m.add_command(
                    label=f"  {label}",
                    command=lambda f=fid, x=fext, b=br: _pick_lang(f, x, b),
                )
        try:
            m.tk_popup(lang_chip.winfo_rootx(),
                       lang_chip.winfo_rooty() + lang_chip.winfo_height() + 2)
        finally:
            m.grab_release()

    lang_chip.bind("<Button-1>", _show_lang_menu)

    # Action buttons (right side of toolbar)
    def do_preview():
        c = code_editor.get("1.0", "end-1c").strip()
        if not c:
            return
        if _tmp[0]:
            try:
                os.unlink(_tmp[0])
            except Exception:
                pass
        if _state["browser"]:
            html   = c
            if _state["fmt"] == "svg":
                html = (
                    "<!DOCTYPE html><html><body style='background:#1a1a1a;"
                    "display:flex;justify-content:center;align-items:center;"
                    "min-height:100vh;margin:0'>" + c + "</body></html>"
                )
            suffix = ".html"
        else:
            esc    = c.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            html   = (
                "<!DOCTYPE html><html><head><style>body{background:#0d0c0a;padding:16px}"
                "pre{color:#c8d4d8;font:12px/1.5 Consolas,monospace;white-space:pre-wrap}"
                "</style></head><body><pre>" + esc + "</pre></body></html>"
            )
            suffix = ".html"
        tf = tempfile.NamedTemporaryFile(mode="w", suffix=suffix,
                                         delete=False, encoding="utf-8")
        tf.write(html)
        tf.close()
        _tmp[0] = tf.name
        wb.open("file:///" + tf.name.replace("\\", "/"))

    pv_lbl = tk.Label(toolbar,
                      text="▶ Preview" if browser else "▶ View",
                      bg=C_ACCENT, fg=C_BG,
                      font=("Segoe UI", 7, "bold"), padx=8, pady=2, cursor="hand2")
    pv_lbl.pack(side="right")
    pv_lbl.bind("<Button-1>", lambda e: do_preview())
    pv_ref[0] = pv_lbl

    def do_copy():
        pyperclip.copy(code_editor.get("1.0", "end-1c"))
        cp_lbl.configure(text="✓")
        parent.after(1500, lambda: cp_lbl.configure(text="Copy"))

    cp_lbl = tk.Label(toolbar, text="Copy",
                      bg=C_PANEL, fg=C_DIM,
                      font=("Segoe UI", 7), padx=7, pady=2, cursor="hand2")
    cp_lbl.pack(side="right", padx=(0, 3))
    cp_lbl.bind("<Button-1>", lambda e: do_copy())

    def do_export():
        from tkinter import filedialog
        from pathlib import Path
        c = code_editor.get("1.0", "end-1c").strip()
        if not c:
            return
        path = filedialog.asksaveasfilename(
            defaultextension=_state["ext"],
            filetypes=[(f"{_state['fmt'].upper()} file", f"*{_state['ext']}"),
                       ("All files", "*.*")],
            initialfile=f"canvas{_state['ext']}",
        )
        if path:
            Path(path).write_text(c, encoding="utf-8")

    exp_lbl = tk.Label(toolbar, text="Export",
                       bg=C_PANEL, fg=C_DIM,
                       font=("Segoe UI", 7), padx=7, pady=2, cursor="hand2")
    exp_lbl.pack(side="right", padx=(0, 3))
    exp_lbl.bind("<Button-1>", lambda e: do_export())

    # ── Code editor ───────────────────────────────────────────────────
    tk.Frame(parent, bg=C_BORDER, height=1).pack(fill="x")
    edit_wrap = tk.Frame(parent, bg=C_CODE_BG)
    edit_wrap.pack(fill="both", expand=True)

    vsb = tk.Scrollbar(edit_wrap, orient="vertical",   width=6)
    hsb = tk.Scrollbar(edit_wrap, orient="horizontal", width=6)
    code_editor = tk.Text(
        edit_wrap,
        bg=C_CODE_BG, fg=C_CODE_FG,
        font=("Consolas", 9),
        width=36, height=9,
        wrap="none",
        relief="flat", bd=0,
        padx=12, pady=8,
        insertbackground=C_FG,
        selectbackground="#1e3050",
        selectforeground=C_FG,
        undo=True,
    )
    vsb.configure(command=code_editor.yview)
    hsb.configure(command=code_editor.xview)
    code_editor.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
    vsb.pack(side="right",  fill="y")
    hsb.pack(side="bottom", fill="x")
    code_editor.pack(side="left", fill="both", expand=True)

    clean = re.sub(r"^```[\w]*\n?", "", code.strip())
    clean = re.sub(r"\n?```\s*$", "", clean.rstrip())
    code_editor.insert("1.0", clean)
    _apply_highlighting(code_editor, clean, _state["fmt"])

    # ── Footer: ← Result + iteration input + ↺ ───────────────────────
    tk.Frame(parent, bg=C_BORDER, height=1).pack(fill="x")
    cv_footer = tk.Frame(parent, bg=C_BG, padx=10, pady=6)
    cv_footer.pack(fill="x")

    if on_back:
        bk = tk.Label(cv_footer, text="← Result",
                      bg=C_BG, fg=C_MUTED,
                      font=("Segoe UI", 8), cursor="hand2")
        bk.pack(side="left")
        bk.bind("<Button-1>", lambda e: on_back())
        bk.bind("<Enter>",    lambda e: bk.configure(fg=C_FG))
        bk.bind("<Leave>",    lambda e: bk.configure(fg=C_MUTED))

    fu_border = tk.Frame(cv_footer, bg=C_BORDER, padx=1, pady=1)
    fu_border.pack(side="left", fill="x", expand=True,
                   padx=(8 if on_back else 0, 6))
    fu_inner  = tk.Frame(fu_border, bg=C_PANEL, padx=8, pady=4)
    fu_inner.pack(fill="x")
    fu_entry  = tk.Entry(fu_inner, bg=C_PANEL, fg=C_MUTED,
                         insertbackground=C_FG, relief="flat", bd=0,
                         font=("Segoe UI", 8))
    fu_entry.pack(fill="x")
    fu_entry.insert(0, "Describe a change…")

    def _fu_in(e):
        fu_border.configure(bg=C_ACCENT)
        if fu_entry.get() == "Describe a change…":
            fu_entry.delete(0, "end")
            fu_entry.configure(fg=C_FG)

    def _fu_out(e):
        fu_border.configure(bg=C_BORDER)
        if not fu_entry.get().strip():
            fu_entry.delete(0, "end")
            fu_entry.insert(0, "Describe a change…")
            fu_entry.configure(fg=C_MUTED)

    fu_entry.bind("<FocusIn>",  _fu_in)
    fu_entry.bind("<FocusOut>", _fu_out)

    regen_lbl = tk.Label(cv_footer, text="↺",
                         bg=C_PANEL, fg=C_DIM,
                         font=("Segoe UI", 10), padx=8, pady=3, cursor="hand2")
    regen_lbl.pack(side="right")

    def _do_regen(e=None):
        from prompts import _canvas_text_prompt
        instruction = fu_entry.get().strip()
        if instruction == "Describe a change…":
            instruction = ""
        current = code_editor.get("1.0", "end-1c")
        _buf[0] = ""
        code_editor.delete("1.0", "end")
        prompt = _canvas_text_prompt(_state["fmt"], "", current, instruction)

        def _tok(t):
            _buf[0] += t
            try:
                parent.after(0, lambda tok=t: (
                    code_editor.insert("end", tok),
                    code_editor.see("end"),
                ))
            except Exception:
                pass

        def _done():
            raw = _buf[0].strip()
            raw = re.sub(r"^```[\w]*\n?", "", raw)
            raw = re.sub(r"\n?```\s*$", "", raw.rstrip())
            try:
                def _fin(c=raw):
                    code_editor.delete("1.0", "end")
                    code_editor.insert("1.0", c)
                    _apply_highlighting(code_editor, c, _state["fmt"])
                parent.after(0, _fin)
            except Exception:
                pass

        call_ai_streaming("", "custom", "professional",
                          _tok, _done, lambda: None,
                          custom_instruction=prompt,
                          context=context, app_name=app_name)

    regen_lbl.bind("<Button-1>", _do_regen)
    fu_entry.bind("<Return>",    _do_regen)

    if browser:
        parent.after(300, do_preview)
