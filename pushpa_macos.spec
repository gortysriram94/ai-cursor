# pushpa_macos.spec — PyInstaller build config for AI Cursor on macOS
# Run ON a Mac:  pyinstaller pushpa_macos.spec
# Output: dist/AIcursor.app  →  zip as AIcursor-macos-v0.1.zip for distribution
#
# Required before building:
#   pip install pyinstaller pyobjc-framework-Cocoa pyobjc-framework-Quartz \
#               pyobjc-framework-ApplicationServices pynput pyautogui Pillow \
#               requests pyperclip pdfplumber

block_cipher = None

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("icons/icon.png",  "icons"),
        ("icons/icon.icns", "icons"),
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
        # macOS
        "AppKit",
        "Quartz",
        "ApplicationServices",
        "Foundation",
        # Cross-platform
        "pyautogui",
        "pyperclip",
        "pynput",
        "pynput.keyboard",
        "pynput.mouse",
        "PIL",
        "requests",
        "pdfplumber",
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Windows-only — not present on macOS
        "win32gui",
        "win32process",
        "win32con",
        "comtypes",
        "psutil",
        # Web stack
        "next", "react", "webpack",
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
    upx=False,     # UPX not recommended on macOS
    console=False,
    icon="icons/icon.icns",
)

app = BUNDLE(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    name="AIcursor.app",
    icon="icons/icon.icns",
    bundle_identifier="com.aicursor.app",
    info_plist={
        "CFBundleDisplayName":        "AI Cursor",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion":            "0.1.0",
        "NSHighResolutionCapable":    True,
        # Permissions the OS requires before the app can use Accessibility / Screen Recording
        "NSAccessibilityUsageDescription":
            "AI Cursor reads text from the active window to generate AI responses.",
        "NSScreenCaptureUsageDescription":
            "AI Cursor captures the screen to provide visual AI assistance.",
    },
)
