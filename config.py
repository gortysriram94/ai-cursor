"""
config.py — constants, env loading, API keys, file paths, hotkey maps.
No mutable state lives here.
"""

import os
import sys
import platform as _platform
from pathlib import Path


# ── Load .env.local ────────────────────────────────────────────────────────────

def load_env():
    env_path = Path(__file__).parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


load_env()


# ── Platform availability ──────────────────────────────────────────────────────

try:
    import win32gui
    import win32process
    import psutil
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False


# ── Paths ──────────────────────────────────────────────────────────────────────

APP_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent

# PyInstaller 6+ puts bundled binaries/datas inside _internal/ next to the exe.
# sys._MEIPASS points there when frozen; fall back to APP_DIR in dev.
_RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", str(APP_DIR)))

_os = _platform.system()
OLLAMA_EXE = _RESOURCE_DIR / "ollama" / ("ollama.exe" if _os == "Windows" else "ollama")

if _os == "Darwin":
    OLLAMA_MODELS_DIR = Path.home() / "Library" / "Application Support" / "Pushpa" / "models"
elif _os == "Windows":
    OLLAMA_MODELS_DIR = Path(os.environ.get("APPDATA", str(APP_DIR))) / "Pushpa" / "models"
else:
    OLLAMA_MODELS_DIR = Path.home() / ".pushpa" / "models"

OLLAMA_MODELS_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE       = APP_DIR / "pushpa.log"
LOG_FILE_PREV  = APP_DIR / "pushpa_prev.log"
LOG_PROMPTS    = os.environ.get("PUSHPA_LOG_PROMPTS", "0") == "1"    # set in .env.local to debug prompts
DEBUG_OVERLAY  = os.environ.get("PUSHPA_DEBUG_OVERLAY", "0") == "1"  # floating diagnostics HUD
HISTORY_FILE  = APP_DIR / "pushpa_history.json"
PREFS_FILE    = APP_DIR / "pushpa_prefs.json"
STYLE_FILE    = APP_DIR / "pushpa_style.json"
HOTKEYS_FILE      = APP_DIR / "pushpa_hotkeys.json"
CONNECTIONS_FILE  = APP_DIR / "pushpa_connections.json"


# ── Ollama ────────────────────────────────────────────────────────────────────

OLLAMA_PORT   = 11435
OLLAMA_BASE   = f"http://localhost:{OLLAMA_PORT}/v1"
OLLAMA_API    = f"http://localhost:{OLLAMA_PORT}"
OLLAMA_MODEL  = "qwen2.5:14b"
OLLAMA_VISION = "llava-phi3"

# Lightweight model used for background context building.
# Can be set to a smaller/faster model (e.g. "llama3.2:1b") without
# affecting the quality of responses to user queries.
OLLAMA_CONTEXT_MODEL = os.environ.get("OLLAMA_CONTEXT_MODEL", OLLAMA_MODEL)

# How long (seconds) the brain waits before marking context stale
# if no new observations arrive.
CONTEXT_STALE_AFTER = int(os.environ.get("CONTEXT_STALE_AFTER", "120"))

# Memory store path
MEMORY_FILE = APP_DIR / "pushpa_memory.json"

# Business rules store
RULES_FILE = APP_DIR / "pushpa_rules.json"


# ── NVIDIA ────────────────────────────────────────────────────────────────────

NVIDIA_API_KEY      = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_BASE         = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL        = "meta/llama-3.1-8b-instruct"
NVIDIA_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"


# ── Free cloud fallback providers ────────────────────────────────────────────
# These are tried in order when Ollama fails after retries.
# All are OpenAI-compatible and have free tiers. Keys go in .env.local.

GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE      = "https://api.groq.com/openai/v1"
GROQ_MODEL     = "llama-3.1-8b-instant"

CEREBRAS_API_KEY = os.environ.get("CEREBRAS_API_KEY", "")
CEREBRAS_BASE    = "https://api.cerebras.ai/v1"
CEREBRAS_MODEL   = "llama3.1-8b"

TOGETHER_API_KEY = os.environ.get("TOGETHER_API_KEY", "")
TOGETHER_BASE    = "https://api.together.xyz/v1"
TOGETHER_MODEL   = "meta-llama/Llama-3.2-3B-Instruct-Turbo"

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE    = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL   = "meta-llama/llama-3.1-8b-instruct:free"

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
MISTRAL_BASE    = "https://api.mistral.ai/v1"
MISTRAL_MODEL   = "mistral-small-latest"


# ── Jina / affiliate ─────────────────────────────────────────────────────────

JINA_API_KEY       = os.environ.get("JINA_API_KEY") or os.environ.get("JINA_APi_KEY", "")
JINA_SEARCH_URL    = "https://s.jina.ai/"
AFFILIATE_ENDPOINT = os.environ.get("AFFILIATE_URL", "")


# ── Hotkeys ───────────────────────────────────────────────────────────────────

DEFAULT_HOTKEYS = {
    "menu":    "alt+a",
    "history": "alt+h",
    "style":   "alt+t",
    "form":    "alt+f",
}

_MOD_BITS = {
    "alt": 0x0001, "ctrl": 0x0002, "control": 0x0002,
    "shift": 0x0004, "win": 0x0008,
}
_VK_MAP = {chr(i): ord(chr(i).upper()) for i in range(ord('a'), ord('z') + 1)}
_VK_MAP.update({str(i): 0x30 + i for i in range(10)})
_VK_MAP.update({f"f{i}": 0x6F + i for i in range(1, 13)})


# ── History / style limits ────────────────────────────────────────────────────

MAX_HISTORY            = 20
MAX_STYLE_SAMPLES      = 20
MIN_SAMPLES_FOR_PROFILE = 5


