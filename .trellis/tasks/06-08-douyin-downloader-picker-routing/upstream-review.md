# Upstream Review: jiji262/douyin-downloader

Date: 2026-06-08

## Decision

Do not update Ameow's managed `douyin-dl` pin in this implementation pass.

Current Ameow pin remains:

- ref: `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`
- upstream tag: `desktop-v0.4.8`
- package version: `2.0.0`

## Review Evidence

Compared refs:

- current pin / `desktop-v0.4.8`: `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`
- latest tagged release / `desktop-v0.4.9`: `f856869863ccca107dc2c086487ee8955d84c23f`
- upstream `main`: `dc7e967b1680cf18beae9857fb99eb43fe0aeee6`

Findings:

- `desktop-v0.4.9` is not purely GUI work. It changes downloader-core and config files such as `core/api_client.py`, `core/downloader_base.py`, `core/user_downloader.py`, `core/user_modes/*`, `config/default_config.py`, `config/config_loader.py`, `pyproject.toml`, and `requirements.txt`.
- `desktop-v0.4.9` does not change `core/url_parser.py`; the URLParser behavior relevant to unsupported `jingxuan` / picker URLs is unchanged from Ameow's current pin.
- `desktop-v0.4.9` keeps CLI entrypoint `douyin-dl = "cli.main:main"` and package version `2.0.0`.
- `desktop-v0.4.9` raises `requires-python` from `>=3.8` to `>=3.9` and adds a required `imageio-ffmpeg==0.6.0` dependency for audio extraction/transcript features that Ameow does not currently use.
- Upstream `main` after `desktop-v0.4.9` changes media-quality selection in `core/downloader_base.py` / `core/video_downloader.py`, but it is not a tagged release and is not directly related to the current URLParser failure.

## Rationale

The current user-visible failure is caused by Ameow passing an unsupported page/source URL to `douyin-dl` when better browser-extension evidence exists. Since upstream `desktop-v0.4.9` does not change URLParser behavior, updating the pin would not address the primary failure.

Under the user-confirmed conservative threshold, a pin update needs a demonstrated benefit to Ameow's CLI/download path plus passing validation. The latest tagged release adds dependency and Python-version surface area without a clear fix for this task's failure class, so the safer path is to keep the current pin and fix provider-owned source selection in Ameow.

## Future Revisit

Revisit upstream `main` or the next tagged release if Ameow needs:

- media-quality selection improvements from post-`desktop-v0.4.9` commits;
- upstream URLParser support for new Douyin page shapes;
- a release that directly improves single-video/note/gallery CLI extraction behavior used by Ameow.
