"""
brain/signals.py — Lightweight deterministic content signal extraction.

Runs in Stage 1 of the brain pipeline (instant, no LLM).
Extracts only structural / format-level signals — nothing semantic.

Rule: if you need to *understand* content to extract it, it belongs to the LLM.
"""

import re
from dataclasses import dataclass

_URL_RE     = re.compile(r"https?://\S+")
_EMAIL_HDR  = re.compile(r"^(From|To|Subject|Cc|Bcc|Date)\s*:", re.MULTILINE | re.IGNORECASE)
_QUOTED     = re.compile(r"^>", re.MULTILINE)
_CODE       = re.compile(r"```")
_ATTACH     = re.compile(r"\b(attached|attachment|see file|find attached|enclosed)\b", re.IGNORECASE)


@dataclass
class ContentSignals:
    has_email_headers:  bool   # From:/To:/Subject: — RFC 2822 headers present
    has_quoted_thread:  bool   # "> " quoted lines — email/markdown reply thread
    has_code:           bool   # ``` fenced code blocks
    has_urls:           bool   # http(s) links present
    has_attachment_ref: bool   # words like "attached", "see file"
    word_count:         int    # rough content length signal

    def summary(self) -> str:
        """One-line string injected into LLM prompts as structured metadata."""
        flags = []
        if self.has_email_headers:  flags.append("email_headers=true")
        if self.has_quoted_thread:  flags.append("quoted_thread=true")
        if self.has_code:           flags.append("code=true")
        if self.has_urls:           flags.append("urls=true")
        if self.has_attachment_ref: flags.append("attachment_ref=true")
        flags.append(f"words={self.word_count}")
        return ", ".join(flags)


def extract_signals(text: str) -> ContentSignals:
    return ContentSignals(
        has_email_headers  = bool(_EMAIL_HDR.search(text)),
        has_quoted_thread  = bool(_QUOTED.search(text)),
        has_code           = bool(_CODE.search(text)),
        has_urls           = bool(_URL_RE.search(text)),
        has_attachment_ref = bool(_ATTACH.search(text)),
        word_count         = len(text.split()),
    )
