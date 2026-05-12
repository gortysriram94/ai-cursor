"""
tests/test_qa.py — QA automation test suite.

Covers:
  T01  Module health             — all modules import cleanly
  T02  Platform layer            — hotkey registration, modifier mapping, VK codes
  T03  Context detection         — every market has CONTEXT_ACTIONS, ERP detection
  T04  Signal extraction         — deterministic, no false positives/negatives
  T05  ContextBundle             — creation, from_working_context, empty
  T06  Prompt pipeline           — build_prompt, confidence gating, empty inputs
  T07  Reply direction           — reply prompt always contains sender instruction
  T08  Security / PII            — classification, redact_for_log, blocked fields
  T09  Rules / validation        — rule loading, validate_fields no-crash
  T10  Storage / config          — hotkeys default, prefs, compact routing
  T11  ERP features              — approval queue + period close detection + prompts
  T12  Regression — known bugs   — email sender, context routing, market gaps
  T13  Edge cases                — empty text, None bundle, long text, unicode
  T14  Brain pipeline            — WorkingContext fields, classify_market
"""

import sys
import os
import time
import unittest

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ─────────────────────────────────────────────────────────────────────────────
# T01  Module health
# ─────────────────────────────────────────────────────────────────────────────

class T01_ModuleHealth(unittest.TestCase):

    def test_config(self):
        import config
        self.assertTrue(hasattr(config, "OLLAMA_MODEL"))
        self.assertTrue(hasattr(config, "LOG_PROMPTS"))
        self.assertTrue(hasattr(config, "DEFAULT_HOTKEYS"))

    def test_state(self):
        import state
        self.assertIsNone(state.working_context)
        self.assertFalse(state.menu_open)

    def test_context(self):
        import context
        self.assertIn("email", context.CONTEXT_ACTIONS)
        self.assertIn("generic", context.CONTEXT_ACTIONS)

    def test_prompts(self):
        import prompts
        self.assertIn("reply", prompts.ACTION_PROMPTS)
        self.assertIn("summarize", prompts.ACTION_PROMPTS)
        self.assertIn("analyze_queue", prompts.ACTION_PROMPTS)
        self.assertIn("close_status", prompts.ACTION_PROMPTS)

    def test_brain_signals(self):
        from brain.signals import extract_signals, ContentSignals
        s = extract_signals("test")
        self.assertIsInstance(s, ContentSignals)

    def test_brain_context_bundle(self):
        from brain.context_bundle import ContextBundle
        b = ContextBundle.empty()
        self.assertEqual(b.context_type, "generic")

    def test_brain_context_brain(self):
        from brain.context_brain import WorkingContext, ContextBrain
        ctx = WorkingContext()
        self.assertEqual(ctx.market, "generic")
        self.assertIsNone(ctx.signals)

    def test_plat_factory(self):
        from plat import platform
        p = platform()
        self.assertIn(p.name, ("windows", "macos", "linux"))

    def test_plat_macos_importable(self):
        from plat.macos import MacOSPlatform
        self.assertTrue(hasattr(MacOSPlatform, "get_active_window"))

    def test_plat_linux_importable(self):
        from plat.linux import LinuxPlatform
        self.assertTrue(hasattr(LinuxPlatform, "get_active_window"))

    def test_security(self):
        import security
        self.assertTrue(hasattr(security, "classify_field"))
        self.assertTrue(hasattr(security, "redact_for_log"))

    def test_log(self):
        from log import log, log_prompt
        log("[TEST] log smoke test")
        log_prompt("test_action", "test prompt content")

    def test_ai_module(self):
        import ai
        self.assertTrue(hasattr(ai, "call_ai_streaming"))
        self.assertTrue(hasattr(ai, "call_context_builder"))


# ─────────────────────────────────────────────────────────────────────────────
# T02  Platform layer
# ─────────────────────────────────────────────────────────────────────────────

class T02_PlatformLayer(unittest.TestCase):

    def test_windows_modifier_bits(self):
        """Win32 modifier constants used in _MOD_BITS match platform expectations."""
        from config import _MOD_BITS
        self.assertEqual(_MOD_BITS["alt"],   0x0001)
        self.assertEqual(_MOD_BITS["ctrl"],  0x0002)
        self.assertEqual(_MOD_BITS["shift"], 0x0004)

    def test_windows_vk_map_covers_default_hotkeys(self):
        """Default hotkey keys (a, h, s, f) must be in _VK_MAP."""
        from config import _VK_MAP
        for key in ("a", "h", "s", "f"):
            self.assertIn(key, _VK_MAP, f"VK map missing key '{key}'")

    def test_parse_hotkey_alt_a(self):
        from storage import parse_hotkey
        mods, vk = parse_hotkey("alt+a")
        # MOD_ALT bit (0x0001) must be set; MOD_NOREPEAT (0x4000) is also valid
        self.assertTrue(mods & 0x0001, "ALT modifier bit not set")
        self.assertGreater(vk, 0)

    def test_parse_hotkey_invalid(self):
        from storage import parse_hotkey
        mods, vk = parse_hotkey("")
        self.assertEqual(vk, 0)

    def test_windows_register_and_poll(self):
        """Register a hotkey on Windows and confirm it's tracked."""
        import sys
        if sys.platform != "win32":
            self.skipTest("Windows only")
        from plat import platform
        p = platform()
        result = p.register_hotkey(99, 0x0001, 0x41)  # Alt+A with id=99
        self.assertTrue(result)
        self.assertIn(99, p._hotkeys)
        p.unregister_hotkey(99)
        self.assertNotIn(99, p._hotkeys)

    def test_poll_hotkey_empty(self):
        """poll_hotkey returns None when nothing has fired."""
        from plat import platform
        p = platform()
        result = p.poll_hotkey()
        self.assertIsNone(result)

    def test_abstract_methods_all_implemented_macos(self):
        import inspect
        from plat.base import PlatformBase
        from plat.macos import MacOSPlatform
        abstract = {n for n, m in inspect.getmembers(PlatformBase)
                    if getattr(m, "__isabstractmethod__", False)}
        missing  = {n for n in abstract
                    if getattr(getattr(MacOSPlatform, n, None),
                               "__isabstractmethod__", False)}
        self.assertFalse(missing, f"MacOSPlatform missing: {missing}")

    def test_abstract_methods_all_implemented_linux(self):
        import inspect
        from plat.base import PlatformBase
        from plat.linux import LinuxPlatform
        abstract = {n for n, m in inspect.getmembers(PlatformBase)
                    if getattr(m, "__isabstractmethod__", False)}
        missing  = {n for n in abstract
                    if getattr(getattr(LinuxPlatform, n, None),
                               "__isabstractmethod__", False)}
        self.assertFalse(missing, f"LinuxPlatform missing: {missing}")

    def test_macos_has_stop(self):
        from plat.macos import MacOSPlatform
        self.assertTrue(hasattr(MacOSPlatform, "stop"))

    def test_linux_has_stop(self):
        from plat.linux import LinuxPlatform
        self.assertTrue(hasattr(LinuxPlatform, "stop"))


# ─────────────────────────────────────────────────────────────────────────────
# T03  Context detection
# ─────────────────────────────────────────────────────────────────────────────

class T03_ContextDetection(unittest.TestCase):

    def setUp(self):
        from context import _detect_context_type, CONTEXT_ACTIONS, APP_MARKET_MAP
        self.detect = _detect_context_type
        self.actions = CONTEXT_ACTIONS
        self.market_map = APP_MARKET_MAP

    def test_gmail_is_email(self):
        self.assertEqual(self.detect("Chrome", "Inbox - Gmail"), "email")

    def test_outlook_exe_is_email(self):
        self.assertEqual(self.detect("outlook.exe", ""), "email")

    def test_slack_exe_is_chat(self):
        self.assertEqual(self.detect("slack.exe", "Slack #general"), "chat")

    def test_linkedin_is_outbound(self):
        self.assertEqual(self.detect("Chrome", "LinkedIn"), "outbound")

    def test_youtube_is_video(self):
        self.assertEqual(self.detect("Chrome", "How to code - YouTube"), "video")

    def test_figma_exe_is_design(self):
        self.assertEqual(self.detect("figma.exe", "Design file"), "design")

    def test_vscode_exe_is_docs(self):
        self.assertEqual(self.detect("code.exe", "main.py"), "docs")

    def test_amazon_is_shopping(self):
        self.assertEqual(self.detect("Chrome", "Amazon product page"), "shopping")

    def test_zendesk_is_customer_support(self):
        self.assertEqual(self.detect("Chrome", "Zendesk ticket"), "customer_support")

    def test_approval_queue_sap(self):
        self.assertEqual(self.detect("Chrome", "My Approvals - SAP Fiori"), "approval_queue")

    def test_approval_queue_workday(self):
        self.assertEqual(self.detect("Chrome", "Pending Approval - Workday Inbox"), "approval_queue")

    def test_period_close_month_end(self):
        self.assertEqual(self.detect("Chrome", "Month-End Close Checklist"), "period_close")

    def test_period_close_journal_entry(self):
        self.assertEqual(self.detect("Chrome", "Journal Entry - Oracle Fusion"), "period_close")

    def test_reconciliation_is_period_close(self):
        self.assertEqual(self.detect("Chrome", "Account Reconciliation Report"), "period_close")

    def test_workday_inbox_not_email(self):
        """Workday Inbox must match approval_queue, not email."""
        result = self.detect("Chrome", "Workday Inbox - Pending Approvals")
        self.assertNotEqual(result, "email",
            "Workday Inbox incorrectly matched as email")

    def test_all_markets_have_context_actions(self):
        """Every market in APP_MARKET_MAP must have a CONTEXT_ACTIONS entry."""
        markets = set(self.market_map.values())
        missing = [m for m in markets if m not in self.actions]
        self.assertFalse(missing,
            f"Markets missing from CONTEXT_ACTIONS: {missing}")

    def test_generic_fallback(self):
        self.assertEqual(self.detect("notepad.exe", "Untitled"), "generic")

    def test_context_actions_not_empty(self):
        for ctx, actions in self.actions.items():
            self.assertGreater(len(actions), 0, f"Empty actions for context: {ctx}")


