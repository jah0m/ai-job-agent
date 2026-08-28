from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from ai_job_search.workspace import Workspace, WorkspaceError
from job_fixtures import normalized_job


class JobContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.root = self.base / ".job-search"
        self.workspace = Workspace(self.root)
        self.workspace.initialize()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_job(self, value: object, name: str = "job.json") -> Path:
        path = self.base / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def basic_job(self, **facts: object) -> dict[str, object]:
        return normalized_job(
            self.root,
            provider="test",
            external_id="strict-1",
            title="Strict Engineer",
            url="https://example.invalid/jobs/strict-1",
            **facts,
        )

    def test_optional_page_fields_may_be_omitted(self) -> None:
        path = self.write_job(self.basic_job())

        checked = self.workspace.import_jobs(
            portal="test", source_file=path, validate_only=True
        )
        imported = self.workspace.import_jobs(portal="test", source_file=path)

        self.assertTrue(checked["valid"])
        self.assertEqual(imported["imported"], 1)

    def test_remote_and_office_days_are_strictly_validated(self) -> None:
        invalid_remote = self.basic_job(
            work_style={"remote": "sometimes", "source_text": "Sometimes remote"}
        )
        with self.assertRaisesRegex(WorkspaceError, "sometimes"):
            self.workspace.import_jobs(
                portal="test", source_file=self.write_job(invalid_remote)
            )

        for days in (0, 6):
            with self.subTest(days=days):
                invalid_days = self.basic_job(
                    work_style={
                        "remote": "hybrid",
                        "office_days_per_week": days,
                        "source_text": f"Office {days} days",
                    }
                )
                with self.assertRaisesRegex(WorkspaceError, "office_days_per_week"):
                    self.workspace.import_jobs(
                        portal="test",
                        source_file=self.write_job(invalid_days, f"days-{days}.json"),
                    )

        contradictory = self.basic_job(
            work_style={
                "remote": "remote",
                "office_days_per_week": 1,
                "source_text": "Fully remote",
            }
        )
        with self.assertRaisesRegex(WorkspaceError, "omit it"):
            self.workspace.import_jobs(
                portal="test",
                source_file=self.write_job(contradictory, "contradictory.json"),
            )

    def test_location_rejects_verbose_values(self) -> None:
        verbose = self.basic_job(
            location="東京都港区赤坂1丁目8-1 赤坂インターシティAIR 33F（東京オフィスまたは日本国内の自宅）"
        )
        with self.assertRaisesRegex(WorkspaceError, "too long"):
            self.workspace.import_jobs(
                portal="test",
                source_file=self.write_job(verbose, "verbose-location.json"),
            )

    def test_unknown_fields_salary_order_and_snapshot_hash_are_rejected(self) -> None:
        unknown = self.basic_job(platform_guess="untrusted")
        with self.assertRaisesRegex(WorkspaceError, "Additional properties"):
            self.workspace.import_jobs(
                portal="test", source_file=self.write_job(unknown, "unknown.json")
            )

        reversed_salary = self.basic_job(
            salary={
                "annual_minimum": 12_000_000,
                "annual_maximum": 8_000_000,
                "currency": "JPY",
                "source_text": "800-1200",
            }
        )
        with self.assertRaisesRegex(WorkspaceError, "annual_maximum"):
            self.workspace.import_jobs(
                portal="test",
                source_file=self.write_job(reversed_salary, "salary.json"),
            )

        wrong_hash = self.basic_job()
        wrong_hash["source"]["snapshot_sha256"] = "0" * 64
        with self.assertRaisesRegex(WorkspaceError, "hash does not match"):
            self.workspace.import_jobs(
                portal="test", source_file=self.write_job(wrong_hash, "hash.json")
            )

    def test_invalid_batch_does_not_partially_import(self) -> None:
        first = self.basic_job()
        second = deepcopy(first)
        second["external_id"] = "strict-2"
        second["url"] = "https://example.invalid/jobs/strict-2"
        second["source"]["detail_url"] = second["url"]
        second["work_style"] = {
            "remote": "invalid",
            "source_text": "Invalid value",
        }

        with self.assertRaises(WorkspaceError):
            self.workspace.import_jobs(
                portal="test", source_file=self.write_job([first, second], "batch.json")
            )

        self.assertEqual(self.workspace.list_jobs(), [])

    def test_public_and_packaged_schemas_match(self) -> None:
        public = json.loads(
            (Path(__file__).resolve().parents[1] / "schemas" / "job-result.schema.json").read_text(
                encoding="utf-8"
            )
        )
        packaged = json.loads(
            (
                Path(__file__).resolve().parents[1]
                / "src"
                / "ai_job_search"
                / "schemas"
                / "job-result.schema.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(public, packaged)


if __name__ == "__main__":
    unittest.main()
