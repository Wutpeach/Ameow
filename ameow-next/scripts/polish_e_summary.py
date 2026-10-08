"""Condense existing native traces without rerunning the application."""
import json
import math
from pathlib import Path
from polish_d_analyze import distribution

root = Path(__file__).resolve().parents[1] / 'evidence/polish-e'
summaries = []
for theme in ('light', 'night'):
    folder = root / 'space' / theme
    rows = [json.loads(line) for line in (folder / 'frames.jsonl').read_text().splitlines() if line.strip()]
    rows = [frame for frame in rows if 'hover' in frame]
    start = next(frame for frame in rows if frame['target_full'])
    onset = next(frame for frame in rows if frame['target_full'] and frame['hover']['fade_weight'] > 0 and math.hypot(*frame['hover']['current_offset']) > .01)
    endpoint = next(frame for frame in rows if frame['target_full'] and frame['rawfullness'] == 1)
    rest = next(frame for frame in rows if frame['target_full'] and frame['rawfullness'] == 1 and frame['settlephase'] == 'rest')
    samples = []
    for label, frame in [('intent', start), ('visible_onset', onset), ('Full_endpoint', endpoint), ('settled_rest', rest)]:
        samples.append(dict(phase_label=label, ms=frame['ms'], relative_to_intent_ms=frame['ms'] - start['ms'], fullness=frame['rawfullness'], settlephase=frame['settlephase'], hover=frame['hover'], native_request=frame['native_request'], anchor=frame['anchor']))
    analysis = json.loads((folder / 'analysis.json').read_text())
    active_intervals = []
    long_gaps = []
    for previous, frame in zip(rows, rows[1:]):
        hover = previous['hover']
        moving = previous['settlephase'] != 'rest' or abs(previous['velocity']) > .001 or abs(previous['extra_velocity']) > .001 or math.hypot(*hover['spring_velocity']) > .01 or math.dist(hover['spring_position'], hover['target_offset']) > .001
        if moving:
            active_intervals.append(frame['dt_actual_ms'])
        if frame['dt_actual_ms'] >= 600:
            long_gaps.append(dict(ms=frame['ms'], dt_ms=frame['dt_actual_ms'], previous_ms=previous['ms'], previous_moving=moving, previous_target_full=previous['target_full'], previous_phase=previous['settlephase'], previous_tracking=hover['tracking']))
    summary = dict(theme=theme, cpu_cadence=analysis['active_recorded_callback_interval_ms'], all_active_motion_cadence=distribution(active_intervals), phase_samples=samples, all_callback_max_ms=max(frame['dt_actual_ms'] for frame in rows), callback_ge600=sum(frame['dt_actual_ms'] >= 600 for frame in rows), long_gaps=long_gaps, cadence_limit='CPU callback timestamps only. Startup idle-to-enter sleep excluded from active-motion cadence; GPU/DWM and subjective feel unmeasured.')
    summaries.append(summary)
    print(json.dumps(summary))
(root / 'native-summary.json').write_text(json.dumps(summaries, indent=2), encoding='utf-8')
