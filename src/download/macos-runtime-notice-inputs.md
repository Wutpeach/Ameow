# macOS on-demand runtime notice inputs

These records describe macOS Apple Silicon tools acquired on demand. They do
not establish complete third-party notice or corresponding-source coverage, or
approve public distribution. The Rust package inventory in the common notice
describes the Windows dependency graph; the macOS graph still needs its own
attribution review.

## Pinned acquired materials

The acquisition URLs and SHA-256 values for executables are in
`macos-runtime-manifest.json`; the gallery dependency wheel URLs, byte counts
and SHA-256 values are in `macos_gallery.rs`. Pins protect the selected bytes;
they do not by themselves establish source correspondence or redistribution
rights.

| Material | Version | Observed license material |
| --- | --- | --- |
| Astral python-build-standalone CPython | 3.13.18+20261110, Apple Silicon `install_only` | CPython `python/lib/python3.13/LICENSE.txt`; the archive also includes pip 26.3 and its vendored license files, preserved in the companion text. Additional bundled native library notices and complete source correspondence remain to be inventoried. |
| gallery-dl | 1.32.20 wheel | GPL-2.0-only; `gallery_dl-1.32.20.dist-info/licenses/LICENSE`. |
| requests | 2.34.2 wheel | Apache-2.0; `requests-2.34.2.dist-info/licenses/LICENSE`. |
| idna | 3.20 wheel | BSD 3-Clause; `idna-3.20.dist-info/LICENSE.md`. |
| urllib3 | 2.8.0 wheel | MIT; `urllib3-2.8.0.dist-info/licenses/LICENSE.txt`. |
| charset-normalizer | 3.5.2 wheel | MIT; `charset_normalizer-3.5.2.dist-info/licenses/LICENSE`. |
| certifi | 2026.10.23 wheel | MPL-2.0; `certifi-2026.10.23.dist-info/licenses/LICENSE`. |
| Martin Riedl FFmpeg and ffprobe | 9.0.2, macOS arm64 release created 2026-09-20 | Both report GPL-3.0-or-later; their separately downloaded ZIPs contain only the respective executable. The GPLv3 text follows in the offline notice. The publisher's build configuration enables GPL, version 3 and OpenSSL; bundled libraries have their own licenses and exact corresponding-source obligations still need review. |

The fixed publisher release and dependency report are:

- https://ffmpeg.martin-riedl.de/info/detail/macos/arm64/1789931890_9.0.2
- https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/versions.txt
- FFmpeg ZIP SHA-256: `C8ED4C4E6978A03C485EDBFE4E0A5DC2380F8A30BBA5150531B31B094492D924`; executable SHA-256: `2E11C6F90993CDB79FFF84D3F90044D28316B310E75B3E030CFC9A54F2C9D384`.
- ffprobe ZIP SHA-256: `FCBE839537485EAEE7A7A8BC5CBC0F90D53617E80943E8A5B2E31CB851197EA6`; executable SHA-256: `2738AA46A7F9ACBC8AB09A6715554C90F7DE603171AC403726765685DF6A0059`.

The downloaded ZIPs matched the publisher's SHA-256 files served by the same
site; no independent binary signature was verified. The publisher links
its build script at https://git.martin-riedl.de/ffmpeg/build-script; upstream
FFmpeg 9.0.2 source is at https://github.com/FFmpeg/FFmpeg/tree/n9.0.2. The
public build-script history includes commit
`6a611e19870e197bc37c6e4c7fccddebd3715466`, which sets the FFmpeg version to
9.0.2 on the release date; the publisher does not attest that this exact commit
produced the binaries. Its `script/build-ffmpeg.sh` downloads the FFmpeg source
tarball from https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.bz2. The tarball
fetched from that URL was 14,464,861 bytes and had SHA-256
`EE80A25A5621DF84498CEF46917BE87EAB3B4F01951E85C2C7CBE5C94914EE70`; its
`COPYING.GPLv3` matches `assets/runtime-GPL-3.0.txt`. Its detached SHA-512
signature verified against the upstream signing key fingerprint
`FCF986EA15E6E293A5644F10B4322F04D67658D8`; a modified tarball was rejected.
The key and fingerprint were obtained from the FFmpeg site. The PGPy 0.6.0
verifier reported that self-signatures, revocation and key flags were not checked.
The same historical build script uses `script/build-x264.sh` to download an
unpinned x264 `master` archive; it does not establish which x264 revision was
used in the published binaries.
The binary archives do not identify the exact source hashes, patches and
complete notices for every linked component, so these records do not establish
exact source correspondence.

The publisher's version report names aom 3.15.0, libass 0.17.5, libbluray
1.5.0, dav1d 1.5.4, fontconfig 2.17.1, freetype 2.13.0, fribidi 1.0.16,
harfbuzz 14.4.0, libklvanc 1.6.0, lame 4.0, openh264 2.6.0, openJPEG 2.5.4,
OpenSSL 3.6.4, opus 1.6.1, rav1e 0.8.1, SDL 2.32.10, snappy 1.2.2, srt
1.5.7, SVT-AV1 4.2.0, libtheora 1.2.0, libvmaf 3.2.0, libvorbis 1.3.7,
libvpx 1.16.0, vvenc 1.14.0, libwebp 1.6.0, x264 0.165.x, x265 4.2,
libxml2 2.15.3, zimg 3.0.6, zlib 1.3.2 and zvbi 0.2.35. This is the
publisher's report, not an independent proof of every linked source.

The yt-dlp zipapp and Deno have their own pinned releases, bundled third-party
terms and source obligations. Their macOS-specific complete notice coverage
also remains to be checked. A separately acquired tool can still have applicable
notice and source obligations.

## Observed binary compatibility

Inspection of the pinned main executables showed minimum deployment targets of
macOS 11.0 for Python and 12.0 for Deno, FFmpeg and ffprobe. Their direct
`otool -L` dependencies were system frameworks and libraries. Inspection of
the nine `.so`/`.dylib` files in the pinned Python tree showed macOS 11.0 load
commands and system-library or bundled Tcl/Tk/libpython references. These
observations do not establish the minimum for the whole application or prove
execution on an older macOS release.

With an empty PATH, FFmpeg 9.0.2 generated H.264/AAC MP4 and VP9/Opus WebM
samples that the paired ffprobe identified with the expected video dimensions,
audio streams and duration. Both tools also read a public HTTPS MP4 on the
tested host with certificate verification and `/etc/ssl/cert.pem` configured.
The managed macOS process environment sets `SSL_CERT_FILE` to that system
bundle. The pinned FFmpeg reports peer verification enabled by default. In a
local TLS test, the system bundle rejected a self-signed certificate; after
explicitly trusting that test certificate, the same tools read media through
HTTPS but rejected a hostname mismatch. HTTPS can fail if the system bundle or
a required trusted root is unavailable. These are limited samples, not proof
for arbitrary media or older macOS.

Before claiming complete coverage, review all native Python dependencies, the
macOS Rust graph, yt-dlp and Deno bundled notices, the FFmpeg build's individual
library licenses and corresponding sources, and the applicable obligations for
the actual delivery model.
