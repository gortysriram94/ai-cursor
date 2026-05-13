"""
keychain.py — OS keychain credential storage.

Credentials (API keys, secrets) for enterprise connections are stored here,
never in plain-text JSON files.

Platform backends:
  Windows → Windows Credential Manager (win32cred)
  macOS   → macOS Keychain (security CLI)
  Linux   → ~/.config/aicursor/keychain.json with 0600 permissions (no Secret Service dep)

Public API:
  store(ref, creds)        → bool
  load(ref)                → dict
  delete(ref)              → bool
  load_all_connection_creds() → {ref: creds_dict}
"""
import json
import os
import platform as _platform_mod

from log import log

SERVICE_NAME = "AIcursor"
_OS = _platform_mod.system()


# ── Windows — Windows Credential Manager ────────────────────────────────────

def _win_store(ref: str, creds: dict) -> bool:
    try:
        import win32cred
        # CredentialBlob must be a str — pywin32 encodes it to UTF-16-LE internally.
        win32cred.CredWrite({
            "Type":           win32cred.CRED_TYPE_GENERIC,
            "TargetName":     f"{SERVICE_NAME}/{ref}",
            "CredentialBlob": json.dumps(creds),
            "Persist":        win32cred.CRED_PERSIST_LOCAL_MACHINE,
        }, 0)
        return True
    except Exception as e:
        log(f"[KEYCHAIN] Windows store failed for '{ref}': {e}")
        return False


def _win_load(ref: str) -> dict:
    try:
        import win32cred
        cred = win32cred.CredRead(f"{SERVICE_NAME}/{ref}", win32cred.CRED_TYPE_GENERIC)
        # Blob comes back as raw bytes (UTF-16-LE) — decode accordingly.
        blob = cred["CredentialBlob"]
        text = blob.decode("utf-16-le") if isinstance(blob, bytes) else blob
        return json.loads(text)
    except Exception:
        return {}


def _win_delete(ref: str) -> bool:
    try:
        import win32cred
        win32cred.CredDelete(f"{SERVICE_NAME}/{ref}", win32cred.CRED_TYPE_GENERIC)
        return True
    except Exception as e:
        log(f"[KEYCHAIN] Windows delete failed for '{ref}': {e}")
        return False


def _win_list_refs() -> list[str]:
    """Return all stored refs for this service."""
    try:
        import win32cred
        creds = win32cred.CredEnumerate(f"{SERVICE_NAME}/*", 0) or []
        prefix = f"{SERVICE_NAME}/"
        return [
            c["TargetName"][len(prefix):]
            for c in creds
            if c["TargetName"].startswith(prefix)
        ]
    except Exception:
        return []


# ── macOS — security CLI ──────────────────────────────────────────────────────

def _mac_store(ref: str, creds: dict) -> bool:
    import subprocess
    try:
        value = json.dumps(creds)
        result = subprocess.run(
            ["security", "add-generic-password",
             "-s", SERVICE_NAME, "-a", ref, "-w", value, "-U"],
            capture_output=True,
        )
        return result.returncode == 0
    except Exception as e:
        log(f"[KEYCHAIN] macOS store failed for '{ref}': {e}")
        return False


def _mac_load(ref: str) -> dict:
    import subprocess
    try:
        result = subprocess.run(
            ["security", "find-generic-password",
             "-s", SERVICE_NAME, "-a", ref, "-w"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip())
    except Exception:
        pass
    return {}


def _mac_delete(ref: str) -> bool:
    import subprocess
    try:
        result = subprocess.run(
            ["security", "delete-generic-password",
             "-s", SERVICE_NAME, "-a", ref],
            capture_output=True,
        )
        return result.returncode == 0
    except Exception as e:
        log(f"[KEYCHAIN] macOS delete failed for '{ref}': {e}")
        return False


# ── Linux fallback — restricted local file ───────────────────────────────────
# Not a true keychain — file is unencrypted but limited to the current user
# via 0600 permissions. Better than storing in the app directory or world-readable.

def _linux_path():
    from pathlib import Path
    d = Path.home() / ".config" / "aicursor"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "keychain.json"
    # Restrict to owner read/write only
    if p.exists():
        try:
            p.chmod(0o600)
        except Exception:
            pass
    return p


def _linux_load_all() -> dict:
    try:
        p = _linux_path()
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _linux_save_all(data: dict) -> None:
    p = _linux_path()
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        p.chmod(0o600)
    except Exception:
        pass


def _linux_store(ref: str, creds: dict) -> bool:
    try:
        data = _linux_load_all()
        data[ref] = creds
        _linux_save_all(data)
        return True
    except Exception as e:
        log(f"[KEYCHAIN] Linux store failed for '{ref}': {e}")
        return False


def _linux_load(ref: str) -> dict:
    return _linux_load_all().get(ref, {})


def _linux_delete(ref: str) -> bool:
    try:
        data = _linux_load_all()
        data.pop(ref, None)
        _linux_save_all(data)
        return True
    except Exception as e:
        log(f"[KEYCHAIN] Linux delete failed for '{ref}': {e}")
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def store(ref: str, creds: dict) -> bool:
    """
    Store a credentials dict under the given ref key in the OS keychain.
    creds values must be JSON-serialisable strings.
    Returns True on success.
    """
    if not ref:
        return False
    if _OS == "Windows":
        return _win_store(ref, creds)
    if _OS == "Darwin":
        return _mac_store(ref, creds)
    return _linux_store(ref, creds)


def load(ref: str) -> dict:
    """
    Load a credentials dict from the OS keychain by ref.
    Returns {} if not found or on error.
    """
    if not ref:
        return {}
    if _OS == "Windows":
        return _win_load(ref)
    if _OS == "Darwin":
        return _mac_load(ref)
    return _linux_load(ref)


def delete(ref: str) -> bool:
    """
    Delete credentials for the given ref from the OS keychain.
    Returns True on success (also True if ref didn't exist).
    """
    if not ref:
        return True
    if _OS == "Windows":
        return _win_delete(ref)
    if _OS == "Darwin":
        return _mac_delete(ref)
    return _linux_delete(ref)


def load_all_connection_creds() -> dict[str, dict]:
    """
    Load credentials for every enabled connection that has a credential_ref.
    Returns {credential_ref: creds_dict}.
    Called at startup before load_into_registries().
    """
    from connections import load_connections
    result: dict[str, dict] = {}
    for conn in load_connections():
        if conn.enabled and conn.credential_ref:
            creds = load(conn.credential_ref)
            if creds:
                result[conn.credential_ref] = creds
            else:
                log(f"[KEYCHAIN] no credentials found for '{conn.name}' (ref={conn.credential_ref})")
    return result
