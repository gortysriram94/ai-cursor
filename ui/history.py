"""
ui/history.py — show_history_window, show_style_window.
"""

import json
import tkinter as tk
import pyperclip

from config import STYLE_FILE, MIN_SAMPLES_FOR_PROFILE
from storage import load_history, load_style_data
from ui.icons import PAW_COLOR, BG, BG2, DIVIDER, FG, FG_DIM, FG_MUT, dot_widget


def show_history_window(root: tk.Tk, cx: int, cy: int):
    history = load_history()

    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=BG)

    outer = tk.Frame(win, bg=BG, padx=12, pady=10)
    outer.pack(fill="both", expand=True)

    hdr = tk.Frame(outer, bg=BG)
    hdr.pack(fill="x")
    dot_widget(hdr).pack(side="left", padx=(0, 8))
    tk.Label(hdr, text="recent", bg=BG, fg=FG_DIM,
             font=("Segoe UI", 10)).pack(side="left")
    tk.Button(hdr, text="✕", bg=BG, fg=FG_MUT,
              activebackground=BG2, activeforeground=FG,
              relief="flat", bd=0, padx=6, pady=2,
              font=("Segoe UI", 9), cursor="hand2",
              command=win.destroy).pack(side="right")

    tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(8, 4))

    if not history:
        tk.Label(outer, text="no history yet", bg=BG, fg=FG_MUT,
                 font=("Segoe UI", 9), pady=12).pack()
    else:
        feedback_lbl = tk.Label(outer, text="", bg=BG, fg="#6baa7a",
                                font=("Segoe UI", 8))
        feedback_lbl.pack(pady=(0, 2))

        LIST_W  = 320
        ITEM_H  = 58
        MAX_VIS = 6
        list_h  = min(len(history), MAX_VIS) * ITEM_H

        canvas = tk.Canvas(outer, bg=BG, width=LIST_W, height=list_h,
                           highlightthickness=0, bd=0)
        scrollbar = tk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)

        if len(history) > MAX_VIS:
            scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = tk.Frame(canvas, bg=BG)
        canvas_win = canvas.create_window((0, 0), window=inner, anchor="nw")

        def on_inner_configure(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def on_canvas_configure(e):
            canvas.itemconfig(canvas_win, width=e.width)

        inner.bind("<Configure>",  on_inner_configure)
        canvas.bind("<Configure>", on_canvas_configure)

        def on_mousewheel(e):
            canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")

        canvas.bind("<MouseWheel>", on_mousewheel)
        inner.bind("<MouseWheel>",  on_mousewheel)

        for item in history:
            row = tk.Frame(inner, bg=BG, cursor="hand2")
            row.pack(fill="x", pady=(2, 0))

            meta = f"{item['app']}  ·  {item['action']}  ·  {item['ts']}"
            tk.Label(row, text=meta, bg=BG, fg=FG_MUT,
                     font=("Segoe UI", 7)).pack(anchor="w")

            preview = item["result"]
            if len(preview) > 90:
                preview = preview[:87] + "..."
            lbl = tk.Label(row, text=preview, bg=BG, fg=FG_DIM,
                           font=("Segoe UI", 9), wraplength=290,
                           justify="left", anchor="w")
            lbl.pack(anchor="w", pady=(1, 4))

            tk.Frame(inner, bg=DIVIDER, height=1).pack(fill="x")

            def on_click(e, result=item["result"]):
                pyperclip.copy(result)
                feedback_lbl.configure(text="copied ✓")
                win.after(1500, lambda: feedback_lbl.configure(text=""))

            for w in (row, lbl):
                w.bind("<Button-1>",  on_click)
                w.bind("<MouseWheel>", on_mousewheel)
                w.bind("<Enter>", lambda e, r=row, l=lbl: (
                    r.configure(bg=BG2), l.configure(bg=BG2)))
                w.bind("<Leave>", lambda e, r=row, l=lbl: (
                    r.configure(bg=BG), l.configure(bg=BG)))

    win.bind("<Escape>", lambda e: win.destroy())

    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w  = win.winfo_reqwidth()
    h  = win.winfo_reqheight()
    x  = min(cx + 12, sw - w - 10)
    y  = min(cy - h // 2, sh - h - 10)
    if y < 10:
        y = 10
    win.geometry(f"+{x}+{y}")


def show_style_window(root: tk.Tk, cx: int, cy: int):
    data    = load_style_data()
    profile = data.get("profile", "")
    samples = data.get("samples", [])
    count   = data.get("sample_count", 0)
    updated = data.get("profile_generated_at", "")

    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=BG)

    outer = tk.Frame(win, bg=BG, padx=12, pady=10)
    outer.pack(fill="both", expand=True)

    hdr = tk.Frame(outer, bg=BG)
    hdr.pack(fill="x")
    dot_widget(hdr).pack(side="left", padx=(0, 8))
    tk.Label(hdr, text="my style", bg=BG, fg=FG_DIM,
             font=("Segoe UI", 10)).pack(side="left")
    tk.Button(hdr, text="✕", bg=BG, fg=FG_MUT,
              activebackground=BG2, activeforeground=FG,
              relief="flat", bd=0, padx=6, pady=2,
              font=("Segoe UI", 9), cursor="hand2",
              command=win.destroy).pack(side="right")

    tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(8, 6))

    if not samples:
        tk.Label(outer,
                 text="No style learned yet.\n\nClick Insert ↵ after generating results\nto start building your profile.",
                 bg=BG, fg=FG_MUT, font=("Segoe UI", 9),
                 justify="center", pady=16).pack()
    else:
        meta = f"{count} sample{'s' if count != 1 else ''} collected"
        if updated:
            meta += f"  ·  updated {updated}"
        tk.Label(outer, text=meta, bg=BG, fg=FG_MUT,
                 font=("Segoe UI", 8)).pack(anchor="w", pady=(0, 8))

        if profile:
            tk.Label(outer, text="Writing style", bg=BG, fg=FG_DIM,
                     font=("Segoe UI", 9, "bold")).pack(anchor="w")
            tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(4, 6))

            PROF_W = 310
            PROF_H = min(120, 20 * profile.count("\n") + 40)
            prof_canvas = tk.Canvas(outer, bg=BG2, width=PROF_W,
                                    height=PROF_H, highlightthickness=0, bd=0)
            prof_scroll = tk.Scrollbar(outer, orient="vertical",
                                       command=prof_canvas.yview)
            prof_canvas.configure(yscrollcommand=prof_scroll.set)

            prof_inner = tk.Frame(prof_canvas, bg=BG2)
            prof_cwin  = prof_canvas.create_window((0, 0), window=prof_inner, anchor="nw")

            tk.Label(prof_inner, text=profile, bg=BG2, fg=FG,
                     font=("Segoe UI", 9), wraplength=290,
                     justify="left", anchor="nw",
                     padx=10, pady=8).pack(fill="x")

            def _prof_configure(e):
                prof_canvas.configure(scrollregion=prof_canvas.bbox("all"))

            def _prof_canvas_configure(e):
                prof_canvas.itemconfig(prof_cwin, width=e.width)

            prof_inner.bind("<Configure>",  _prof_configure)
            prof_canvas.bind("<Configure>", _prof_canvas_configure)
            prof_canvas.bind("<MouseWheel>",
                             lambda e: prof_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

            if PROF_H >= 100:
                prof_scroll.pack(side="right", fill="y")
            prof_canvas.pack(fill="x")

        else:
            need = max(0, MIN_SAMPLES_FOR_PROFILE - count)
            tk.Label(outer,
                     text=f"Profile pending — {need} more insert{'s' if need != 1 else ''} needed.",
                     bg=BG, fg=FG_MUT, font=("Segoe UI", 9),
                     pady=6).pack(anchor="w")

        if samples:
            tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(10, 6))
            tk.Label(outer, text="Recent samples", bg=BG, fg=FG_DIM,
                     font=("Segoe UI", 9, "bold")).pack(anchor="w")
            tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(4, 4))

            SAMP_W = 310
            SAMP_H = min(150, len(samples) * 50)
            samp_canvas = tk.Canvas(outer, bg=BG, width=SAMP_W,
                                    height=SAMP_H, highlightthickness=0, bd=0)
            samp_scroll = tk.Scrollbar(outer, orient="vertical",
                                       command=samp_canvas.yview)
            samp_canvas.configure(yscrollcommand=samp_scroll.set)

            samp_inner = tk.Frame(samp_canvas, bg=BG)
            samp_cwin  = samp_canvas.create_window((0, 0), window=samp_inner, anchor="nw")

            for item in samples[:10]:
                row = tk.Frame(samp_inner, bg=BG)
                row.pack(fill="x", pady=(0, 4))
                meta_txt = f"{item.get('context','?')}  ·  {item.get('ts','')}"
                tk.Label(row, text=meta_txt, bg=BG, fg=FG_MUT,
                         font=("Segoe UI", 7)).pack(anchor="w")
                preview = item["text"][:100] + ("…" if len(item["text"]) > 100 else "")
                tk.Label(row, text=f'"{preview}"', bg=BG, fg=FG_DIM,
                         font=("Segoe UI", 9), wraplength=290,
                         justify="left", anchor="w").pack(anchor="w")
                tk.Frame(samp_inner, bg=DIVIDER, height=1).pack(fill="x", pady=(4, 0))

            def _samp_configure(e):
                samp_canvas.configure(scrollregion=samp_canvas.bbox("all"))

            def _samp_canvas_configure(e):
                samp_canvas.itemconfig(samp_cwin, width=e.width)

            samp_inner.bind("<Configure>",  _samp_configure)
            samp_canvas.bind("<Configure>", _samp_canvas_configure)
            samp_canvas.bind("<MouseWheel>",
                             lambda e: samp_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
            samp_inner.bind("<MouseWheel>",
                            lambda e: samp_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

            if SAMP_H >= 100:
                samp_scroll.pack(side="right", fill="y")
            samp_canvas.pack(fill="x")

        tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(10, 6))

        def clear_style():
            try:
                STYLE_FILE.write_text(
                    json.dumps({"samples": [], "profile": "", "sample_count": 0}, indent=2),
                    encoding="utf-8",
                )
            except Exception:
                pass
            win.destroy()

        tk.Button(outer, text="Clear style memory", bg=BG, fg="#f87171",
                  activebackground=BG2, activeforeground="#f87171",
                  relief="flat", bd=0, padx=10, pady=4,
                  font=("Segoe UI", 9), cursor="hand2",
                  command=clear_style).pack(anchor="w")

    win.bind("<Escape>", lambda e: win.destroy())

    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w  = win.winfo_reqwidth()
    h  = win.winfo_reqheight()
    x  = min(cx + 12, sw - w - 10)
    y  = min(cy - h // 2, sh - h - 10)
    if y < 10:
        y = 10
    win.geometry(f"+{x}+{y}")
