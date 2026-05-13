# pushpa.spec — PyInstaller build config for AI Cursor
# Usage:  pyinstaller pushpa.spec
# Output: dist/AIcursor-windows/  (folder) and dist/AIcursor-windows-setup.exe

block_cipher = None

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[
        ("ollama/ollama.exe", "ollama"),
    ],
    datas=[
        ("icons/icon.ico",  "icons"),
        ("icons/icon.png",  "icons"),
    ],
    hiddenimports=[
        # Brain
        "brain.context_brain",
        "brain.context_bundle",
        "brain.compact",
        "brain.form_filler",
        "brain.intent_parser",
        "brain.perception",
        "brain.rule_learner",
        "brain.sections",
        "brain.signals",
        "brain.transaction_templates",
        # UI
        "ui.canvas",
        "ui.compact_editor",
        "ui.compact_notify",
        "ui.dashboard",
        "ui.debug_overlay",
        "ui.form_controller",
        "ui.history",
        "ui.icons",
        "ui.indicator",
        "ui.result",
        "ui.scroll_map",
        "ui.transaction_preview",
        # Platform
        "plat",
        "plat.base",
        "plat.windows",
        "plat.macos",
        "plat.linux",
        # Core
        "ai",
        "_version",
        "updater",
        "config",
        "context",
        "crash",
        "hover",
        "hyperlinks",
        "log",
        "memory",
        "prompts",
        "rules",
        "security",
        "state",
        "storage",
        # Third-party that PyInstaller misses
        "pyautogui",
        "pyperclip",
        "pynput",
        "pynput.keyboard",
        "pynput.mouse",
        "PIL",
        "PIL._tkinter_finder",
        "requests",
        "psutil",
        "win32gui",
        "win32process",
        "win32con",
        "comtypes",
        "comtypes.client",
        "comtypes.gen",
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
        "pdfplumber",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Web stack — not needed in the desktop app
        "next",
        "react",
        "node",
        "npm",
        "webpack",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AIcursor",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # no terminal window shown to end users
    icon="icons/icon.ico",  # update path if your icon lives elsewhere
    version="version_info.txt",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=["vcruntime140.dll", "python3*.dll"],
    name="AIcursor-windows",
)
