"""
log.py — logger, session start/end, stat tracking, optional prompt logging.
"""

import time

from config import LOG_FILE, LOG_FILE_PREV, LOG_PROMPTS
import state

# Separate file for prompt dumps — keeps main log readable
_PROMPT_LOG = LOG_FILE.parent / "pushpa_prompts.log"


_session_start = time.strftime("%Y-%m-%d %H:%M:%S")


def log(msg: str):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if "[ERROR]" in msg or "ERROR" in msg:
        state._log_stats["errors"] += 1
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def log_prompt(action: str, prompt: str):
    """Write full prompt to pushpa_prompts.log when PUSHPA_LOG_PROMPTS=1."""
    if not LOG_PROMPTS:
        return
    try:
        with open(_PROMPT_LOG, "a", encoding="utf-8") as f:
            f.write(f"\n{'─'*60}\n")
            f.write(f"[{time.strftime('%H:%M:%S')}] action={action}\n")
            f.write(f"{'─'*60}\n")
            f.write(prompt)
            f.write("\n")
    except Exception:
        pass


def _start_session():
    """Rotate previous log and write session header."""
    try:
        if LOG_FILE.exists():
            LOG_FILE.replace(LOG_FILE_PREV)
    except Exception:
        pass
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write("=" * 50 + "\n")
            f.write(f"  AI Cursor — session started {_session_start}\n")
            f.write("=" * 50 + "\n\n")
    except Exception:
        pass


def _end_session():
    """Write session footer to log on exit."""
    duration_secs = int(
        time.time() - time.mktime(time.strptime(_session_start, "%Y-%m-%d %H:%M:%S"))
    )
    mins, secs = divmod(duration_secs, 60)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("\n" + "=" * 50 + "\n")
            f.write(f"  Session ended   {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"  Duration        {mins}m {secs}s\n")
            f.write(f"  Actions run     {state._log_stats['actions']}\n")
            f.write(f"  Inserts         {state._log_stats['inserts']}\n")
            f.write(f"  Errors          {state._log_stats['errors']}\n")
            f.write(f"  Provider        {state._log_stats['provider']}\n")
            f.write("=" * 50 + "\n")
    except Exception:
        pass