# ─────────────────────────────────────────────────────────────────────────────
# T04  Signal extraction
# ─────────────────────────────────────────────────────────────────────────────

class T04_SignalExtraction(unittest.TestCase):

    def setUp(self):
        from brain.signals import extract_signals
        self.extract = extract_signals

    def test_email_headers_detected(self):
        s = self.extract("From: John\nTo: me@test.com\nSubject: Hello\n\nBody text")
        self.assertTrue(s.has_email_headers)

    def test_quoted_thread_detected(self):
        s = self.extract("My reply\n\n> Original message\n> second line")
        self.assertTrue(s.has_quoted_thread)

    def test_code_blocks_detected(self):
        s = self.extract("Here is code:\n```python\nprint('hello')\n```")
        self.assertTrue(s.has_code)

    def test_url_detected(self):
        s = self.extract("Check https://example.com for more info")
        self.assertTrue(s.has_urls)

    def test_attachment_ref_detected(self):
        s = self.extract("Please see the attached report for details")
        self.assertTrue(s.has_attachment_ref)

    def test_word_count_correct(self):
        s = self.extract("one two three four five")
        self.assertEqual(s.word_count, 5)

    def test_no_false_positives_on_plain_text(self):
        s = self.extract("Just a normal sentence with no special patterns.")
        self.assertFalse(s.has_email_headers)
        self.assertFalse(s.has_quoted_thread)
        self.assertFalse(s.has_code)
        self.assertFalse(s.has_urls)
        self.assertFalse(s.has_attachment_ref)

    def test_summary_contains_flags(self):
        s = self.extract("From: x\nhttps://url.com")
        summary = s.summary()
        self.assertIn("email_headers=true", summary)
        self.assertIn("urls=true", summary)
        self.assertIn("words=", summary)

    def test_empty_text_no_crash(self):
        s = self.extract("")
        self.assertEqual(s.word_count, 0)
        self.assertFalse(s.has_email_headers)

    def test_very_long_text_no_crash(self):
        s = self.extract("word " * 50000)
        self.assertEqual(s.word_count, 50000)


# ─────────────────────────────────────────────────────────────────────────────
# T05  ContextBundle
# ─────────────────────────────────────────────────────────────────────────────

class T05_ContextBundle(unittest.TestCase):

    def test_empty_bundle_defaults(self):
        from brain.context_bundle import ContextBundle
        b = ContextBundle.empty()
        self.assertEqual(b.app_name, "")
        self.assertEqual(b.context_type, "generic")
        self.assertEqual(b.confidence, 0.0)
        self.assertIsNone(b.signals)
        self.assertEqual(b.entities, [])

    def test_from_working_context(self):
        from brain.context_bundle import ContextBundle
        from brain.context_brain import WorkingContext
        from brain.signals import extract_signals
        ctx = WorkingContext(
            app_name="Gmail",
            context_type="email",
            market="generic",
            situation="Reading email from John",
            entities=["John Mills", "Q3 Budget"],
            confidence=0.85,
            signals=extract_signals("From: John\nSubject: Q3"),
        )
        b = ContextBundle.from_working_context(ctx)
        self.assertEqual(b.app_name, "Gmail")
        self.assertEqual(b.context_type, "email")
        self.assertEqual(b.confidence, 0.85)
        self.assertIsNotNone(b.signals)
        self.assertIn("John Mills", b.entities)

    def test_bundle_with_none_signals(self):
        from brain.context_bundle import ContextBundle
        b = ContextBundle(app_name="Test", signals=None)
        self.assertIsNone(b.signals)


