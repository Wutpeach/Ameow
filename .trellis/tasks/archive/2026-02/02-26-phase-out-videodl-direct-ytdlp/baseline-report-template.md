# Baseline Report Template (Phase 0)

## Generate Report (from DownloadTrace logs)

```bash
python3 ./.trellis/scripts/download_trace_report.py \
  --input <flowselect-log-file> \
  --output .trellis/tasks/02-26-phase-out-videodl-direct-ytdlp/baseline-report.md \
  --env canary \
  --window-days 3
```

For deletion-gate review:

```bash
python3 ./.trellis/scripts/download_trace_report.py \
  --input <flowselect-log-file> \
  --output .trellis/tasks/02-26-phase-out-videodl-direct-ytdlp/deletion-gate-report.md \
  --env canary \
  --window-days 7 \
  --max-direct-fallback-ratio 0.35
```

## Window
- Start:
- End:
- Environment: dev / canary / release
- Build/Commit:

## Data Source
- Log prefix: `>>> [DownloadTrace]`
- Required terminal fields:
  - `payload.outcome`
  - `payload.finalRoute`
  - `payload.routeChain`
  - `payload.durationMs`

## Outcome Taxonomy
- `direct_success`
- `direct_failed_then_ytdlp_success`
- `non_direct_success`
- `all_failed`
- `cancelled`

## Platform Summary
| Platform | Total | Success | Failed | Cancelled | Success Rate |
|---|---:|---:|---:|---:|---:|
| douyin |  |  |  |  |  |
| xiaohongshu |  |  |  |  |  |
| bilibili |  |  |  |  |  |
| others |  |  |  |  |  |

## Outcome Breakdown
| Outcome | Count | Ratio |
|---|---:|---:|
| direct_success |  |  |
| direct_failed_then_ytdlp_success |  |  |
| non_direct_success |  |  |
| all_failed |  |  |
| cancelled |  |  |

## Route Timing (P50/P95, ms)
| Route | P50 | P95 |
|---|---:|---:|
| direct_douyin |  |  |
| direct_xiaohongshu |  |  |
| yt_dlp |  |  |
| videodl |  |  |

## Failure Top Causes
| Rank | Route | Error Pattern | Count |
|---:|---|---|---:|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## Notes / Actions
- Observations:
- Regressions:
- Next phase gate decision:
