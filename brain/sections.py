"""
brain/sections.py — Semantic content segmentation.

Splits raw visible text into typed sections without any LLM call.
Used by the scroll minimap and section navigation.

Section types:
  heading       — markdown # headings or ALL-CAPS short lines
  message_user  — user message in a chat app
  message_ai    — AI response in a chat app
  code          — fenced or indented code block
  list          — bullet / numbered list
  generic       — everything else
"""

import re
from dataclasses import dataclass, field as dc_field

# Chat app keywords — if app/title contains one, use chat heuristics
_CHAT_APPS = {
    "claude", "chatgpt", "gemini", "copilot", "perplexity",
    "bard", "grok", "character", "poe", "you.com",
}

# Approximate user-message indicators
_USER_PREFIXES = re.compile(
    r'^(you|user|me|human|>|<<)[\s:»]', re.IGNORECASE)

# Approximate AI-response indicators
_AI_PREFIXES = re.compile(
    r'^(claude|chatgpt|assistant|ai|gpt|gemini|copilot|bot|system)[\s:»]',
    re.IGNORECASE,
)


@dataclass
class Section:
    id:            str
    type:          str    # heading | message_user | message_ai | code | list | generic
    text:          str
    index:         int
    heading_level: int  = 0   # 1-6 for headings, 0 otherwise
    word_count:    int  = 0
    line_start:    int  = 0   # approx line index in source text

    @property
    def label(self) -> str:
        """Short display label for the minimap tooltip."""
        first = self.text.split("\n")[0].strip()[:60]
        return first or self.type

    @property
    def color_key(self) -> str:
        """Lookup key into the minimap color table."""
        if self.type == "heading":
            return "heading"
        if self.type == "message_user":
            return "user"
        if self.type == "message_ai":
            return "ai"
        if self.type == "code":
            return "code"
        if self.type == "list":
            return "list"
        return "generic"


def detect_sections(text: str,
                    app_name: str = "",
                    window_title: str = "") -> list[Section]:
    """
    Primary entry point.  Returns sections in document order.
    Fast — no LLM, pure regex.
    """
    if not text.strip():
        return []

    is_chat = _is_chat_app(app_name, window_title)
    text    = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks  = _extract_blocks(text.split("\n"))
    result  = []
    chat_turn = 0

    for i, blk in enumerate(blocks):
        content = blk["text"].strip()
        if not content:
            continue

        sec_type = _classify(content, is_chat, i, chat_turn)
        if sec_type in ("message_user", "message_ai"):
            chat_turn += 1

        result.append(Section(
            id            = f"sec_{i}",
            type          = sec_type,
            text          = content,
            index         = len(result),
            heading_level = _heading_level(content) if sec_type == "heading" else 0,
            word_count    = len(content.split()),
            line_start    = blk["line_start"],
        ))

    return result


def find_current_section(sections: list[Section],
                          visible_text: str) -> int:
    """
    Given the text currently visible on screen, return the index
    of the section that best matches the top of the viewport.
    Returns -1 if undetermined.
    """
    if not sections or not visible_text:
        return -1

    probe = visible_text.strip()[:120].lower()
    if not probe:
        return -1

    best_idx   = -1
    best_score = 0

    for sec in sections:
        sec_text = sec.text.lower()
        # Score = length of the longest common prefix
        score = 0
        for a, b in zip(probe, sec_text):
            if a == b:
                score += 1
            else:
                break
        if score > best_score and score >= 10:
            best_score = score
            best_idx   = sec.index

    return best_idx


# ── Internal helpers ──────────────────────────────────────────────────────────

def _is_chat_app(app_name: str, window_title: str) -> bool:
    combined = (app_name + " " + window_title).lower()
    return any(kw in combined for kw in _CHAT_APPS)


def _extract_blocks(lines: list[str]) -> list[dict]:
    """Group lines into logical blocks."""
    blocks: list[dict] = []
    current: list[str] = []
    start   = 0
    in_code = False

    def _flush():
        nonlocal current
        if current:
            blocks.append({"text": "\n".join(current), "line_start": start})
            current = []

    for i, line in enumerate(lines):
        stripped = line.strip()

        # ── Code fence ────────────────────────────────────────────────────────
        if stripped.startswith("```"):
            if in_code:
                current.append(line)
                blocks.append({"text": "\n".join(current), "line_start": start})
                current = []
                in_code = False
            else:
                _flush()
                in_code = True
                start   = i
                current = [line]
            continue

        if in_code:
            current.append(line)
            continue

        # ── Blank line = block separator ──────────────────────────────────────
        if not stripped:
            _flush()
            continue

        # ── Markdown heading = own block ──────────────────────────────────────
        if re.match(r'^#{1,6}\s', stripped):
            _flush()
            blocks.append({"text": line, "line_start": i})
            continue

        if not current:
            start = i
        current.append(line)

    _flush()
    return [b for b in blocks if b["text"].strip()]


def _classify(text: str, is_chat: bool, block_idx: int, chat_turn: int) -> str:
    stripped = text.strip()

    # Code block
    if stripped.startswith("```"):
        return "code"
    # Indented code (≥ 3 lines all indented)
    lines = stripped.split("\n")
    if len(lines) >= 3:
        indented = sum(1 for l in lines if l and (l[0] in " \t"))
        if indented / len(lines) >= 0.8:
            return "code"

    # Markdown heading
    if re.match(r'^#{1,6}\s', stripped):
        return "heading"

    # ALL-CAPS short line
    if len(stripped) < 80 and stripped.isupper() and len(stripped.split()) >= 2:
        return "heading"

    # List block
    if _is_list(stripped):
        return "list"

    # Chat heuristics
    if is_chat:
        first_line = lines[0].strip()

        # Explicit role prefix (Claude, ChatGPT, You, User, etc.)
        if _USER_PREFIXES.match(first_line):
            return "message_user"
        if _AI_PREFIXES.match(first_line):
            return "message_ai"

        words = len(stripped.split())
        # Short → user; long or multi-line / has code → AI
        if words <= 40 and len(lines) <= 4 and "```" not in text:
            return "message_user"
        return "message_ai"

    return "generic"


def _is_list(text: str) -> bool:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) < 2:
        return False
    list_lines = sum(
        1 for l in lines if re.match(r'^(\d+[.)]\s|[*\-•]\s)', l))
    return list_lines / len(lines) >= 0.55


def _heading_level(text: str) -> int:
    m = re.match(r'^(#{1,6})\s', text.strip())
    return len(m.group(1)) if m else 1
