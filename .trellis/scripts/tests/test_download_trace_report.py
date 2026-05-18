#!/usr/bin/env python3
"""Tests for .trellis/scripts/download_trace_report.py."""

from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / ".trellis" / "scripts" / "download_trace_report.py"


def build_trace_line(
    trace_id: str,
    stage: str,
    ts_ms: int,
    payload: str,
) -> str:
    return (
        'INFO >>> [DownloadTrace] {"traceId":"'
        + trace_id
        + '","stage":"'
        + stage
        + '","tsMs":'
        + str(ts_ms)
        + ',"payload":'
        + payload
        + "}\n"
    )


class DownloadTraceReportTests(unittest.TestCase):
    def run_report(self, log_content: str, extra_args: list[str] | None = None) -> str:
        with tempfile.TemporaryDirectory() as tmp_dir:
            log_path = Path(tmp_dir) / "app.log"
            log_path.write_text(log_content, encoding="utf-8")

            cmd = ["python3", str(SCRIPT_PATH), "--input", str(log_path)]
            if extra_args:
                cmd.extend(extra_args)

            completed = subprocess.run(
                cmd,
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            return completed.stdout

    def test_generates_expected_summary_and_gates(self) -> None:
        # 2026-01-01 UTC in ms.
        start_ts = 1_767_225_600_000
        day_ms = 24 * 60 * 60 * 1000

        lines = []
        lines.append(
            build_trace_line(
                "t1",
                "router_entry",
                start_ts,
                '{"url":"https://www.douyin.com/video/1"}',
            )
        )
        lines.append(
            build_trace_line(
                "t1",
                "terminal",
                start_ts,
                '{"outcome":"direct_success","finalRoute":"direct_douyin","routeChain":["direct_douyin"],"durationMs":2000}',
            )
        )
        lines.append(
            build_trace_line(
                "t2",
                "router_entry",
                start_ts + day_ms,
                '{"url":"https://www.douyin.com/video/2"}',
            )
        )
        lines.append(
            build_trace_line(
                "t2",
                "terminal",
                start_ts + day_ms,
                '{"outcome":"direct_failed_then_ytdlp_success","finalRoute":"yt_dlp","routeChain":["direct_douyin","yt_dlp"],"durationMs":3000}',
            )
        )
        lines.append(
            build_trace_line(
                "t3",
                "router_entry",
                start_ts + (7 * day_ms),
                '{"url":"https://www.xiaohongshu.com/explore/abc"}',
            )
        )
        lines.append(
            build_trace_line(
                "t3",
                "terminal",
                start_ts + (7 * day_ms),
                '{"outcome":"non_direct_success","finalRoute":"yt_dlp","routeChain":["yt_dlp"],"durationMs":4000}',
            )
        )
        lines.append(
            build_trace_line(
                "t4",
                "router_entry",
                start_ts + (8 * day_ms),
                '{"url":"https://www.xiaohongshu.com/explore/def"}',
            )
        )
        lines.append(
            build_trace_line(
                "t4",
                "terminal",
                start_ts + (8 * day_ms),
                '{"outcome":"all_failed","finalRoute":"yt_dlp","routeChain":["yt_dlp"],"durationMs":5000,"error":"HTTP 403 https://example.com/tokenized"}',
            )
        )
        lines.append('WARN >>> [DownloadTrace] {"broken_json": \n')

        report = self.run_report(
            "".join(lines),
            [
                "--env",
                "canary",
                "--build",
                "test-sha",
                "--require-gate-days",
                "7",
                "--max-direct-fallback-ratio",
                "0.30",
            ],
        )

        self.assertIn("Terminal attempts parsed: 4", report)
        self.assertIn("Parse failures (malformed trace lines): 1", report)
        self.assertIn("| douyin | 2 | 2 | 0 | 0 | 100.00% |", report)
        self.assertIn("| xiaohongshu | 2 | 1 | 1 | 0 | 50.00% |", report)
        self.assertIn("Coverage >= 7 days: PASS", report)
        self.assertIn("Douyin success rate >= 95% over required window: PASS", report)
        self.assertIn("Xiaohongshu success rate >= 95% over required window: FAIL", report)
        self.assertIn(
            "direct_failed_then_ytdlp_success bounded: PASS (ratio 0.2500, threshold <= 0.3000)",
            report,
        )
        self.assertIn("<url>", report)

    def test_window_days_filters_old_attempts(self) -> None:
        start_ts = 1_767_225_600_000
        day_ms = 24 * 60 * 60 * 1000

        lines = []
        lines.append(
            build_trace_line(
                "old-1",
                "terminal",
                start_ts,
                '{"url":"https://www.douyin.com/video/old","outcome":"direct_success","finalRoute":"direct_douyin","routeChain":["direct_douyin"],"durationMs":1000}',
            )
        )
        lines.append(
            build_trace_line(
                "new-1",
                "terminal",
                start_ts + (3 * day_ms),
                '{"url":"https://www.douyin.com/video/new","outcome":"direct_success","finalRoute":"direct_douyin","routeChain":["direct_douyin"],"durationMs":1200}',
            )
        )

        report = self.run_report("".join(lines), ["--window-days", "1"])
        self.assertIn("Terminal attempts parsed: 1", report)

        match = re.search(r"\| douyin \| (\d+) \|", report)
        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), "1")


if __name__ == "__main__":
    unittest.main()
