"""
scheduler.py — Time-based task scheduler.

Checks every 60 seconds whether any enabled scheduled task is due.
When a task fires it sets state.scheduled_task_pending so the proactive
generation pipeline picks it up on the next brain observation, bypassing
the normal confidence threshold.

Task schema (stored in pushpa_prefs.json under "scheduled_tasks"):
  {id, name, description, time (HH:MM), days ([mon..sun]),
   action, enabled, last_run (YYYY-MM-DD)}
"""

import time
import threading

from log import log
import state

_DAY_MAP = {
    "mon": 0, "tue": 1, "wed": 2,
    "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}


def start_scheduler() -> None:
    threading.Thread(target=_loop, daemon=True, name="scheduler").start()
    log("[SCHEDULER] started")


def _loop() -> None:
    while True:
        time.sleep(60)
        try:
            _check_tasks()
        except Exception as e:
            log(f"[SCHEDULER] check error: {e}")


def _check_tasks() -> None:
    from storage import load_scheduled_tasks, save_scheduled_tasks

    tasks   = load_scheduled_tasks()
    now     = time.localtime()
    today   = time.strftime("%Y-%m-%d")
    hhmm    = f"{now.tm_hour:02d}:{now.tm_min:02d}"
    weekday = now.tm_wday   # 0 = Monday

    changed = False
    for task in tasks:
        if not task.get("enabled"):
            continue
        if task.get("last_run") == today:
            continue

        # Day-of-week check
        allowed = [_DAY_MAP[d] for d in task.get("days", []) if d in _DAY_MAP]
        if weekday not in allowed:
            continue

        # Time check — match the minute window
        if task.get("time", "") != hhmm:
            continue

        # ── Fire ──────────────────────────────────────────────────────────────
        task["last_run"] = today
        changed = True

        # Only set pending if nothing else is already pending
        if state.scheduled_task_pending is None:
            state.scheduled_task_pending = {
                "id":     task["id"],
                "label":  task["name"],
                "action": task.get("action", "summarize"),
            }
            log(f"[SCHEDULER] fired: {task['name']} ({hhmm})")

    if changed:
        save_scheduled_tasks(tasks)
