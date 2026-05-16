"""
updater.py — check for new GitHub releases and apply silent in-place updates.
User data (history, styles, hotkeys, prefs, rules, memory) and the AI model
are never touched by the installer.
"""

import subprocess
import threading
import urllib.request
from pathlib import Path

import requests

from log import log

REPO = "gortysriram94/ai-cursor"


def current_version() -> str:
    try:
        from _version import APP_VERSION
        return APP_VERSION
    except ImportError:
        return "dev"


def check_for_update() -> "dict | None":
    """Return {version, url} if a newer release exists on GitHub, else None."""
    ver = current_version()
    if ver == "dev":
        return None
    try:
        r = requests.get(
            f"https://api.github.com/repos/{REPO}/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
            timeout=8,
        )
        if not r.ok:
            return None
        data = r.json()
        latest = data["tag_name"].lstrip("v")
        if latest == ver:
            return None
        for asset in data.get("assets", []):
            if asset["name"].endswith("-setup.exe"):
                return {"version": latest, "url": asset["browser_download_url"]}
    except Exception as e:
        log(f"[UPDATE] check failed: {e}")
    return None


def download_and_apply(url: str, version: str,
                       progress_cb=None, done_cb=None, error_cb=None):
    """Download installer to temp dir. Calls done_cb(path) when ready to install."""
    import tempfile
    dest = Path(tempfile.gettempdir()) / f"AIcursor-v{version}-setup.exe"

    def _run():
        try:
            def _hook(n, chunk, total):
                if progress_cb and total > 0:
                    progress_cb(min(100, int(n * chunk / total * 100)))
            urllib.request.urlretrieve(url, dest, _hook)

            # Basic integrity check — valid Windows PE starts with "MZ" and is > 1 MB
            size = dest.stat().st_size if dest.exists() else 0
            header = dest.read_bytes()[:2] if size > 0 else b""
            if header != b"MZ" or size < 1_000_000:
                dest.unlink(missing_ok=True)
                raise ValueError(
                    f"Downloaded file failed integrity check "
                    f"(size={size}, header={header!r})"
                )

            if done_cb:
                done_cb(dest)
        except Exception as e:
            log(f"[UPDATE] download failed: {e}")
            if error_cb:
                error_cb(str(e))

    threading.Thread(target=_run, daemon=True).start()


def apply_update(installer: Path, root=None):
    """Quit the app, then run the installer silently. The installer relaunches the app."""
    import sys
    try:
        from storage import save_just_updated_flag
        save_just_updated_flag(str(installer.stem))  # version from filename
    except Exception:
        pass
    # PowerShell waits 2s for the app to exit before launching the installer
    cmd = f"Start-Sleep 2; Start-Process '{installer}' -ArgumentList '/SILENT'"
    subprocess.Popen(
        ["powershell", "-WindowStyle", "Hidden", "-Command", cmd],
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if root:
        root.after(0, root.quit)
    else:
        sys.exit(0)
