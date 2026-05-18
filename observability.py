"""
observability.py — Autonomous health monitoring.

Runs a background thread that samples metrics every 10 seconds,
computes rates over a 1-minute window, checks thread liveness,
detects anomalies, and writes results to state.obs_metrics.

state.obs_metrics schema:
  obs_rate_1m        float   observations per minute (last 60s)
  brain_ready_rate   float   fraction of obs that became ready context
  proactive_gen_1m   int     successful generations in last 60s
  proactive_err_1m   int     failed generations in last 60s
  proactive_hit_1m   int     cache hits used at Alt+A in last 60s
  last_obs_age_s     float   seconds since last observation
  threads            dict    {name: bool} — is each critical thread alive?
  anomalies          list    current active anomaly strings
  health             str     "ok" | "warn" | "error"
"""

import threading
import time
from collections import deque

from log import log
import state

_SAMPLE_INTERVAL = 10   # seconds between samples
_WINDOW_SAMPLES  = 6    # 6 × 10s = 1-minute window

_CRITICAL_THREADS = [
    "perception",
    "context_brain",
    "scheduler",
    "nudge",
]

# Anomaly thresholds
_OBS_STALE_WARN  = 120   # seconds — no observation = perception might be stuck
_ERR_RATE_WARN   = 0.3   # proactive error rate above this = model issues


def start_observability() -> None:
    threading.Thread(target=_loop, daemon=True, name="observability").start()
    log("[OBS] autonomous health monitor started")


def _loop() -> None:
    # Snapshot deques — each entry: (timestamp, counter_value)
    obs_snaps    = deque(maxlen=_WINDOW_SAMPLES + 1)
    ready_snaps  = deque(maxlen=_WINDOW_SAMPLES + 1)
    gen_snaps    = deque(maxlen=_WINDOW_SAMPLES + 1)
    err_snaps    = deque(maxlen=_WINDOW_SAMPLES + 1)
    hit_snaps    = deque(maxlen=_WINDOW_SAMPLES + 1)

    while True:
        time.sleep(_SAMPLE_INTERVAL)
        try:
            now = time.monotonic()

            # ── Snapshot current counters ─────────────────────────────────────
            obs_snaps.append((now, state.obs_count_total))
            ready_snaps.append((now, state.brain_ready_count))
            gen_snaps.append((now, state.proactive_gen_count))
            err_snaps.append((now, state.proactive_err_count))
            hit_snaps.append((now, state.proactive_hit_count))

            # ── Compute 1-minute rates ────────────────────────────────────────
            def _rate(snaps):
                if len(snaps) < 2:
                    return 0.0
                t0, v0 = snaps[0]
                t1, v1 = snaps[-1]
                elapsed = t1 - t0
                return ((v1 - v0) / elapsed * 60) if elapsed > 0 else 0.0

            obs_rate   = _rate(obs_snaps)
            ready_rate = _rate(ready_snaps)
            gen_1m     = int(_rate(gen_snaps) / 60 * min(len(gen_snaps) * _SAMPLE_INTERVAL, 60))
            err_1m     = int(_rate(err_snaps) / 60 * min(len(err_snaps) * _SAMPLE_INTERVAL, 60))
            hit_1m     = int(_rate(hit_snaps) / 60 * min(len(hit_snaps) * _SAMPLE_INTERVAL, 60))

            # Avoid division by zero for brain_ready_rate
            total_obs = max(obs_snaps[-1][1] - obs_snaps[0][1], 1) if len(obs_snaps) >= 2 else 1
            total_ready = ready_snaps[-1][1] - ready_snaps[0][1] if len(ready_snaps) >= 2 else 0
            brain_ready_rate = min(1.0, total_ready / total_obs) if total_obs > 0 else 0.0

            # ── Thread liveness ───────────────────────────────────────────────
            alive_names = {t.name for t in threading.enumerate() if t.is_alive()}
            threads = {name: (name in alive_names) for name in _CRITICAL_THREADS}

            # ── Last observation age ──────────────────────────────────────────
            last_obs_age = (now - state.last_obs_ts) if state.last_obs_ts > 0 else 9999

            # ── Anomaly detection ─────────────────────────────────────────────
            anomalies = []

            for name, alive in threads.items():
                if not alive:
                    anomalies.append(f"{name} thread dead")
                    log(f"[OBS] ANOMALY: {name} thread is not alive")

            if last_obs_age > _OBS_STALE_WARN and state.last_obs_ts > 0:
                anomalies.append(f"no observations for {int(last_obs_age)}s")

            gen_total = state.proactive_gen_count + state.proactive_err_count
            if gen_total >= 5:
                err_rate = state.proactive_err_count / gen_total
                if err_rate > _ERR_RATE_WARN:
                    anomalies.append(f"proactive error rate {err_rate:.0%}")

            # ── Overall health ────────────────────────────────────────────────
            dead_threads = [n for n, a in threads.items() if not a]
            if dead_threads or (last_obs_age > _OBS_STALE_WARN and state.last_obs_ts > 0):
                health = "error"
            elif anomalies:
                health = "warn"
            else:
                health = "ok"

            # ── Write to state ────────────────────────────────────────────────
            state.obs_metrics = {
                "obs_rate_1m":       round(obs_rate, 1),
                "brain_ready_rate":  round(brain_ready_rate, 2),
                "proactive_gen_1m":  gen_1m,
                "proactive_err_1m":  err_1m,
                "proactive_hit_1m":  hit_1m,
                "last_obs_age_s":    round(last_obs_age, 1),
                "threads":           threads,
                "anomalies":         anomalies,
                "health":            health,
                "updated_ts":        now,
            }

        except Exception as e:
            log(f"[OBS] collector error: {e}")
