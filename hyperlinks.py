"""
hyperlinks.py — Jina enrichment, affiliate links, URL extraction,
                _apply_hyperlinks, _render_markdown_links, enrich_with_hyperlinks,
                _build_link_aware_prompt.
"""

import re
import json
import threading
import webbrowser
import urllib.parse

import requests

from config import JINA_API_KEY, JINA_SEARCH_URL, AFFILIATE_ENDPOINT, TONE_INSTRUCTIONS
from log import log


# ── URL extraction ────────────────────────────────────────────────────────────

_URL_RE = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]{6,}')


def _extract_urls(text: str) -> list[str]:
    """Return deduplicated list of URLs found in text, max 6."""
    return list(dict.fromkeys(_URL_RE.findall(text)))[:6]


# ── Jina reader ───────────────────────────────────────────────────────────────

def _jina_headers() -> dict:
    h = {"Accept": "application/json"}
    if JINA_API_KEY:
        h["Authorization"] = f"Bearer {JINA_API_KEY}"
    return h


def _jina_read(url: str) -> dict:
    """Fetch page content via Jina Reader. Returns {title, content, url} or {}."""
    try:
        res = requests.get(
            f"https://r.jina.ai/{url}",
            headers=_jina_headers(),
            timeout=15,
        )
        return res.json().get("data", {})
    except Exception:
        return {}


# ── Jina search ───────────────────────────────────────────────────────────────

def _jina_search(query: str) -> str:
    """Returns top URL for query via Jina Search, or empty string."""
    try:
        res = requests.get(
            JINA_SEARCH_URL + urllib.parse.quote(query),
            headers=_jina_headers(),
            timeout=8,
        )
        data    = res.json()
        results = data.get("data", [])
        return results[0].get("url", "") if results else ""
    except Exception:
        return ""


# ── Affiliate cache ───────────────────────────────────────────────────────────

_affiliate_cache:   dict[str, str] = {}
_affiliate_fetched: list[bool]     = [False]


def _load_affiliates() -> dict[str, str]:
    """Fetch affiliate map from admin endpoint once per session."""
    if _affiliate_fetched[0]:
        return _affiliate_cache
    _affiliate_fetched[0] = True
    if not AFFILIATE_ENDPOINT:
        return _affiliate_cache
    try:
        res = requests.get(AFFILIATE_ENDPOINT, timeout=5)
        if res.ok:
            _affiliate_cache.update(res.json())
    except Exception:
        pass
    return _affiliate_cache


# ── Link-aware prompt builder ─────────────────────────────────────────────────

def _build_link_aware_prompt(page_contents: dict[str, dict],
                               original_text: str,
                               action: str,
                               tone: str) -> str:
    from context import compose_context

    tone_instr  = TONE_INSTRUCTIONS[tone]
    pages_block = ""
    for i, (url, page) in enumerate(page_contents.items(), 1):
        title   = page.get("title", f"Option {i}")
        content = (page.get("content") or page.get("text") or "")[:700]
        pages_block += f"\n---\nOption {i}: [{title}]({url})\n{content}\n"

    system = compose_context()

    task = (
        "The user has shared multiple pages/links. Read the summaries and respond.\n"
        "Rules:\n"
        "- When referencing a page use markdown: [descriptive label](url)\n"
        "- Give a clear, opinionated recommendation if the user is deciding\n"
        "- One sentence max per option unless detail is needed\n"
        "- Return only the response, no preamble\n\n"
        f"Pages:\n{pages_block}"
    )

    if original_text and original_text not in ("", " "):
        task += f"\n\nUser's question/context:\n{original_text}"

    return "\n\n".join([system, tone_instr, task])


# ── Term extraction ───────────────────────────────────────────────────────────

def _extract_link_terms(text: str) -> list[str]:
    """Extract exact phrases from the response that are worth hyperlinking."""
    from ai import _call_ai_simple

    prompt = (
        "From the text below, find up to 5 specific words or short phrases that:\n"
        "- Are product names, tools, companies, platforms, or named topics\n"
        "- EXIST VERBATIM in the text — copy them exactly as they appear\n"
        "- A reader would benefit from clicking to learn more\n"
        "Return ONLY a JSON array of strings copied exactly from the text. "
        "No explanation, no extra words.\n\n"
        f"Text:\n{text[:1200]}"
    )
    result = _call_ai_simple(prompt, max_tokens=100, timeout=6)
    if not result:
        return []
    result = result.strip()
    if result.startswith("```"):
        result = re.sub(r"```[a-z]*\n?", "", result).strip()
    match = re.search(r'\[.*?\]', result, re.DOTALL)
    if match:
        result = match.group(0)
    try:
        terms      = json.loads(result)
        text_lower = text.lower()
        return [t for t in terms
                if isinstance(t, str) and t.lower() in text_lower][:5]
    except Exception:
        log(f"[LINK] Term extraction parse failed: {result[:80]}")
        return []


