"""HACKATHON_DEMO bypass behaviour.

These tests pin the demo freedom contract: the analyst can run the report
lifecycle alone while human approvals are bypassed, the bypass ledger is
runtime-togglable, and GOVERNED_PRODUCTION refuses every toggle.
"""
import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import auth, release_gate  # noqa: E402
from ireme.profiles import (  # noqa: E402
    GOVERNED_PRODUCTION_CONFIG, HACKATHON_DEMO_CONFIG,
    get_bypass_status, get_config, reset_bypass_overrides, set_bypass,
)

CHECKS = {name: True for name in release_gate.load_policy()["required"]
          if name != "authorized_reviewer_signatures"}


def analyst():
    return auth.Principal(
        subject="demo-analyst", tenant="nisr-hackathon", roles=frozenset({"nisr_analyst"}),
        districts=frozenset({"Kamonyi"}), national_scope=True, assurance="aal1",
        expires_at=int(time.time()) + 3600,
    )


class _DemoProfileCase(unittest.TestCase):
    """Run against HACKATHON_DEMO regardless of the ambient profile."""

    def setUp(self):
        self._previous_profile = os.environ.get("IREME_PROFILE")
        os.environ["IREME_PROFILE"] = "HACKATHON_DEMO"
        reset_bypass_overrides()

    def tearDown(self):
        reset_bypass_overrides()
        if self._previous_profile is None:
            os.environ.pop("IREME_PROFILE", None)
        else:
            os.environ["IREME_PROFILE"] = self._previous_profile


class DemoBypassToggles(_DemoProfileCase):
    def test_demo_profile_enables_every_bypass(self):
        self.assertTrue(HACKATHON_DEMO_CONFIG.bypass_independent_statistician)
        self.assertTrue(HACKATHON_DEMO_CONFIG.bypass_human_approvals)
        self.assertTrue(HACKATHON_DEMO_CONFIG.bypass_production_infra)
        self.assertTrue(HACKATHON_DEMO_CONFIG.bypass_verification_gates)

    def test_admin_can_flip_a_toggle_at_runtime(self):
        self.assertTrue(get_bypass_status()["bypass_human_approvals"])
        result = set_bypass("bypass_human_approvals", False)
        self.assertTrue(result["success"])
        self.assertFalse(get_bypass_status()["bypass_human_approvals"])
        self.assertFalse(get_config().bypass_human_approvals)
        reset_bypass_overrides()
        self.assertTrue(get_config().bypass_human_approvals)

    def test_unknown_toggle_is_refused(self):
        result = set_bypass("bypass_everything", True)
        self.assertFalse(result["success"])

    def test_production_refuses_every_toggle(self):
        for name in get_bypass_status():
            result = set_bypass(name, True, GOVERNED_PRODUCTION_CONFIG)
            self.assertFalse(result["success"])
        self.assertFalse(GOVERNED_PRODUCTION_CONFIG.bypass_human_approvals)
        self.assertFalse(GOVERNED_PRODUCTION_CONFIG.bypass_verification_gates)


class DemoSelfService(_DemoProfileCase):
    def test_analyst_reviews_and_publishes_without_a_second_identity(self):
        principal = analyst()
        auth.authorize(principal, "report:review", "nisr-hackathon", "Kamonyi",
                       author=principal.subject, profile=HACKATHON_DEMO_CONFIG)
        auth.authorize(principal, "report:publish", "nisr-hackathon", "Kamonyi",
                       author=principal.subject, profile=HACKATHON_DEMO_CONFIG)

    def test_production_still_requires_independence_and_aal2(self):
        principal = analyst()
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(principal, "report:review", "nisr-hackathon", "Kamonyi",
                           author=principal.subject, profile=GOVERNED_PRODUCTION_CONFIG)

    def test_author_signature_publishes_in_demo_but_not_production(self):
        signature = [{"reviewer_id": "demo-analyst", "role": "nisr_analyst"}]
        demo = release_gate.evaluate(CHECKS, set(), signature, "demo-analyst",
                                     profile=HACKATHON_DEMO_CONFIG)
        prod = release_gate.evaluate(CHECKS, set(), signature, "demo-analyst",
                                     profile=GOVERNED_PRODUCTION_CONFIG)
        self.assertEqual(demo.status, "publish")
        self.assertEqual(prod.status, "deny")

    def test_disabling_the_toggle_restores_the_gate_live(self):
        signature = [{"reviewer_id": "demo-analyst", "role": "nisr_analyst"}]
        set_bypass("bypass_human_approvals", False)
        decision = release_gate.evaluate(CHECKS, set(), signature, "demo-analyst",
                                         profile=get_config())
        self.assertNotEqual(decision.status, "publish")


if __name__ == "__main__":
    unittest.main()
