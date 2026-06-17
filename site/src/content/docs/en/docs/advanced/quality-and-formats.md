---
title: Quality Preferences and Formats
description: Understand how Ameow's quality choices affect image quality, file size, stability, and post-download conversion.
---

The quality preference decides whether Ameow leans toward visual quality, smaller files, or steadier downloads. It is not an absolute guarantee because each site exposes different formats, resolutions, and access rules.

Default recommendation: use Balanced when you are unsure. Move away from it only when you clearly need archive quality or smaller files.

## Three common choices

| Preference | Good for | Tradeoff |
| --- | --- | --- |
| Highest quality | Keeping the best source material you can get | Larger files, more merging or conversion, and higher failure risk |
| Balanced | Everyday saving, reuse, and sharing | Middle ground between quality and file size |
| Data saver | Slow networks, limited storage, quick reference copies | Lower visual quality |

If you are not sure, start with Balanced. It is usually the most stable baseline and the best preference for checking whether a failing link is usable at all.

## Why is highest quality more complex?

Many sites split video and audio into separate tracks or expose formats that play in the browser but are awkward in editing tools. To get the highest result, Ameow may need to:

- choose a higher-bitrate video track;
- fetch a separate audio track;
- merge audio and video;
- convert the container or codec.

Those extra steps increase processing time and create more failure points.

## Format hints in more quality choices

On supported sites, Ameow may show a short hint beside a quality row:

- `封装` means the choice is expected to need container packaging only, without re-encoding the video.
- `转码` means the choice is expected to re-encode audio or video, so it can take longer.

These hints come from probed format metadata, not from the resolution. No hint does not guarantee zero post-processing; it only means Ameow does not have enough certain information to label it before download.

## How should I choose?

### I only want a reference copy

Use Balanced or Data Saver. Fast saves and smaller files matter more than absolute quality.

### I want to edit the media later

Think about compatibility, not only resolution. If the file is headed into After Effects, continue to [AE-Compatible Formats](../ae-compatibility/).

### I want to archive source material

Choose Highest quality, but expect larger files, longer waits, and possible conversion.

## If the result is not what I expected

If Highest quality fails, do not assume the link is unusable. Try this order:

1. switch to Balanced;
2. confirm the page plays in the browser;
3. if login is required, send the task through the extension;
4. confirm the output folder is writable;
5. update to the latest stable release.

If Balanced works, the link and site are probably fine and the trouble is more likely in format selection or conversion.

## When does Ameow skip transcoding?

When the downloaded result is already a good editing-software combination, Ameow tries to keep the original file instead of transcoding it again unnecessarily. Common compatible combinations include:

- `MP4` or `MOV`
- `H.264` or `H.265`
- `AAC`

That means a source file that already matches these combinations is more likely to need only necessary packaging, not a full re-encode.
