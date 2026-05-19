# pushpa_macos.spec — PyInstaller build config for AI Cursor on macOS
import os

block_cipher = None

# Set TARGET_ARCH env var to 'universal2', 'x86_64', or 'arm64'.
# Leave unset to build for the native machine architecture.
_target_arch = os.environ.get("TARGET_ARCH") or None

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[
        ("ollama/ollama", "ollama"),
    ],
    datas=[
        ("icons/icon.png", "icons"),
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
        "plat.macos",
        # Core
        "ai", "config", "context", "crash", "hover",
        "hyperlinks", "log", "memory", "prompts",
        "rules", "security", "state", "storage",
        # Cross-platform (always available)
        "pyautogui",
        "pyperclip",
        "pynput",
        "pynput.keyboard",
        "pynput.mouse",
        "PIL",
        "requests",
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
        # pdfplumber is optional
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Windows-only
        "win32gui", "win32process", "win32con", "comtypes", "psutil",
        # pyobjc — loaded at runtime via try/except, not needed at build time
        "AppKit", "Quartz", "ApplicationServices", "Foundation",
        "objc",
        # Web stack
        "next", "react", "webpack",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    target_arch=_target_arch,
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
    upx=False,
    console=False,
    target_arch=_target_arch,
)

app = BUNDLE(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    name="AIcursor.app",
    bundle_identifier="com.aicursor.app",
    info_plist={
        "CFBundleDisplayName":        "AI Cursor",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion":            "0.1.0",
        "NSHighResolutionCapable":    True,
        "NSAccessibilityUsageDescription":
            "AI Cursor reads text from the active window to generate AI responses.",
        "NSScreenCaptureUsageDescription":
            "AI Cursor captures the screen to provide visual AI assistance.",
    },
)
