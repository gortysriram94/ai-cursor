"""
rag_test.py — CLI test harness for the RAG pipeline.

Usage:
    python rag_test.py                        # run all context scenarios
    python rag_test.py --context trading      # single context
    python rag_test.py --action trade_thesis  # single action
    python rag_test.py --list                 # list all test scenarios

Tests items 50-51: per-context query quality, relevance gate, speed tier compliance,
and (when API keys are set) enterprise provider connectivity.

Requires Jina API key (JINA_API_KEY in .env.local) for live retrieval tests.
Enterprise provider tests require their respective credentials.
"""
import sys
import time
import argparse

# Ensure project root is importable
import os
sys.path.insert(0, os.path.dirname(__file__))


# ── Test scenarios ────────────────────────────────────────────────────────────
# Each scenario: (context_type, action, sample_entities, sample_text)
SCENARIOS = [
    ("trading",          "trade_thesis",         ["AAPL"],           "AAPL earnings beat, EPS up 15%"),
    ("trading_news",     "market_reaction",       ["TSLA"],           "TSLA drops 8% after recall"),
    ("trading_charts",   "explain_indicator",     ["BTC"],            "RSI at 72 on daily chart"),
    ("sales",            "summarize",             ["Salesforce"],     "Salesforce Q3 revenue guidance cut"),
    ("outbound",         "options",               ["Stripe"],         "Stripe hiring 200 engineers"),
    ("customer_support", "explain",               ["Slack"],          "Slack notifications not working"),
    ("ecommerce",        "pros_cons",             ["Sony WH-1000XM5"],"Best noise cancelling headphones"),
    ("developer",        "explain",               ["React"],          "React 19 concurrent features"),
    ("finance",          "key_takeaways",         ["Apple Inc"],      "Apple reports record Q4 revenue"),
    ("real_estate",      "neighborhood_highlights",["123 Main St"],   "Listing in downtown Austin"),
    ("real_estate_legal","explain_contract",       ["contingency clause"],"Inspection contingency period"),
    ("research",         "summarize",             ["mRNA vaccines"],  "Efficacy of mRNA vs traditional"),
    ("content",          "options",               ["LinkedIn"],       "Trending posts about AI tools"),
    ("enterprise",       "summarize",             ["SOC 2"],          "SOC 2 Type II audit requirements"),
    ("design",           "explain",               ["card component"], "Card vs modal for mobile UI"),
    ("shopping",         "pros_cons",             ["MacBook Pro M3"], "MacBook Pro M3 16GB vs 36GB"),
    ("generic",          "summarize",             ["OpenAI"],         "OpenAI launches new model"),
]


def _color(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

GREEN  = "32"
YELLOW = "33"
RED    = "31"
DIM    = "2"
BOLD   = "1"


def run_scenario(ctx: str, action: str, entities: list, text: str,
                 verbose: bool = False) -> dict:
    from brain.context_bundle import ContextBundle
    from retrieval_engine import retrieve_for_action

    b = ContextBundle(market=ctx, entities=entities, confidence=0.85)
    t0 = time.monotonic()
    docs = retrieve_for_action(text, action, b)
    elapsed = (time.monotonic() - t0) * 1000

    from rag_config import get_strategy, SPEED_TIER_TIMEOUTS
    strategy = get_strategy(ctx)
    budget   = SPEED_TIER_TIMEOUTS.get(strategy.speed_tier, 5) * 1000

    result = {
        "context":  ctx,
        "action":   action,
        "entity":   entities[0] if entities else "",
        "docs":     len(docs),
        "latency":  int(elapsed),
        "budget":   int(budget),
        "in_budget":elapsed <= budget * 1.1,   # 10% tolerance
        "passed":   len(docs) > 0,
    }
    if verbose and docs:
        result["titles"] = [d.title or d.source[:60] for d in docs[:3]]
    return result


def print_result(r: dict, verbose: bool = False):
    ok   = r["passed"] and r["in_budget"]
    icon = _color("✓", GREEN) if ok else (_color("~", YELLOW) if r["passed"] else _color("✗", RED))
    latency_col = GREEN if r["in_budget"] else YELLOW
    print(f"  {icon}  {r['context']:<22} {r['action']:<22} "
          f"docs={r['docs']}  "
          f"{_color(str(r['latency'])+'ms', latency_col)}/{r['budget']}ms")
    if verbose and r.get("titles"):
        for t in r["titles"]:
            print(f"       └─ {_color(t, DIM)}")


def test_enterprise_providers():
    """Smoke-test each enterprise provider's is_available() against real credentials."""
    print(_color("\nEnterprise Provider Connectivity", BOLD))
    from connections import load_connections, instantiate_ai_provider, instantiate_retrieval_provider
    from keychain import load as kc_load

    conns = load_connections()
    if not conns:
        print("  No connections configured — skipping.")
        return

    for conn in conns:
        creds = kc_load(conn.credential_ref)
        p = (instantiate_ai_provider(conn, creds) if conn.is_ai_provider()
             else instantiate_retrieval_provider(conn, creds))
        ok = bool(p and p.is_available())
        icon = _color("✓", GREEN) if ok else _color("✗", RED)
        print(f"  {icon}  {conn.name:<30} ({conn.type})")


def main():
    parser = argparse.ArgumentParser(description="RAG pipeline test harness")
    parser.add_argument("--context", help="Run only this context")
    parser.add_argument("--action",  help="Run only this action")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--list",    action="store_true", help="List scenarios")
    parser.add_argument("--enterprise", action="store_true",
                        help="Also test enterprise provider connections")
    args = parser.parse_args()

    if args.list:
        print("Available scenarios:")
        for ctx, action, ents, _ in SCENARIOS:
            print(f"  {ctx:<22} {action:<22}  entity={ents[0]}")
        return

    scenarios = [
        s for s in SCENARIOS
        if (not args.context or s[0] == args.context)
        and (not args.action  or s[1] == args.action)
    ]

    if not scenarios:
        print(f"No scenarios match context={args.context!r} action={args.action!r}")
        sys.exit(1)

    print(_color(f"Running {len(scenarios)} scenario(s)", BOLD))
    print()

    results  = []
    passed   = 0
    in_time  = 0

    for ctx, action, entities, text in scenarios:
        r = run_scenario(ctx, action, entities, text, verbose=args.verbose)
        results.append(r)
        print_result(r, verbose=args.verbose)
        if r["passed"]:
            passed  += 1
        if r["in_budget"]:
            in_time += 1

    print()
    total = len(results)
    print(_color(f"Results: {passed}/{total} returned docs  "
                 f"| {in_time}/{total} within speed budget", BOLD))

    if args.enterprise:
        test_enterprise_providers()


if __name__ == "__main__":
    main()
