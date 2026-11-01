"""Server-side release policy evaluator (EP-08), driven by the kit's release_gate.yaml.

Default is deny. The evaluator is the single place publication is decided; renderers and
download endpoints call `require_publishable` and never re-implement the checks.

Supports HACKATHON_DEMO profile with test roles.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from .profiles import get_config, ProfileConfig

POLICY_FILE = Path(__file__).resolve().parents[2] / "IREME_INSIGHT_FULL_ENGINE_KIT" / "09_MACHINE_CONTRACTS" / "policies" / "release_gate.yaml"
REQUIRED_ROLES = ("statistical_reviewer", "privacy_reviewer", "release_reviewer")
DEMO_REQUIRED_ROLES = ("test-statistician", "test-privacy-officer", "test-release-authority")


class ReleaseDenied(PermissionError):
    def __init__(self, decision: "Decision"):
        super().__init__("; ".join(decision.reasons) or decision.status)
        self.decision = decision


@dataclass(frozen=True)
class Decision:
    status: str            # publish | restricted_draft | deny
    reasons: tuple


def load_policy() -> dict:
    return yaml.safe_load(POLICY_FILE.read_text(encoding="utf-8"))


def evaluate(checks: dict, blocking_flags: set, signatures: list, author_id: str, policy: dict | None = None, profile: ProfileConfig = None):
    """checks: {policy_required_name: True/False}; blocking_flags: names from never_allow/allow_restricted lists;
    signatures: [{'reviewer_id','role'}] recorded by the approval service (not by the report author)."""
    p = policy or load_policy()
    reasons = []
    never = set(p["never_allow_publication_when"])
    hit_never = sorted(never & set(blocking_flags))
    if hit_never:
        return Decision("deny", tuple(f"blocking condition: {h}" for h in hit_never))
    for name in p["required"]:
        if name == "authorized_reviewer_signatures":
            continue
        if checks.get(name) is not True:
            reasons.append(f"required check not passed: {name}")
    # Use demo roles for hackathon demo profile
    bypass = bool(profile and profile.bypass_human_approvals)
    if bypass:
        # Demo freedom: the analyst's own signature is sufficient; other required
        # checks still apply so no unsafe report can be published silently.
        required_roles = ()
    elif profile and profile.name.value == "HACKATHON_DEMO":
        required_roles = DEMO_REQUIRED_ROLES
    else:
        required_roles = REQUIRED_ROLES
    roles = {s["role"] for s in signatures if s.get("reviewer_id") and s["reviewer_id"] != author_id}
    missing = [r for r in required_roles if r not in roles]
    if not bypass and any(s.get("reviewer_id") == author_id for s in signatures):
        reasons.append("author cannot sign their own report")
    if missing:
        reasons.append("missing reviewer signatures: " + ", ".join(missing))
    if not reasons:
        return Decision("publish", ())
    soft = set(p["allow_restricted_draft_when"])
    if set(blocking_flags) and set(blocking_flags) <= soft and not hit_never:
        return Decision("restricted_draft", tuple(reasons) + tuple(f"restricted because: {f}" for f in sorted(blocking_flags)))
    return Decision("deny", tuple(reasons))


def require_publishable(decision):
    if decision.status != "publish":
        raise ReleaseDenied(decision)