---
title: Supported links and quality
description: Supported video, image, and gallery entries, and download quality choices.
---

## Links you can paste

| Source | Supported entry |
| --- | --- |
| YouTube | Public single videos: watch, youtu.be, shorts, embed, live. |
| Bilibili | Public single videos: BV, av, b23.tv, including one specified part. |
| Xiaohongshu | Single-video notes; keep the full sharing URL and its parameters. |
| Imgur | Image or album entries. |
| Bluesky | Images in a single post. |
| Other public HTTP(S) links | Can be attempted. The downloader must identify and deliver a single video or image; arbitrary web pages are not guaranteed. |

YouTube and Bilibili playlist or series parameters are rejected; copy the specific video address. Unauthorized sites use anonymous attempts; you can also [authorize a site's session](../extension/). Login, membership, region, and site changes can affect downloads; see [download problems](../troubleshooting/#downloads).

<span id="quality"></span>

## Choose quality

Before submitting, choose in Full's right-click menu:

| Choice | Video height cap |
| --- | --- |
| Highest | No cap |
| Balanced (default) | 1080p |
| Saver | 480p |

Resolution and format depend on the site's media; the cap does not resize images. Tasks and retries retain their submitted quality. The menu stays open after saving; choices are unavailable while saving, and failure keeps the previous value and shows a message.

If the site has no video format within the selected cap, the task shows **No format**. For example, Saver does not resize a source offered only at 1080p to 480p. Change quality and submit the link again; retrying the original task keeps its original quality.

## File formats

Standard SDR videos using yt-dlp are saved as MP4 with conventional 8-bit H.264 video and AAC audio, preserving the selected resolution and frame rate. Silent sources stay silent. Full downloads and fast clips that allow stream copying copy compatible tracks and convert only incompatible ones. Necessary conversion takes extra processing time and can introduce encoding loss or change the file size.

Fast clips retain their keyframe boundaries. Precise clips are re-encoded for accurate time boundaries, aiming to produce compatible MP4 in that same pass. A task continues to show processing while conversion or verification is still running after the transfer ends.

HDR keeps its existing processing and output behavior. Ameow does not automatically convert HDR to SDR or guarantee that every HDR source works directly in editing software. Image downloads use a different path. If [an editor has no sound](../troubleshooting/#editor-audio), keep the original and check the file and the editor's support.
