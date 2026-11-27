"""Application-owned output policy; loaded only in one isolated transfer process."""
import math
import os

from yt_dlp.postprocessor.common import PostProcessor
from yt_dlp.postprocessor.ffmpeg import FFmpegMergerPP, FFmpegPostProcessor
from yt_dlp.utils import PostProcessingError, prepend_extension, replace_extension


def _hdr(stream):
    # Primaries and bit depth alone are not HDR. Unknown wide-gamut material
    # stays on the old path; explicit SDR transfer does not create an HDR exception.
    transfer = stream.get('color_transfer')
    sdr_transfers = ('bt709', 'smpte170m', 'smpte240m', 'gamma22', 'gamma28',
                     'iec61966-2-1', 'iec61966-2-4', 'bt1361e', 'bt2020-10', 'bt2020-12')
    return (transfer in ('smpte2084', 'arib-std-b67')
            or any(any(word in str(data.get('side_data_type', '')).lower()
                       for word in ('mastering display', 'content light', 'dovi', 'hdr'))
                   for data in stream.get('side_data_list', []))
            or (stream.get('color_primaries') == 'bt2020' and transfer not in sdr_transfers))


def _native_hdr(info):
    formats = info.get('requested_formats') or [info]
    return any(str(fmt.get('dynamic_range') or '').upper().startswith(('HDR', 'HLG', 'DV'))
               for fmt in [info, *formats])


def _rate(value):
    try:
        num, den = str(value).split('/')
        rate = float(num) / float(den)
        return rate if math.isfinite(rate) and rate > 0 else None
    except (ValueError, ZeroDivisionError):
        return None