# ── Action classification sets ────────────────────────────────────────────────

# Per-action output token caps.
# Lower = faster response. Set to what the action actually needs, not a
# one-size-fits-all 512. The model still stops early when done naturally.
ACTION_MAX_TOKENS: dict[str, int] = {
    # Very short — single line or a few words
    "hashtags":          60,
    "sentiment":         40,
    "hype_score":        80,
    # Short — 1–3 sentences or a compact block
    "shorter":          120,
    "comment":          120,
    "caption":          150,
    "polish":           200,
    "improve":          200,
    "counterpoints":    200,
    # Medium — a full reply or paragraph
    "reply":            280,
    "follow_up":        280,
    "quick_reply_lead": 200,
    "urgency_message":  200,
    "re_engagement":    200,
    "open_house_followup": 250,
    "objection_reply":  250,
    "negotiation_reply":250,
    "schedule_showing": 200,
    "qualify_buyer":    200,
    # Standard — structured output, bullet lists
    "summarize":        350,
    "pros_cons":        380,
    "bull_bear":        380,
    "trade_thesis":     400,
    "key_takeaways":    350,
    "key_catalysts":    320,
    "market_impact":    350,
    "actionable_points":320,
    "counterarguments": 350,
    "risk_summary":     320,
    "trade_risks":      320,
    "simplify_thread":  300,
    "important_changes":320,
    "guidance_summary": 320,
    "market_reaction":  320,
    "explain_indicator":350,
    # Longer — full explanations or detailed reports
    "explain":          420,
    "review":           420,
    "selling_points":   380,
    "neighborhood_highlights": 380,
    "investment_potential":    400,
    "client_summary":          400,
    "luxury_tone":      350,
    "family_tone":      300,
    "investment_angle": 320,
    "instagram_caption_listing": 200,
    "compare_listings": 400,
    "best_for_families":300,
    "explain_contract": 450,
    "contract_risks":   400,
    # Inspect and custom can be long
    "inspect":          512,
    "journal_entry":    350,
    "options":          350,
    "custom":           512,
}
_DEFAULT_MAX_TOKENS = 400   # fallback for any action not listed above


# Actions where inline hyperlinks make sense
HYPERLINK_ACTIONS = {
    "summarize", "pros_cons", "explain", "review",
    "caption", "comment", "hashtags", "options", "improve",
}

# Result goes back into the original app (Insert ↵ is primary)
INSERT_ACTIONS = {
    "reply", "follow_up", "quick_reply_lead", "schedule_showing",
    "qualify_buyer", "objection_reply", "counterpoints", "negotiation_reply",
    "open_house_followup", "re_engagement", "urgency_message",
    "journal_entry", "options", "custom",
}

# Result replaces the selected text (Replace ↵ is primary)
REPLACE_ACTIONS = {
    "polish", "shorter", "improve",
}

# Copy is the primary action
COPY_PRIMARY_ACTIONS = {
    "summarize", "explain", "pros_cons", "review", "caption", "hashtags",
    "comment", "sentiment", "bull_bear", "trade_thesis", "counterarguments",
    "inspect",
    "hype_score", "simplify_thread", "key_catalysts", "market_impact",
    "key_takeaways", "trade_risks", "actionable_points", "important_changes",
    "guidance_summary", "market_reaction", "explain_indicator", "risk_summary",
    "client_summary", "selling_points", "neighborhood_highlights",
    "investment_potential", "luxury_tone", "family_tone", "investment_angle",
    "instagram_caption_listing", "compare_listings", "best_for_families",
    "explain_contract", "contract_risks",
}

# Actions where the user's personal writing style is injected
STYLE_INJECT_ACTIONS = {
    "reply", "follow_up", "polish", "improve", "options", "caption", "comment",
}

# Actions that receive visual dashboard layout (not plain text)
VISUAL_ACTIONS = {
    "pros_cons", "bull_bear", "sentiment", "hype_score", "trade_thesis",
    "market_impact", "key_takeaways", "trade_risks", "actionable_points",
    "key_catalysts", "counterarguments", "simplify_thread", "important_changes",
    "guidance_summary", "market_reaction", "explain_indicator",
    "selling_points", "neighborhood_highlights", "investment_potential",
    "client_summary", "compare_listings", "explain_contract", "contract_risks",
    "risk_summary", "summarize", "inspect",
}


# ── Tone definitions ─────────────────────────────────────────────────────────

TONES = [
    ("Pro",      "professional"),
    ("Friendly", "friendly"),
    ("Direct",   "direct"),
    ("Short",    "short"),
]

TONE_INSTRUCTIONS = {
    "professional": (
        "Tone: professional and polished. Confident but not stiff. "
        "Suitable for business communication with clients, executives, or partners."
    ),
    "friendly": (
        "Tone: warm, conversational, and human. Write as if messaging a colleague or "
        "acquaintance. Use contractions. Avoid corporate language."
    ),
    "direct": (
        "Tone: direct and to the point. No pleasantries, no hedging, no filler. "
        "Lead immediately with the key point."
    ),
    "short": (
        "Tone: extremely brief. 1 to 2 sentences maximum. "
        "Cut everything that is not essential to the core message."
    ),
}

SYSTEM_CONTEXT = (
    "You are an AI assistant embedded in a desktop productivity app called AI Cursor. "
    "Users are professionals — sales reps, founders, recruiters, and creators — doing "
    "high-volume communication and content work. "
    "Your outputs must be: human-sounding (never robotic or AI-sounding), concise, and "
    "ready to use without any editing. "
    "Never add preambles like 'Here is your reply:', disclaimers, sign-offs, or "
    "explanations unless explicitly asked. Return only the requested output."
)
