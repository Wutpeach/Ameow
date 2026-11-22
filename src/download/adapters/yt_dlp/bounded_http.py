"""Apply bounded HTTP reads after yt-dlp selects the actual section formats."""
import math
from urllib.parse import urlsplit

from yt_dlp.postprocessor.common import PostProcessor

_REQUEST = ['-request_size', '8388608']
_MISSING = object()


def _args(info):
    options = info.get('downloader_options', _MISSING)
    if options is _MISSING or options is None:
        return []
    if not isinstance(options, dict):
        return None
    args = options.get('ffmpeg_args', _MISSING)
    if args is _MISSING or args is None:
        return []
    if not isinstance(args, list) or any(not isinstance(arg, str) for arg in args):
        return None
    # Never override a native request size, explicit range, or request method.
    if any(arg.split('=', 1)[0].lower() in ('-request_size', '-headers', '-method', '-offset', '-end_offset')
           for arg in args):
        return None
    return args


def _eligible_input(fmt):
    if not isinstance(fmt, dict) or fmt.get('protocol') != 'https':
        return False
    if any(fmt.get(key) for key in ('fragments', 'manifest_url', 'fragment_base_url', 'hls_aes')):
        return False
    url = fmt.get('url')
    if not isinstance(url, str):
        return False
    try:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            return False
    except ValueError:
        return False
    headers = fmt.get('http_headers')
    if headers is not None and (not isinstance(headers, dict) or any(
            isinstance(key, str) and key.lower() == 'range' for key in headers)):
        return False
    return True


class AmeowBoundedHttpPP(PostProcessor):
    def run(self, info):
        status = self._apply(info)
        self.to_screen('AMEOW_BOUNDED_HTTP=' + status, prefix=False)
        return [], info

    def _apply(self, info):
        if not isinstance(info, dict) or info.get('extractor_key') != 'Youtube':
            return 'not_applicable'
        if info.get('_type') not in (None, 'video') or info.get('is_live') not in (None, False):
            return 'not_applicable'
        if info.get('live_status') not in (None, 'not_live', 'was_live'):
            return 'not_applicable'
        start, end = info.get('section_start'), info.get('section_end')
        if (isinstance(start, bool) or isinstance(end, bool)
                or not isinstance(start, (int, float)) or not isinstance(end, (int, float))
                or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start):
            return 'not_applicable'
        formats = info.get('requested_formats', _MISSING)
        if formats is _MISSING or formats is None:
            formats = [info]
        elif not isinstance(formats, list) or not formats:
            return 'not_applicable'
        if not all(_eligible_input(fmt) for fmt in formats):
            return 'not_applicable'
        root_headers = info.get('http_headers')
        if root_headers is not None and (not isinstance(root_headers, dict) or any(
                isinstance(key, str) and key.lower() == 'range' for key in root_headers)):
            return 'conflict'
        fallback = _args(info)
        if fallback is None:
            return 'conflict'
        replacements = []
        for fmt in formats:
            own = _args(fmt)
            if own is None:
                return 'conflict'
            # FFmpegFD uses per-format args when nonempty, otherwise root args.
            effective = own or fallback
            options = dict(fmt.get('downloader_options') or {})
            options['ffmpeg_args'] = list(effective) + _REQUEST
            replacements.append(options)
        for fmt, options in zip(formats, replacements):
            fmt['downloader_options'] = options
        return 'applied'