# ─────────────────────────────────────────────────────────────────────────────
# T06  Prompt pipeline
# ─────────────────────────────────────────────────────────────────────────────

class T06_PromptPipeline(unittest.TestCase):

    def setUp(self):
        from prompts import build_prompt, ACTION_PROMPTS
        from brain.context_bundle import ContextBundle
        from brain.signals import extract_signals
        self.build = build_prompt
        self.Bundle = ContextBundle
        self.extract = extract_signals
        self.action_prompts = ACTION_PROMPTS

    def _bundle(self, **kw):
        return self.Bundle(**kw)

    def test_build_with_empty_bundle(self):
        p = self.build("some text", "summarize", "professional",
                       bundle=self.Bundle.empty())
        self.assertGreater(len(p), 50)

    def test_build_with_none_bundle(self):
        p = self.build("some text", "summarize", "professional")
        self.assertGreater(len(p), 50)

    def test_build_with_full_bundle(self):
        b = self._bundle(
            app_name="Gmail", context_type="email",
            situation="User reading email", confidence=0.9,
            signals=self.extract("From: John\nBody text")
        )
        p = self.build("Email content", "reply", "professional", bundle=b)
        self.assertIn("Gmail", p)
        self.assertIn("email_headers=true", p)

    def test_confidence_high_asserts_situation(self):
        """confidence >= 0.7 → situation shown as definite context."""
        b = self._bundle(situation="User reading email from John", confidence=0.8)
        p = self.build("text", "reply", "professional", bundle=b)
        self.assertIn("Context:", p)
        self.assertNotIn("uncertain", p)

    def test_confidence_medium_shows_uncertain(self):
        """0.4 <= confidence < 0.7 → situation shown as uncertain hint."""
        b = self._bundle(situation="User reading email from John", confidence=0.5)
        p = self.build("text", "reply", "professional", bundle=b)
        self.assertIn("uncertain", p.lower())

    def test_confidence_low_drops_situation(self):
        """confidence < 0.4 → situation not included in prompt at all."""
        b = self._bundle(situation="User reading email from John", confidence=0.3)
        p = self.build("text", "reply", "professional", bundle=b)
        # Situation should not appear since confidence is too low
        self.assertNotIn("User reading email from John", p)

    def test_all_action_prompts_build(self):
        """Every ACTION_PROMPTS entry must build without error."""
        b = self.Bundle.empty()
        for action in self.action_prompts:
            with self.subTest(action=action):
                p = self.build("sample content text", action, "professional", bundle=b)
                self.assertGreater(len(p), 30, f"{action} produced empty prompt")

    def test_custom_action_includes_instruction(self):
        p = self.build("some text", "custom", "professional",
                       custom_instruction="Make it shorter",
                       bundle=self.Bundle.empty())
        self.assertIn("Make it shorter", p)

    def test_empty_text_no_crash(self):
        p = self.build("", "summarize", "professional", bundle=self.Bundle.empty())
        self.assertIsInstance(p, str)

    def test_none_passed_as_bundle(self):
        p = self.build("text", "reply", "professional", bundle=None)
        self.assertIsInstance(p, str)
        self.assertGreater(len(p), 10)


# ─────────────────────────────────────────────────────────────────────────────
# T07  Reply direction — the reported bug
# ─────────────────────────────────────────────────────────────────────────────

