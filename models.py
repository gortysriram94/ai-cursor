"""
models.py — curated model catalog with branded display names and performance specs.

The display names shown in the UI are branded aliases. Underlying Ollama model IDs
are unchanged — we're not modifying any model weights.
"""

MODELS: list[dict] = [

    # ── Main AI models ────────────────────────────────────────────────────────

    {
        "id":       "qwen2.5:14b",
        "name":     "Aura 14B",
        "tagline":  "Best quality · most capable",
        "size_gb":  9.0,
        "ram_gb":   12,
        "speed":    "~15 tok/s",
        "stars":    5,
        "badge":    "Recommended",
        "badge_col":"accent",
        "best_for": "Writing, analysis, reasoning, coding",
        "category": "main",
    },
    {
        "id":       "qwen2.5:7b",
        "name":     "Aura 7B",
        "tagline":  "Balanced speed and quality",
        "size_gb":  4.7,
        "ram_gb":   8,
        "speed":    "~30 tok/s",
        "stars":    4,
        "badge":    "Fast",
        "badge_col":"green",
        "best_for": "General use, replies, summaries",
        "category": "main",
    },
    {
        "id":       "qwen2.5:3b",
        "name":     "Aura 3B",
        "tagline":  "Lightweight and very fast",
        "size_gb":  2.0,
        "ram_gb":   4,
        "speed":    "~60 tok/s",
        "stars":    3,
        "badge":    "",
        "badge_col":"",
        "best_for": "Quick responses on low-RAM machines",
        "category": "main",
    },
    {
        "id":       "phi4:14b",
        "name":     "Edge 14B",
        "tagline":  "Efficient flagship reasoning",
        "size_gb":  9.1,
        "ram_gb":   12,
        "speed":    "~15 tok/s",
        "stars":    5,
        "badge":    "",
        "badge_col":"",
        "best_for": "Reasoning, math, coding, analysis",
        "category": "main",
    },
    {
        "id":       "phi4-mini:3.8b",
        "name":     "Edge 4B",
        "tagline":  "Compact reasoning model",
        "size_gb":  2.5,
        "ram_gb":   6,
        "speed":    "~50 tok/s",
        "stars":    3,
        "badge":    "",
        "badge_col":"",
        "best_for": "Fast reasoning, coding helpers",
        "category": "main",
    },
    {
        "id":       "mistral:7b",
        "name":     "Nova 7B",
        "tagline":  "Strong writing and instruction",
        "size_gb":  4.1,
        "ram_gb":   8,
        "speed":    "~28 tok/s",
        "stars":    4,
        "badge":    "",
        "badge_col":"",
        "best_for": "Writing, instruction following, reasoning",
        "category": "main",
    },
    {
        "id":       "gemma2:9b",
        "name":     "Prism 9B",
        "tagline":  "Balanced open model",
        "size_gb":  5.4,
        "ram_gb":   10,
        "speed":    "~22 tok/s",
        "stars":    4,
        "badge":    "",
        "badge_col":"",
        "best_for": "General writing, balanced performance",
        "category": "main",
    },
    {
        "id":       "gemma2:2b",
        "name":     "Prism 2B",
        "tagline":  "Ultra-lightweight model",
        "size_gb":  1.6,
        "ram_gb":   4,
        "speed":    "~80 tok/s",
        "stars":    2,
        "badge":    "",
        "badge_col":"",
        "best_for": "Ultra-fast responses, simple tasks",
        "category": "main",
    },
    {
        "id":       "deepseek-r1:7b",
        "name":     "Reason 7B",
        "tagline":  "Step-by-step reasoning specialist",
        "size_gb":  4.7,
        "ram_gb":   8,
        "speed":    "~28 tok/s",
        "stars":    4,
        "badge":    "Reasoning",
        "badge_col":"blue",
        "best_for": "Analysis, math, logic, research tasks",
        "category": "main",
    },
    {
        "id":       "deepseek-r1:1.5b",
        "name":     "Reason 1B",
        "tagline":  "Tiny fast reasoning model",
        "size_gb":  1.1,
        "ram_gb":   4,
        "speed":    "~90 tok/s",
        "stars":    2,
        "badge":    "",
        "badge_col":"",
        "best_for": "Fast logical tasks, very limited RAM",
        "category": "main",
    },
    {
        "id":       "llama3.2:3b",
        "name":     "Swift 3B",
        "tagline":  "Compact general model",
        "size_gb":  2.0,
        "ram_gb":   4,
        "speed":    "~55 tok/s",
        "stars":    3,
        "badge":    "",
        "badge_col":"",
        "best_for": "General tasks, quick replies",
        "category": "main",
    },
    {
        "id":       "llama3.2:1b",
        "name":     "Swift 1B",
        "tagline":  "Smallest and fastest model",
        "size_gb":  1.3,
        "ram_gb":   4,
        "speed":    "~100 tok/s",
        "stars":    2,
        "badge":    "",
        "badge_col":"",
        "best_for": "Ultra-fast responses, minimal resources",
        "category": "main",
    },

    # ── Vision models ─────────────────────────────────────────────────────────

    {
        "id":       "llava-phi3",
        "name":     "Vision",
        "tagline":  "Screen and image understanding",
        "size_gb":  2.9,
        "ram_gb":   6,
        "speed":    "~20 tok/s",
        "stars":    3,
        "badge":    "Vision",
        "badge_col":"purple",
        "best_for": "Screenshot analysis, UI inspect, image Q&A",
        "category": "vision",
    },

    # ── Embedding / search models ─────────────────────────────────────────────

    {
        "id":       "nomic-embed-text",
        "name":     "Search Index",
        "tagline":  "Powers local semantic search",
        "size_gb":  0.3,
        "ram_gb":   1,
        "speed":    "Fast",
        "stars":    4,
        "badge":    "RAG",
        "badge_col":"teal",
        "best_for": "Required for Dev Panel vector search and local RAG",
        "category": "embed",
    },
]

DEFAULT_MAIN_MODEL = "qwen2.5:14b"

CATEGORY_LABELS = {
    "main":   "AI Models",
    "vision": "Vision",
    "embed":  "Search & Embeddings",
}

# Badge colours mapped to hex
BADGE_COLORS = {
    "accent": "#DA7756",
    "green":  "#4a8c5c",
    "blue":   "#4a6a8c",
    "purple": "#7a4a8c",
    "teal":   "#4a8c7a",
    "":       "#38332A",
}


def get_by_id(model_id: str) -> dict | None:
    return next((m for m in MODELS if m["id"] == model_id), None)


def get_by_category(category: str) -> list[dict]:
    return [m for m in MODELS if m["category"] == category]


def display_name(model_id: str) -> str:
    m = get_by_id(model_id)
    return m["name"] if m else model_id


def stars(n: int) -> str:
    return "★" * n + "☆" * (5 - n)
