from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.security_guards import run_checks  # noqa: E402


class SecurityGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / ".agents" / "skills" / "example" / "cli").mkdir(parents=True)
        (self.root / ".gitignore").write_text("/.job-search/\n", encoding="utf-8")
        (self.root / ".agents" / "skills" / "example" / "SKILL.md").write_text(
            "---\nname: example\ndescription: Example skill.\n---\n\n# Example\n",
            encoding="utf-8",
        )
        self.manifest = (
            self.root / ".agents" / "skills" / "example" / "cli" / "package.json"
        )
        self.manifest.write_text(
            json.dumps({"name": "example", "scripts": {"test": "bun test"}}),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_clean_layout_passes(self) -> None:
        self.assertEqual(run_checks(self.root), [])

    def test_private_workspace_reinclude_fails(self) -> None:
        (self.root / ".gitignore").write_text(
            "/.job-search/\n!/.job-search/profile/candidate.json\n", encoding="utf-8"
        )
        self.assertTrue(any("re-include" in error for error in run_checks(self.root)))

    def test_claude_parallel_workflow_fails(self) -> None:
        (self.root / ".claude").mkdir()
        self.assertTrue(any(".claude" in error for error in run_checks(self.root)))

    def test_canonical_claude_compatibility_links_pass(self) -> None:
        (self.root / "AGENTS.md").write_text("# Rules\n", encoding="utf-8")
        (self.root / ".claude").symlink_to(".agents", target_is_directory=True)
        (self.root / "CLAUDE.md").symlink_to("AGENTS.md")
        self.assertEqual(run_checks(self.root), [])

    def test_claude_link_to_another_workflow_fails(self) -> None:
        (self.root / "other-agents").mkdir()
        (self.root / ".claude").symlink_to(
            "other-agents", target_is_directory=True
        )
        self.assertTrue(any("must point" in error for error in run_checks(self.root)))

    def test_lifecycle_script_fails(self) -> None:
        self.manifest.write_text(
            json.dumps({"name": "example", "scripts": {"postinstall": "echo no"}}),
            encoding="utf-8",
        )
        self.assertTrue(any("lifecycle" in error for error in run_checks(self.root)))

    def test_legacy_skill_frontmatter_fails(self) -> None:
        skill = self.root / ".agents" / "skills" / "example" / "SKILL.md"
        skill.write_text(
            "---\nname: example\ndescription: Example.\ncontext: fork\n---\n# Example\n",
            encoding="utf-8",
        )
        self.assertTrue(any("unsupported" in error for error in run_checks(self.root)))

    def test_live_urls_in_test_fixtures_fail(self) -> None:
        tests = self.root / "tests"
        tests.mkdir()
        scheme = "https" + "://"
        live_url = scheme + "jobs." + "example.com/roles/test-role"
        (tests / "test_fixture.py").write_text(
            f'JOB_URL = "{live_url}"\n', encoding="utf-8"
        )
        self.assertTrue(any("embeds a live URL" in error for error in run_checks(self.root)))

    def test_reserved_test_urls_pass(self) -> None:
        tests = self.root / "tests"
        tests.mkdir()
        (tests / "test_fixture.py").write_text(
            'JOB_URL = "https://jobs.example.invalid/roles/test-role"\n',
            encoding="utf-8",
        )
        self.assertEqual(run_checks(self.root), [])


if __name__ == "__main__":
    unittest.main()
