"""
build.py — One-command release builder for AI Cursor (Windows + macOS).

Usage:
  python build.py                  # full release for current platform
  python build.py --platform windows
  python build.py --platform macos
  python build.py --no-installer   # skip installer / DMG step
  python build.py --clean

Output — Windows (run on Windows):
  dist/AIcursor-windows/              PyInstaller folder
  dist/AIcursor-windows-setup.exe     ← what users download and double-click

Output — macOS (run on Mac):
  dist/AIcursor.app                   app bundle
  dist/AIcursor-macos-v0.1.dmg        ← what users download (drag to Applications)

Requirements:
  Windows: pip install pyinstaller pillow requests pyautogui pyperclip pynput psutil pywin32 pdfplumber
           + Inno Setup: https://jrsoftware.org/isdl.php  (free)
             or:         choco install innosetup

  macOS:   pip install pyinstaller pillow requests pyautogui pyperclip pynput pdfplumber \\
                       pyobjc-framework-Cocoa pyobjc-framework-Quartz \\
                       pyobjc-framework-ApplicationServices
           + create-dmg: brew install create-dmg
"""

import shutil
import subprocess
import sys
import argparse
from pathlib import Path

VERSION   = "0.1.0"
APP_NAME  = "AIcursor"
DIST_DIR  = Path("dist")
BUILD_DIR = Path("build")

WINDOWS_DEPS = [
    "pyinstaller", "pillow", "requests", "pyautogui",
    "pyperclip", "pynput", "psutil", "pywin32", "pdfplumber",
]
MACOS_DEPS = [
    "pyinstaller", "pillow", "requests", "pyautogui",
    "pyperclip", "pynput", "pdfplumber",
    "pyobjc-framework-Cocoa",
    "pyobjc-framework-Quartz",
    "pyobjc-framework-ApplicationServices",
]


def banner(msg: str):
    print(f"\n{'─' * 60}\n  {msg}\n{'─' * 60}\n")


def run(cmd: list, **kwargs):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        print(f"\n[ERROR] command failed (exit {result.returncode})")
        sys.exit(result.returncode)
    return result


def clean():
    banner("Cleaning previous build artifacts")
    for d in [DIST_DIR, BUILD_DIR]:
        if d.exists():
            shutil.rmtree(d)
            print(f"  removed {d}")


def install_deps(platform: str):
    banner("Installing / verifying Python dependencies")
    deps = WINDOWS_DEPS if platform == "windows" else MACOS_DEPS
    run([sys.executable, "-m", "pip", "install", "--upgrade"] + deps)


# ── Windows ───────────────────────────────────────────────────────────────────

def build_windows():
    banner(f"Building {APP_NAME} v{VERSION} for Windows (PyInstaller)")
    out = DIST_DIR / f"{APP_NAME}-windows"
    run([sys.executable, "-m", "PyInstaller", "pushpa.spec", "--noconfirm"])
    if not out.exists():
        print(f"[ERROR] Expected output not found: {out}")
        sys.exit(1)
    print(f"  → {out}")
    return out


def make_windows_installer():
    """
    Run Inno Setup to create a proper one-click .exe installer.
    Inno Setup must be installed first (free — see jrsoftware.org).
    """
    banner("Creating Windows installer with Inno Setup")

    # Common install locations for Inno Setup
    import os
    candidates = [
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        r"C:\Program Files\Inno Setup 6\ISCC.exe",
        r"C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
        shutil.which("iscc") or "",
    ]
    iscc = next((p for p in candidates if p and Path(p).exists()), None)

    if not iscc:
        print("  [SKIP] Inno Setup not found.")
        print("  Install from https://jrsoftware.org/isdl.php then re-run.")
        print("  Alternatively:  choco install innosetup")
        return None

    run([iscc, "installer.iss"])
    out = DIST_DIR / f"{APP_NAME}-windows-setup.exe"
    if out.exists():
        size_mb = out.stat().st_size / 1024 / 1024
        print(f"\n  → {out}  ({size_mb:.1f} MB)  ← upload this")
    return out


# ── macOS ─────────────────────────────────────────────────────────────────────

def build_macos():
    banner(f"Building {APP_NAME} v{VERSION} for macOS (PyInstaller)")
    out = DIST_DIR / f"{APP_NAME}.app"
    run([sys.executable, "-m", "PyInstaller", "pushpa_macos.spec", "--noconfirm"])
    if not out.exists():
        print(f"[ERROR] Expected output not found: {out}")
        sys.exit(1)
    print(f"  → {out}")
    return out