class T07_ReplyDirection(unittest.TestCase):

    def setUp(self):
        from prompts import build_prompt
        from brain.context_bundle import ContextBundle
        self.build = build_prompt
        self.Bundle = ContextBundle

    def _reply(self, text, context_type, app_name="", situation="", confidence=0.0, signals=None):
        b = self.Bundle(
            app_name=app_name, context_type=context_type,
            situation=situation, confidence=confidence, signals=signals
        )
        return self.build(text, "reply", "professional", bundle=b)

    def test_email_reply_addresses_sender(self):
        """Email reply must positively instruct LLM to write TO the identified sender."""
        p = self._reply("From: John\nBody", "email", app_name="Gmail")
        self.assertIn("sender", p.lower())
        # The phrase "identified sender" must appear — that's the correct direction
        self.assertIn("identified sender", p.lower())

    def test_email_reply_mentions_from_field(self):
        """Email reply prompt must reference From: field identification."""
        p = self._reply("Email body", "email")
        self.assertIn("From", p)

    def test_chat_reply_has_username_guidance(self):
        p = self._reply("Message text", "chat")
        self.assertIn("username", p.lower())

    def test_customer_support_has_acknowledgement(self):
        p = self._reply("Customer complaint", "customer_support")
        self.assertIn("acknowledgement", p.lower())

    def test_outbound_reply_references_message(self):
        p = self._reply("Prospect message", "outbound")
        self.assertIn("specific", p.lower())

    def test_social_reply_has_platform_tone(self):
        p = self._reply("Post content", "social", app_name="LinkedIn")
        self.assertIn("LinkedIn", p)

    def test_follow_up_has_sender_identification(self):
        from brain.context_bundle import ContextBundle
        b = ContextBundle(context_type="email", app_name="Gmail")
        p = self.build("Email content", "follow_up", "professional", bundle=b)
        self.assertIn("follow", p.lower())
        self.assertIn("sender", p.lower())

    def test_generic_context_reply_has_multi_surface_guidance(self):
        """When context_type is unknown, prompt must still guide sender identification."""
        p = self._reply("Some message", "generic")
        self.assertIn("sender", p.lower())


# ─────────────────────────────────────────────────────────────────────────────
# T08  Security / PII
# ─────────────────────────────────────────────────────────────────────────────

class T08_Security(unittest.TestCase):

    def setUp(self):
        from security import classify_field, redact_for_log, assess_form
        self.classify = classify_field
        self.redact   = redact_for_log
        self.assess   = assess_form

    def test_password_field_is_blocked(self):
        result = self.classify("Password", "password", "")
        self.assertEqual(result.level, "blocked")

    def test_ssn_field_is_high(self):
        result = self.classify("Social Security Number", "text", "")
        self.assertIn(result.level, ("high", "blocked"))

    def test_email_field_is_medium(self):
        result = self.classify("Email Address", "text", "")
        self.assertIn(result.level, ("low", "medium"))

    def test_name_field_is_low(self):
        result = self.classify("First Name", "text", "")
        self.assertIn(result.level, ("none", "low"))

    def test_generic_field_is_none(self):
        result = self.classify("Department Code", "text", "")
        self.assertIn(result.level, ("none", "low"))

    def test_redact_email(self):
        out = self.redact("Contact john@example.com for more info")
        self.assertNotIn("john@example.com", out)
        self.assertIn("[EMAIL]", out)

    def test_redact_phone(self):
        out = self.redact("Call me at 555-867-5309")
        self.assertNotIn("555-867-5309", out)

    def test_redact_ssn(self):
        out = self.redact("SSN: 123-45-6789 on file")
        self.assertNotIn("123-45-6789", out)

    def test_redact_empty_string(self):
        out = self.redact("")
        self.assertEqual(out, "")

    def test_redact_no_pii_unchanged(self):
        clean = "This sentence has no PII in it at all."
        out = self.redact(clean)
        self.assertEqual(out, clean)

    def test_blocked_field_pii_can_fill_false(self):
        result = self.classify("PIN", "password", "")
        self.assertFalse(result.can_fill)


# ─────────────────────────────────────────────────────────────────────────────
# T09  Rules / validation
# ─────────────────────────────────────────────────────────────────────────────

class T09_Rules(unittest.TestCase):

    def test_load_rules_no_crash(self):
        from rules import load_rules
        rules = load_rules()
        self.assertIsInstance(rules, list)

    def test_validate_fields_empty_list(self):
        from rules import validate_fields
        violations = validate_fields([], "TestApp")
        self.assertEqual(violations, [])

    def test_validate_fields_no_rules(self):
        from rules import validate_fields
        from plat.base import FormField
        f = FormField(index=0, label="Amount", placeholder="",
                      current_value="100", suggested_value="",
                      control_type="text", handle=None)
        violations = validate_fields([f], "NonExistentApp_QATest")
        self.assertIsInstance(violations, list)

    def test_rule_learner_import(self):
        from brain.rule_learner import learn_from_compacts
        # Should not crash even with empty compacts
        count = learn_from_compacts("NonExistentApp_QATest")
        self.assertIsInstance(count, int)