# ── Apply hyperlinks to Text widget ──────────────────────────────────────────

def _apply_hyperlinks(text_widget, response: str, links: dict[str, str]):
    """Tag matched terms in the Text widget as clickable hyperlinks."""
    from ui.icons import PAW_COLOR

    try:
        was_disabled = str(text_widget.cget("state")) == "disabled"
        if was_disabled:
            text_widget.configure(state="normal")

        content       = text_widget.get("1.0", "end-1c")
        content_lower = content.lower()
        applied       = 0

        for idx, (term, url) in enumerate(links.items()):
            term_lower = term.lower()
            start      = 0
            while True:
                pos = content_lower.find(term_lower, start)
                if pos == -1:
                    break
                tag = f"hyperlink_{idx}_{pos}"
                si  = f"1.0 + {pos} chars"
                ei  = f"1.0 + {pos + len(term)} chars"
                text_widget.tag_add(tag, si, ei)
                text_widget.tag_configure(tag, foreground=PAW_COLOR, underline=True)
                text_widget.tag_bind(tag, "<Button-1>", lambda e, u=url: webbrowser.open(u))
                text_widget.tag_bind(tag, "<Enter>", lambda e: text_widget.configure(cursor="hand2"))
                text_widget.tag_bind(tag, "<Leave>", lambda e: text_widget.configure(cursor=""))
                start   = pos + len(term)
                applied += 1

        if was_disabled:
            text_widget.configure(state="disabled")

        log(f"[LINK] Applied {applied} hyperlink(s) in result")
    except Exception as e:
        log(f"[LINK] Apply error: {e}")


def _render_markdown_links(text_widget):
    """Parse [label](url) in the Text widget and replace with clickable hyperlinks."""
    from ui.icons import PAW_COLOR

    was_disabled = str(text_widget.cget("state")) == "disabled"
    text_widget.configure(state="normal")

    content = text_widget.get("1.0", "end-1c")
    matches = list(re.finditer(r'\[([^\]]+)\]\((https?://[^\)]+)\)', content))

    for match in reversed(matches):
        label     = match.group(1)
        url       = match.group(2)
        start_pos = match.start()
        end_pos   = match.end()

        si = f"1.0 + {start_pos} chars"
        ei = f"1.0 + {end_pos} chars"

        text_widget.delete(si, ei)

        tag = f"mdlink_{start_pos}"
        text_widget.insert(si, label, tag)
        text_widget.tag_configure(tag, foreground=PAW_COLOR, underline=True)
        text_widget.tag_bind(tag, "<Button-1>", lambda e, u=url: webbrowser.open(u))
        text_widget.tag_bind(tag, "<Enter>",    lambda e: text_widget.configure(cursor="hand2"))
        text_widget.tag_bind(tag, "<Leave>",    lambda e: text_widget.configure(cursor=""))

    if was_disabled:
        text_widget.configure(state="disabled")


# ── Main enrichment entry point ───────────────────────────────────────────────

def enrich_with_hyperlinks(text_widget, response: str):
    """Background: extract terms → resolve URLs → apply inline hyperlinks."""
    if len(response.strip()) < 40:
        log("[LINK] Response too short for enrichment — skipping")
        return

    def _run():
        affiliates = _load_affiliates()
        terms      = _extract_link_terms(response)
        if not terms:
            log("[LINK] No linkable terms found in response")
            return

        log(f"[LINK] Terms to link: {terms}")
        links: dict[str, str] = {}
        for term in terms:
            term_lower = term.lower()
            aff_url    = next(
                (url for key, url in affiliates.items()
                 if key in term_lower or term_lower in key),
                None,
            )
            url = aff_url or _jina_search(term)
            if url:
                links[term] = url
                log(f"[LINK] {term} → {url[:60]}")
            else:
                log(f"[LINK] No URL found for: {term}")

        if links:
            try:
                def _safe_apply(tw=text_widget, r=response, lk=links):
                    try:
                        if tw.winfo_exists():
                            _apply_hyperlinks(tw, r, lk)
                    except Exception as e:
                        log(f"[LINK] Apply skipped (window closed): {e}")
                text_widget.after(0, _safe_apply)
            except Exception as e:
                log(f"[LINK] Schedule error: {e}")

    threading.Thread(target=_run, daemon=True).start()