def make_macos_dmg():
    """
    Package the .app into a .dmg using create-dmg.
    Install:  brew install create-dmg
    """
    banner("Creating macOS DMG")

    if not shutil.which("create-dmg"):
        print("  [SKIP] create-dmg not found.")
        print("  Install with:  brew install create-dmg")
        print("  Then re-run build.py to get the .dmg file.")
        return None

    app   = DIST_DIR / f"{APP_NAME}.app"
    dmg   = DIST_DIR / f"{APP_NAME}-macos-v{VERSION}.dmg"

    run([
        "create-dmg",
        "--volname",          f"{APP_NAME} {VERSION}",
        "--volicon",          "icons/icon.icns",
        "--window-pos",       "200", "120",
        "--window-size",      "600", "400",
        "--icon-size",        "100",
        "--icon",             f"{APP_NAME}.app", "175", "190",
        "--hide-extension",   f"{APP_NAME}.app",
        "--app-drop-link",    "425", "190",
        "--background",       "icons/dmg_background.png",  # optional — skip if file missing
        str(dmg),
        str(app),
    ], check=False)   # create-dmg exits non-zero even on success sometimes

    if dmg.exists():
        size_mb = dmg.stat().st_size / 1024 / 1024
        print(f"\n  → {dmg}  ({size_mb:.1f} MB)  ← upload this")
        return dmg

    print("  [WARN] DMG creation may have failed — check dist/ for output.")
    return None


# ── Summary ───────────────────────────────────────────────────────────────────

def publish_github(installer: Path, tag: str = f"v{VERSION}"):
    """
    Upload the installer to a GitHub Release using the gh CLI.
    Install gh:  https://cli.github.com  or  winget install GitHub.cli
    Auth once:   gh auth login
    """
    banner(f"Publishing to GitHub Releases ({tag})")

    if not shutil.which("gh"):
        print("  [SKIP] GitHub CLI (gh) not found.")
        print("  Install: https://cli.github.com  or  winget install GitHub.cli")
        print("  Then run manually:")
        print(f"    gh release create {tag} {installer} --title 'AI Cursor {tag}' --notes 'Release'")
        return

    # Create the release (ok if it already exists)
    subprocess.run(
        ["gh", "release", "create", tag,
         "--title", f"AI Cursor {tag}",
         "--notes", f"AI Cursor {tag} — Windows and macOS desktop app.",
         "--latest"],
        check=False,
    )

    # Upload (or overwrite) the installer asset
    run(["gh", "release", "upload", tag, str(installer), "--clobber"])
    print(f"\n  Published: github.com releases/{tag}/{installer.name}")


def print_summary(platform: str, installer: Path | None):
    banner("Done")
    filename = installer.name if installer else "(no installer produced)"
    print(f"  Installer : {filename}")
    print()
    if installer:
        print("  Publish to GitHub Releases (free):")
        print(f"    gh release create v{VERSION} dist/{filename} --title 'AI Cursor v{VERSION}' --latest")
        print()
        print("  That's it. No env vars, no config — the website reads the file")
        print("  directly from github.com/YOUR_USERNAME/ai-cursor/releases/latest/download/")
        print()
    if platform == "windows":
        print("  NOTE: Windows SmartScreen warning on first run (app isn't code-signed).")
        print("  Users click 'More info → Run anyway'. Normal for new apps.")


# ── Entry ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Build AI Cursor installer")
    parser.add_argument("--platform", choices=["windows", "macos"],
                        default="windows" if sys.platform == "win32" else "macos")
    parser.add_argument("--no-installer", action="store_true",
                        help="Skip Inno Setup / create-dmg step")
    parser.add_argument("--no-deps",  action="store_true")
    parser.add_argument("--clean",    action="store_true")
    args = parser.parse_args()

    if args.platform == "windows" and sys.platform != "win32":
        print("[ERROR] Windows builds must run on Windows.")
        sys.exit(1)
    if args.platform == "macos" and sys.platform != "darwin":
        print("[ERROR] macOS builds must run on a Mac.")
        sys.exit(1)

    if args.clean:
        clean()
    if not args.no_deps:
        install_deps(args.platform)

    if args.platform == "windows":
        build_windows()
        installer = None if args.no_installer else make_windows_installer()
    else:
        build_macos()
        installer = None if args.no_installer else make_macos_dmg()

    if installer:
        publish_github(installer)

    print_summary(args.platform, installer)


if __name__ == "__main__":
    main()