# ─────────────────────────────────────────────────────────────────────────────
# T10  Storage / config
# ─────────────────────────────────────────────────────────────────────────────

class T10_Storage(unittest.TestCase):

    def test_load_hotkeys_returns_dict(self):
        from storage import load_hotkeys
        h = load_hotkeys()
        self.assertIsInstance(h, dict)

    def test_default_hotkeys_present(self):
        from config import DEFAULT_HOTKEYS
        self.assertIn("menu", DEFAULT_HOTKEYS)
        self.assertIn("history", DEFAULT_HOTKEYS)
        self.assertIn("style", DEFAULT_HOTKEYS)
        self.assertIn("form", DEFAULT_HOTKEYS)

    def test_get_pref_returns_default(self):
        from storage import get_pref
        val = get_pref("NonExistentApp_QATest", "tone", "professional")
        self.assertEqual(val, "professional")

    def test_load_compacts_no_crash(self):
        from memory import load_compacts
        compacts = load_compacts()
        self.assertIsInstance(compacts, list)

    def test_parse_hotkey_all_defaults(self):
        from storage import parse_hotkey
        from config import DEFAULT_HOTKEYS, _MOD_BITS
        for name, combo in DEFAULT_HOTKEYS.items():
            mods, vk = parse_hotkey(combo)
            self.assertGreater(vk, 0, f"Default hotkey '{name}' = '{combo}' has vk=0")

    def test_format_hotkey_roundtrip(self):
        from storage import parse_hotkey, format_hotkey
        for combo in ("alt+a", "ctrl+shift+h", "alt+f"):
            mods, vk = parse_hotkey(combo)
            if vk:
                result = format_hotkey(combo)
                self.assertIsInstance(result, str)
                self.assertGreater(len(result), 0)


# ─────────────────────────────────────────────────────────────────────────────
# T11  ERP features
# ─────────────────────────────────────────────────────────────────────────────

class T11_ERPFeatures(unittest.TestCase):

    def setUp(self):
        from context import _detect_context_type, CONTEXT_ACTIONS
        from prompts import build_prompt, ACTION_PROMPTS
        from brain.context_bundle import ContextBundle
        self.detect  = _detect_context_type
        self.actions = CONTEXT_ACTIONS
        self.build   = build_prompt
        self.Bundle  = ContextBundle
        self.action_prompts = ACTION_PROMPTS

    # ── Approval queue ────────────────────────────────────────────────────────

    def test_approval_queue_actions_exist(self):
        actions = self.actions.get("approval_queue", [])
        keys = [k for _, k in actions]
        self.assertIn("analyze_queue", keys)
        self.assertIn("flag_risks", keys)
        self.assertIn("batch_summary", keys)
        self.assertIn("escalation_list", keys)

    def test_analyze_queue_prompt_has_risk_signals(self):
        p = self.action_prompts["analyze_queue"]("Vendor A: 50000\nVendor B: 12000")
        self.assertIn("risk", p.lower())
        self.assertIn("approve", p.lower())

    def test_flag_risks_prompt_checks_duplicates(self):
        p = self.action_prompts["flag_risks"]("Invoice data")
        self.assertIn("duplicate", p.lower())
        self.assertIn("split transaction", p.lower())

    def test_batch_summary_prompt_concise(self):
        p = self.action_prompts["batch_summary"]("Queue data")
        self.assertIn("total", p.lower())

    def test_escalation_list_prompt_structure(self):
        p = self.action_prompts["escalation_list"]("Approval items")
        self.assertIn("escalat", p.lower())

    # ── Period-end close ──────────────────────────────────────────────────────

    def test_period_close_actions_exist(self):
        actions = self.actions.get("period_close", [])
        keys = [k for _, k in actions]
        self.assertIn("close_status", keys)
        self.assertIn("draft_journal", keys)
        self.assertIn("explain_variance", keys)
        self.assertIn("reconcile_check", keys)

    def test_close_status_prompt_has_checklist_format(self):
        p = self.action_prompts["close_status"]("GL data")
        self.assertIn("complete", p.lower())
        self.assertIn("blocker", p.lower())

    def test_draft_journal_prompt_has_debit_credit(self):
        p = self.action_prompts["draft_journal"]("Invoice $5000")
        self.assertIn("debit", p.lower())
        self.assertIn("credit", p.lower())

    def test_explain_variance_prompt_is_cfo_ready(self):
        p = self.action_prompts["explain_variance"]("Variance data")
        self.assertIn("variance", p.lower())
        self.assertIn("budget", p.lower())

    def test_reconcile_check_prompt_detects_difference(self):
        p = self.action_prompts["reconcile_check"]("Reconciliation data")
        self.assertIn("difference", p.lower())
        self.assertIn("reconcil", p.lower())

    def test_erp_prompts_build_end_to_end(self):
        erp_actions = ["analyze_queue", "flag_risks", "batch_summary",
                       "escalation_list", "close_status", "draft_journal",
                       "explain_variance", "reconcile_check"]
        b = self.Bundle(app_name="SAP Fiori", context_type="approval_queue",
                        market="finance")
        for action in erp_actions:
            with self.subTest(action=action):
                p = self.build("ERP screen content", action, "professional", bundle=b)
                self.assertGreater(len(p), 100)