def _positive(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


def _source(streams):
    videos = [s for s in streams if s.get('codec_type') == 'video'
              and not s.get('disposition', {}).get('attached_pic')]
    if not videos:
        raise PostProcessingError('E_MEDIA_UNVERIFIED: output video evidence missing')
    video = videos[0]
    average, nominal = _rate(video.get('avg_frame_rate')), _rate(video.get('r_frame_rate'))
    # Matroska may echo nominal fps without measuring packet cadence. Require
    # frame-count/duration evidence before treating the reported average as CFR.
    frames, duration = _positive(video.get('nb_frames')), _positive(video.get('duration'))
    measured = frames / duration if frames and duration else None
    fps = average if (average and nominal and measured
                      and abs(average - nominal) <= nominal * 0.001
                      and abs(measured - average) <= average * 0.001) else None
    return dict(width=video.get('width'), height=video.get('height'),
                fps=fps,
                audio_channels=[s.get('channels') for s in streams if s.get('codec_type') == 'audio'])


def _options(streams, preserve_hdr=False):
    preserve_hdr = preserve_hdr or any(_hdr(s) for s in streams if s.get('codec_type') == 'video')
    options = ['-c', 'copy']
    if preserve_hdr:
        return 'mkv', options, False
    video_index = audio_index = 0
    changed = False
    for stream in streams:
        kind = stream.get('codec_type')
        if kind == 'video':
            if (stream.get('codec_name') != 'h264' or stream.get('pix_fmt') != 'yuv420p'
                    or stream.get('profile') not in ('Baseline', 'Constrained Baseline', 'Main', 'High')):
                options += [f'-c:v:{video_index}', 'libx264', f'-preset:v:{video_index}', 'faster',
                            f'-crf:v:{video_index}', '18', f'-pix_fmt:v:{video_index}', 'yuv420p',
                            f'-threads:v:{video_index}', '4', f'-fps_mode:v:{video_index}', 'passthrough',
                            f'-enc_time_base:v:{video_index}', 'demux']
                changed = True
            video_index += 1
        elif kind == 'audio':
            if stream.get('codec_name') != 'aac' or stream.get('profile') != 'LC':
                # Preserve channel layout; no -ac, and no fixed mono/stereo bitrate for surround.
                options += [f'-c:a:{audio_index}', 'aac', f'-profile:a:{audio_index}', 'aac_low',
                            f'-b:a:{audio_index}', str(96000 * max(2, stream.get('channels') or 2))]
                changed = True
            audio_index += 1
    return 'mp4', options, changed


class _CompatibleMergerPP(FFmpegPostProcessor):
    def run(self, info):
        paths = info['__files_to_merge']
        inputs = [self.get_metadata_object(path) for path in paths]
        streams = [s for item in inputs for s in item['streams']]
        source = _source(streams)
        ext, options, _ = _options(streams, _native_hdr(info))
        audio_index = 0
        for item in inputs:
            for stream in item['streams']:
                if stream.get('codec_type') == 'audio':
                    if stream.get('codec_name') == 'aac' and item.get('format', {}).get('format_name') in ('aac', 'mpegts'):
                        options += [f'-bsf:a:{audio_index}', 'aac_adtstoasc']
                    audio_index += 1
        filename = replace_extension(info['filepath'], ext, info['ext'])
        temporary = prepend_extension(filename, 'temp')
        # Keep all selected tracks, including multiple audio tracks; unsupported muxing fails.
        for index in range(len(paths)):
            options += ['-map', str(index)]
        self.to_screen('Merging selected tracks into ' + ext.upper())
        self.run_ffmpeg_multiple_files(paths, temporary, options)
        os.replace(temporary, filename)
        info.update(filepath=filename, ext=ext, _ameow_source_media=source)
        return paths, info


class AmeowOutputPolicyPP(PostProcessor):
    def run(self, info):
        # The native merger has no plugin override hook. Scope this replacement to
        # the application-owned child, retaining native PP hooks and process ownership.
        FFmpegMergerPP.run = _CompatibleMergerPP.run
        if info.get('section_start') is not None or info.get('section_end') is not None:
            precise = self.get_param('force_keyframes_at_cuts', False)
            hdr = _native_hdr(info)
            options = dict(info.get('downloader_options') or {})
            args = []
            if precise:
                args += ['-c:v', 'libx264', '-preset', 'faster', '-crf', '18', '-threads', '4',
                         '-c:a', 'aac', '-fps_mode', 'passthrough', '-enc_time_base:v', 'demux']
                # Keep native depth/color until the owned output can be probed.
                # Ordinary 8-bit SDR already becomes the target in this single pass.
            # Fast copy must also accept codecs MP4 cannot mux. Inspect the owned
            # cut before conversion; do not preflight remote inputs or switch cut modes.
            args += ['-f', 'mp4' if precise and not hdr else 'matroska', '-movflags', '+faststart']
            if not info.get('requested_formats'):
                args += ['-map', '0']
            options['ffmpeg_args_out'] = [*options.get('ffmpeg_args_out', []), *args]
            info['downloader_options'] = options
        return [], info


class AmeowCompatibleMP4PP(FFmpegPostProcessor):
    def run(self, info):
        path = info['filepath']
        probe = self.get_metadata_object(path)
        streams = probe['streams']
        source = info.get('_ameow_source_media') or _source(streams)
        ext, options, changed = _options(streams, _native_hdr(info))
        container = probe.get('format', {}).get('format_name', '').split(',')
        brand = str(probe.get('format', {}).get('tags', {}).get('major_brand') or '').strip()
        right_container = ('mov' in container and brand and brand != 'qt'
                           if ext == 'mp4' else 'matroska' in container)
        filename = replace_extension(path, ext, info['ext'])
        if changed or not right_container:
            temporary = prepend_extension(filename, 'compatible.temp')
            self.to_screen('Preparing compatible MP4' if ext == 'mp4' else 'Preserving HDR output')
            self.run_ffmpeg(path, temporary, ['-map', '0', *options])
            os.replace(temporary, filename)
            deleted = [path] if path != filename else []
        else:
            deleted = []
            if path != filename:
                os.replace(path, filename)
        info.update(filepath=filename, ext=ext, _ameow_output=dict(compatible_mp4=ext == 'mp4', **source))
        return deleted, info
