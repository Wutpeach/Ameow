---
title: Supported links and quality
description: Supported video, image, and gallery entries, and download quality choices.
---

## Links you can paste

| Source | Supported entry |
| --- | --- |
| YouTube | Public single videos: watch, youtu.be, shorts, embed, live. |
| Bilibili | Public single videos: BV, av, b23.tv, including one specified part. |
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

## File formats

Video downloads using yt-dlp merge or remux to MKV while preserving the original audio codec. A container extension and the audio and video codecs inside it are different things; a quality choice does not guarantee a codec or editor compatibility. Image downloads use a different path. If [an editor has no sound](../troubleshooting/#editor-audio), check the file format and the editor's support.
