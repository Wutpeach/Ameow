#!/usr/bin/env python3
"""
Generate a baseline/deletion-gate report from DownloadTrace logs.

Usage examples:
    python3 ./.trellis/scripts/download_trace_report.py --input app.log
    python3 ./.trellis/scripts/download_trace_report.py --input app.log --output report.md
    python3 ./.trellis/scripts/download_trace_report.py --input app.log --window-days 7 \
      --max-direct-fallback-ratio 0.35 --env canary --build 65c61f0
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable


TRACE_PREFIX = ">>> [DownloadTrace]"
SUCCESS_OUTCOMES = {
    "direct_success",
    "direct_failed_then_ytdlp_success",
    "non_direct_success",
}
VALID_OUTCOMES = SUCCESS_OUTCOMES | {"all_failed", "cancelled"}
PLATFORMS = ("douyin", "xiaohongshu", "bilibili", "others")


@dataclass
class TraceRecord:
    trace_id: str
    urls: list[str] = field(default_factory=list)
    terminal: dict | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate markdown baseline/gate report from DownloadTrace logs."
    )
    parser.add_argument(
        "--input",
        action="append",
        dest="inputs",
        default=[],
        help="Input log file path. Repeatable. Use '-' for stdin.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output markdown path. Default: stdout",
    )
    parser.add_argument(
        "--env",
        default="unknown",
        help="Environment label for report (dev/canary/release).",
    )
    parser.add_argument(
        "--build",
        default="",
        help="Build/commit label in report. Default: current git short SHA if available.",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=0,
        help="Only include terminal events within the latest N days (by terminal tsMs).",
    )
    parser.add_argument(
        "--max-direct-fallback-ratio",
        type=float,
        default=-1.0,
        help="Optional gate threshold for direct_failed_then_ytdlp_success ratio (0..1).",
    )
    parser.add_argument(
        "--require-gate-days",
        type=int,
        default=7,
        help="Required day coverage for success-rate deletion gates.",
    )
    return parser.parse_args()


def iter_lines(inputs: list[str]) -> Iterable[str]:
    if not inputs:
        inputs = ["-"]
    for path in inputs:
        if path == "-":
            for line in sys.stdin:
                yield line
            continue
        with Path(path).open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                yield line


def parse_download_trace_event(line: str) -> dict | None:
    if TRACE_PREFIX not in line:
        return None
    left = line.find("{")
    right = line.rfind("}")
    if left < 0 or right <= left:
        return None
    payload = line[left : right + 1]
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(event, dict):
        return None
    return event


def extract_urls_from_payload(payload: dict) -> list[str]:
    urls: list[str] = []
    for key in ("url", "pageUrl"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            urls.append(value.strip())
    return urls


def infer_platform(urls: list[str]) -> str:
    patterns = {
        "douyin": ("douyin.com/video/", "v.douyin.com", "douyinvod.com", "douyincdn.com"),
        "xiaohongshu": ("xiaohongshu.com", "xhslink.com", "xhscdn.com"),
        "bilibili": ("bilibili.com", "b23.tv"),
    }
    lowered = [u.lower() for u in urls]
    for url in lowered:
        for platform, tokens in patterns.items():
            if any(token in url for token in tokens):
                return platform
    return "others"


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    index = (len(sorted_values) - 1) * pct / 100.0
    lo = int(math.floor(index))
    hi = int(math.ceil(index))
    if lo == hi:
        return sorted_values[lo]
    w = index - lo
    return sorted_values[lo] * (1.0 - w) + sorted_values[hi] * w


def fmt_ts(ts_ms: int | None) -> str:
    if not ts_ms:
        return ""
    return datetime.fromtimestamp(ts_ms / 1000.0).isoformat(sep=" ", timespec="seconds")


def normalize_error(err: str) -> str:
    text = re.sub(r"https?://\S+", "<url>", err)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:120] if len(text) > 120 else text


def safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return (numerator / denominator) * 100.0


def gate_status(flag: bool | None) -> str:
    if flag is None:
        return "INSUFFICIENT_DATA"
    return "PASS" if flag else "FAIL"


def current_git_short_sha() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip()
    except (subprocess.SubprocessError, OSError):
        return ""


def render_report(
    attempts: list[dict],
    parse_failures: int,
    env_label: str,
    build_label: str,
    gate_days_required: int,
    max_direct_fallback_ratio: float,
) -> str:
    if not attempts:
        return (
            "# Download Trace Report\n\n"
            "No terminal DownloadTrace events found in selected window.\n"
        )

    ts_values = [attempt["ts_ms"] for attempt in attempts if attempt["ts_ms"] > 0]
    start_ts = min(ts_values) if ts_values else None
    end_ts = max(ts_values) if ts_values else None
    span_days = 0.0
    if start_ts and end_ts and end_ts > start_ts:
        span_days = (end_ts - start_ts) / (1000.0 * 60.0 * 60.0 * 24.0)

    platform_summary = {
        platform: {"total": 0, "success": 0, "failed": 0, "cancelled": 0}
        for platform in PLATFORMS
    }
    outcome_counts: Counter[str] = Counter()
    route_durations: dict[str, list[float]] = {}
    failure_counter: Counter[tuple[str, str]] = Counter()

    for attempt in attempts:
        platform = attempt["platform"]
        outcome = attempt["outcome"]
        route = attempt["final_route"] or "null"
        duration_ms = attempt["duration_ms"]
        error = attempt["error"]

        platform_summary[platform]["total"] += 1
        outcome_counts[outcome] += 1

        if outcome in SUCCESS_OUTCOMES:
            platform_summary[platform]["success"] += 1
        elif outcome == "cancelled":
            platform_summary[platform]["cancelled"] += 1
        else:
            platform_summary[platform]["failed"] += 1

        if duration_ms > 0:
            route_durations.setdefault(route, []).append(duration_ms)

        if outcome == "all_failed" and error:
            failure_counter[(route, normalize_error(error))] += 1

    total_attempts = len(attempts)
    non_cancelled_attempts = sum(1 for a in attempts if a["outcome"] != "cancelled")
    direct_fallback_count = outcome_counts.get("direct_failed_then_ytdlp_success", 0)
    direct_fallback_ratio = (
        direct_fallback_count / non_cancelled_attempts if non_cancelled_attempts > 0 else 0.0
    )

    douyin_total = platform_summary["douyin"]["total"]
    douyin_success = platform_summary["douyin"]["success"]
    xhs_total = platform_summary["xiaohongshu"]["total"]
    xhs_success = platform_summary["xiaohongshu"]["success"]

    enough_days = span_days >= gate_days_required
    gate_douyin: bool | None = None
    gate_xhs: bool | None = None
    if enough_days and douyin_total > 0:
        gate_douyin = safe_rate(douyin_success, douyin_total) >= 95.0
    if enough_days and xhs_total > 0:
        gate_xhs = safe_rate(xhs_success, xhs_total) >= 95.0

    gate_fallback: bool | None = None
    if max_direct_fallback_ratio >= 0.0:
        gate_fallback = direct_fallback_ratio <= max_direct_fallback_ratio

    top_failures = failure_counter.most_common(3)

    lines: list[str] = []
    lines.append("# Download Trace Baseline / Deletion Gate Report")
    lines.append("")
    lines.append("## Window")
    lines.append(f"- Start: {fmt_ts(start_ts)}")
    lines.append(f"- End: {fmt_ts(end_ts)}")
    lines.append(f"- Duration Days: {span_days:.2f}")
    lines.append(f"- Environment: {env_label}")
    lines.append(f"- Build/Commit: {build_label or ''}")
    lines.append("")
    lines.append("## Data Source")
    lines.append(f"- Log prefix: `{TRACE_PREFIX}`")
    lines.append(f"- Terminal attempts parsed: {total_attempts}")
    lines.append(f"- Parse failures (malformed trace lines): {parse_failures}")
    lines.append("")
    lines.append("## Platform Summary")
    lines.append("| Platform | Total | Success | Failed | Cancelled | Success Rate |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for platform in PLATFORMS:
        row = platform_summary[platform]
        success_rate = safe_rate(row["success"], row["total"])
        lines.append(
            f"| {platform} | {row['total']} | {row['success']} | {row['failed']} | "
            f"{row['cancelled']} | {success_rate:.2f}% |"
        )
    lines.append("")
    lines.append("## Outcome Breakdown")
    lines.append("| Outcome | Count | Ratio |")
    lines.append("|---|---:|---:|")
    for outcome in (
        "direct_success",
        "direct_failed_then_ytdlp_success",
        "non_direct_success",
        "all_failed",
        "cancelled",
    ):
        count = outcome_counts.get(outcome, 0)
        ratio = safe_rate(count, total_attempts)
        lines.append(f"| {outcome} | {count} | {ratio:.2f}% |")
    lines.append("")
    lines.append("## Route Timing (P50/P95, ms)")
    lines.append("| Route | P50 | P95 |")
    lines.append("|---|---:|---:|")
    for route in ("direct_douyin", "direct_xiaohongshu", "yt_dlp", "videodl", "null"):
        durations = route_durations.get(route, [])
        if durations:
            lines.append(
                f"| {route} | {percentile(durations, 50):.0f} | {percentile(durations, 95):.0f} |"
            )
        else:
            lines.append(f"| {route} | - | - |")
    lines.append("")
    lines.append("## Failure Top Causes")
    lines.append("| Rank | Route | Error Pattern | Count |")
    lines.append("|---:|---|---|---:|")
    if top_failures:
        for idx, ((route, reason), count) in enumerate(top_failures, start=1):
            lines.append(f"| {idx} | {route} | {reason} | {count} |")
    else:
        lines.append("| 1 | - | - | 0 |")
    lines.append("")
    lines.append("## Deletion Gates")
    lines.append(
        f"- Coverage >= {gate_days_required} days: "
        f"{'PASS' if enough_days else 'INSUFFICIENT_DATA'} (observed {span_days:.2f} days)"
    )
    lines.append(
        "- Douyin success rate >= 95% over required window: "
        f"{gate_status(gate_douyin)} ({safe_rate(douyin_success, douyin_total):.2f}%)"
    )
    lines.append(
        "- Xiaohongshu success rate >= 95% over required window: "
        f"{gate_status(gate_xhs)} ({safe_rate(xhs_success, xhs_total):.2f}%)"
    )
    if max_direct_fallback_ratio >= 0.0:
        lines.append(
            "- direct_failed_then_ytdlp_success bounded: "
            f"{gate_status(gate_fallback)} "
            f"(ratio {direct_fallback_ratio:.4f}, threshold <= {max_direct_fallback_ratio:.4f})"
        )
    else:
        lines.append(
            "- direct_failed_then_ytdlp_success bounded: MANUAL_THRESHOLD_REQUIRED "
            f"(ratio {direct_fallback_ratio:.4f})"
        )
    lines.append(
        "- No major regressions in file integrity/quality checks: MANUAL_VALIDATION_REQUIRED"
    )
    lines.append("")
    lines.append("## Notes / Actions")
    lines.append("- Observations:")
    lines.append("- Regressions:")
    lines.append("- Next phase gate decision:")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    args = parse_args()

    records: dict[str, TraceRecord] = {}
    parse_failures = 0
    total_trace_lines = 0

    for line in iter_lines(args.inputs):
        if TRACE_PREFIX not in line:
            continue
        total_trace_lines += 1
        event = parse_download_trace_event(line)
        if event is None:
            parse_failures += 1
            continue

        trace_id = event.get("traceId")
        stage = event.get("stage")
        payload = event.get("payload")
        if not isinstance(trace_id, str) or not isinstance(stage, str) or not isinstance(payload, dict):
            parse_failures += 1
            continue

        record = records.setdefault(trace_id, TraceRecord(trace_id=trace_id))
        record.urls.extend(extract_urls_from_payload(payload))

        if stage == "terminal":
            ts_ms = event.get("tsMs")
            if not isinstance(ts_ms, int):
                ts_ms = 0
            terminal_event = {
                "stage": stage,
                "ts_ms": ts_ms,
                "payload": payload,
            }
            previous = record.terminal
            if previous is None or ts_ms >= int(previous.get("ts_ms", 0)):
                record.terminal = terminal_event

    attempts: list[dict] = []
    for record in records.values():
        if record.terminal is None:
            continue
        payload = record.terminal["payload"]
        outcome = payload.get("outcome")
        if not isinstance(outcome, str) or outcome not in VALID_OUTCOMES:
            continue
        final_route = payload.get("finalRoute")
        if final_route is not None and not isinstance(final_route, str):
            final_route = "null"
        route_chain = payload.get("routeChain")
        if not isinstance(route_chain, list):
            route_chain = []
        duration_ms = payload.get("durationMs")
        if not isinstance(duration_ms, (int, float)):
            duration_ms = 0.0
        error = payload.get("error")
        if not isinstance(error, str):
            error = ""

        attempts.append(
            {
                "trace_id": record.trace_id,
                "platform": infer_platform(record.urls),
                "outcome": outcome,
                "final_route": final_route or "null",
                "route_chain": route_chain,
                "duration_ms": float(duration_ms),
                "error": error,
                "ts_ms": int(record.terminal["ts_ms"]),
            }
        )

    if args.window_days > 0 and attempts:
        latest_ts = max(a["ts_ms"] for a in attempts if a["ts_ms"] > 0)
        if latest_ts > 0:
            cutoff = latest_ts - int(timedelta(days=args.window_days).total_seconds() * 1000)
            attempts = [a for a in attempts if a["ts_ms"] == 0 or a["ts_ms"] >= cutoff]

    build = args.build or current_git_short_sha()
    report = render_report(
        attempts=attempts,
        parse_failures=parse_failures,
        env_label=args.env,
        build_label=build,
        gate_days_required=args.require_gate_days,
        max_direct_fallback_ratio=args.max_direct_fallback_ratio,
    )

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
        print(
            f"Wrote report: {out_path} "
            f"(attempts={len(attempts)}, trace_lines={total_trace_lines}, parse_failures={parse_failures})"
        )
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