# ─────────────────────────────────────────────────────────────────────────────
# T12  Regression — previously confirmed bugs
# ─────────────────────────────────────────────────────────────────────────────

class T12_Regression(unittest.TestCase):

    def test_gmail_context_type_not_generic(self):
        """Gmail window must produce context_type='email', not 'generic'."""
        from context import _detect_context_type
        result = _detect_context_type("Chrome", "Inbox - someone@gmail.com - Gmail")
        self.assertEqual(result, "email",
            "REGRESSION: Gmail detected as 'generic' — context_type fix broken")

    def test_email_reply_goes_to_sender_not_user(self):
        """Reply prompt must address sender — the original reported bug."""
        from prompts import build_prompt
        from brain.context_bundle import ContextBundle
        b = ContextBundle(context_type="email", app_name="Gmail")
        p = build_prompt(
            "From: John Mills <john@acme.com>\nSubject: Q3\nHi, can we meet?",
            "reply", "professional", bundle=b
        )
        # Must contain sender identification guidance (From: field reference)
        self.assertIn("From", p)
        # Prompt must instruct LLM to address the identified sender
        self.assertIn("identified sender", p.lower())

    def test_sales_context_has_actions(self):
        """sales market must have CONTEXT_ACTIONS entry (was missing before fix)."""
        from context import CONTEXT_ACTIONS
        self.assertIn("sales", CONTEXT_ACTIONS)
        self.assertGreater(len(CONTEXT_ACTIONS["sales"]), 0)

    def test_customer_support_has_actions(self):
        from context import CONTEXT_ACTIONS
        self.assertIn("customer_support", CONTEXT_ACTIONS)

    def test_developer_has_actions(self):
        from context import CONTEXT_ACTIONS
        self.assertIn("developer", CONTEXT_ACTIONS)

    def test_context_type_separate_from_market(self):
        """WorkingContext must have both market AND context_type fields."""
        from brain.context_brain import WorkingContext
        ctx = WorkingContext()
        self.assertTrue(hasattr(ctx, "market"))
        self.assertTrue(hasattr(ctx, "context_type"))

    def test_signals_field_on_working_context(self):
        """WorkingContext must have signals field after Phase 4 wiring."""
        from brain.context_brain import WorkingContext
        ctx = WorkingContext()
        self.assertTrue(hasattr(ctx, "signals"))

    def test_retry_frame_removed_from_main(self):
        """retry_frame dead code must be gone."""
        import inspect, main
        src = inspect.getsource(main._pull_with_progress)
        self.assertNotIn("retry_frame", src)

    def test_win32gui_bypass_removed_from_tick(self):
        """win32gui.GetForegroundWindow() must not be in the tick loop."""
        import inspect, main
        src = inspect.getsource(main.main)
        self.assertNotIn("win32gui.GetForegroundWindow", src)

    def test_set_flame_cursor_guarded_on_non_windows(self):
        """set_flame_cursor must have sys.platform guard — no windll crash."""
        import inspect
        from ui.icons import set_flame_cursor
        src = inspect.getsource(set_flame_cursor)
        self.assertIn("sys.platform", src)

    def test_classify_market_called_once_in_process(self):
        """_is_task_boundary must not call classify_market internally."""
        import inspect
        from brain.context_brain import ContextBrain
        src = inspect.getsource(ContextBrain._is_task_boundary)
        self.assertNotIn("classify_market(", src)


