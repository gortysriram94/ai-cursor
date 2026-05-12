// lib/human-sim.js — L86: human-like mouse movement and timing variability
// Moves the mouse along a quadratic Bezier arc to simulate natural hand movement.
// Opt-in: only active when Pushpa_HUMAN_SIM=1 env var is set.

"use strict";

// Move mouse from an approximate start position to target along a Bezier arc.
// Dispatches intermediate mouseMoved events so CDP motion looks organic.
async function moveTo(client, x1, y1, x2, y2) {
  const dist  = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(5, Math.min(18, Math.round(dist / 25)));

  // Random control point for arc shape (vary above/below the direct path)
  const cx = (x1 + x2) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.35, 55);
  const cy = (y1 + y2) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.35, 55);

  for (let i = 1; i <= steps; i++) {
    const t  = i / steps;
    const u  = 1 - t;
    const x  = Math.round(u * u * x1 + 2 * u * t * cx + t * t * x2);
    const y  = Math.round(u * u * y1 + 2 * u * t * cy + t * t * y2);
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x, y }).catch(() => {});
    if (i < steps) await _delay(jitter(7));  // ~5–11ms between moves
  }
}

// Move mouse to target (natural arc from a plausible prior position).
// Does NOT dispatch the click — caller still calls _clickCoords after this.
async function naturalClick(client, x, y) {
  const startX = Math.round(x + (Math.random() - 0.5) * 180);
  const startY = Math.round(y + (Math.random() - 0.5) * 100);
  await moveTo(client, startX, startY, x, y);
  await _delay(jitter(35));  // hover pause: 25–56ms before click
}

// Returns baseMs with ±30% random jitter.
function jitter(baseMs) {
  return Math.round(baseMs * (0.7 + Math.random() * 0.6));
}

// Jittered delay — use between-action pauses in executor.
function thinkDelay(baseMs = 200) {
  return _delay(jitter(baseMs));
}

function _delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { moveTo, naturalClick, jitter, thinkDelay };
