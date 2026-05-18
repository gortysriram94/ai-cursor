"""brain/approval_chain.py — Multi-step approval workflow."""

from dataclasses import dataclass, field


@dataclass
class ApprovalStep:
    action: str
    label:  str
    output: str = ""
    status: str = "pending"   # pending | approved | skipped | rejected


@dataclass
class ApprovalChain:
    steps:   list[ApprovalStep]
    current: int = 0
    status:  str = "active"   # active | complete | cancelled

    def next_pending(self) -> "ApprovalStep | None":
        for i, step in enumerate(self.steps):
            if step.status == "pending":
                self.current = i
                return step
        self.status = "complete"
        return None

    def approve_current(self) -> "ApprovalStep | None":
        if self.current < len(self.steps):
            self.steps[self.current].status = "approved"
        return self.next_pending()

    def skip_current(self) -> "ApprovalStep | None":
        if self.current < len(self.steps):
            self.steps[self.current].status = "skipped"
        return self.next_pending()

    def cancel(self) -> None:
        self.status = "cancelled"


# ── Chain templates (content types that require step-by-step approval) ────────

_CHAIN_TEMPLATES: dict[str, list[tuple[str, str]]] = {
    "approval_item": [
        ("analyze_queue",   "Analyze risks"),
        ("flag_risks",      "Flag issues"),
        ("escalation_list", "Escalate if needed"),
    ],
    "legal_contract": [
        ("explain_contract", "Explain terms"),
        ("contract_risks",   "Identify risks"),
    ],
    "form": [
        ("form_fill", "Preview fill"),
    ],
}


def build_chain(content_type: str) -> "ApprovalChain | None":
    """Return an ApprovalChain for this content type, or None if none applies."""
    rules = _CHAIN_TEMPLATES.get(content_type)
    if not rules:
        return None
    steps = [ApprovalStep(action=ak, label=lbl) for ak, lbl in rules]
    return ApprovalChain(steps=steps, current=0, status="active")