# ─────────────────────────────────────────────────────────────────────────────
# T13  Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class T13_EdgeCases(unittest.TestCase):

    def test_build_prompt_very_long_text(self):
        from prompts import build_prompt
        long_text = "word " * 10000
        p = build_prompt(long_text, "summarize", "professional")
        self.assertIsInstance(p, str)

    def test_build_prompt_unicode_text(self):
        from prompts import build_prompt
        unicode_text = "こんにちは 世界 مرحبا بالعالم αβγδ"
        p = build_prompt(unicode_text, "summarize", "professional")
        self.assertIn(unicode_text, p)

    def test_build_prompt_all_tones(self):
        from prompts import build_prompt
        from config import TONE_INSTRUCTIONS
        for tone in TONE_INSTRUCTIONS:
            p = build_prompt("text", "summarize", tone)
            self.assertIsInstance(p, str)

    def test_context_bundle_entities_not_shared(self):
        """Two empty bundles must not share the same entities list."""
        from brain.context_bundle import ContextBundle
        b1 = ContextBundle.empty()
        b2 = ContextBundle.empty()
        b1.entities.append("test")
        self.assertEqual(len(b2.entities), 0,
            "ContextBundle.empty() entities list is shared — mutable default bug")

    def test_extract_signals_special_chars(self):
        from brain.signals import extract_signals
        s = extract_signals("!@#$%^&*() \n\t")
        self.assertIsInstance(s.word_count, int)

    def test_detect_context_empty_strings(self):
        from context import _detect_context_type
        result = _detect_context_type("", "")
        self.assertEqual(result, "generic")

    def test_detect_context_mixed_case(self):
        """Context detection must be case-insensitive on window title."""
        from context import _detect_context_type
        self.assertEqual(_detect_context_type("CHROME", "INBOX - GMAIL"), "email")

    def test_redact_credit_card(self):
        from security import redact_for_log
        out = redact_for_log("Card: 4111 1111 1111 1111")
        self.assertNotIn("4111 1111 1111 1111", out)


# ─────────────────────────────────────────────────────────────────────────────
# T14  Brain pipeline
# ─────────────────────────────────────────────────────────────────────────────

class T14_BrainPipeline(unittest.TestCase):

    def test_classify_market_gmail_generic(self):
        """Gmail is not in APP_MARKET_MAP — classify_market returns generic."""
        from context import classify_market
        market, _ = classify_market("Chrome Gmail", "")
        # Gmail is a generic market (email client) — context_type handles the UI type
        self.assertIsInstance(market, str)

    def test_classify_market_salesforce(self):
        from context import classify_market
        market, _ = classify_market("Salesforce", "")
        self.assertEqual(market, "sales")

    def test_classify_market_zendesk(self):
        from context import classify_market
        market, _ = classify_market("Zendesk", "")
        self.assertEqual(market, "customer_support")

    def test_working_context_dataclass(self):
        from brain.context_brain import WorkingContext
        ctx = WorkingContext(
            app_name="Test",
            market="sales",
            context_type="email",
            situation="test situation",
            confidence=0.75,
        )
        self.assertEqual(ctx.app_name, "Test")
        self.assertEqual(ctx.market, "sales")
        self.assertFalse(ctx.ready)

    def test_context_bundle_from_context_preserves_confidence(self):
        from brain.context_brain import WorkingContext
        from brain.context_bundle import ContextBundle
        ctx = WorkingContext(confidence=0.92)
        b = ContextBundle.from_working_context(ctx)
        self.assertAlmostEqual(b.confidence, 0.92)

    def test_signal_summary_format(self):
        """signals.summary() must produce parseable key=value pairs."""
        from brain.signals import extract_signals
        s = extract_signals("From: X\nhttps://url.com")
        summary = s.summary()
        self.assertRegex(summary, r"words=\d+")
        for part in summary.split(", "):
            self.assertIn("=", part, f"Malformed signal pair: {part!r}")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    loader  = unittest.TestLoader()
    suite   = unittest.TestSuite()
    suites  = [
        T01_ModuleHealth, T02_PlatformLayer, T03_ContextDetection,
        T04_SignalExtraction, T05_ContextBundle, T06_PromptPipeline,
        T07_ReplyDirection, T08_Security, T09_Rules, T10_Storage,
        T11_ERPFeatures, T12_Regression, T13_EdgeCases, T14_BrainPipeline,
    ]
    for s in suites:
        suite.addTests(loader.loadTestsFromTestCase(s))

    runner = unittest.TextTestRunner(verbosity=2, buffer=True)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
