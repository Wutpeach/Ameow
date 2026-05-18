# Multi-platform Download Buttons

## Goal

Add FlowSelect cat download button support to YouTube, Bilibili, and extend Douyin coverage to include more page types (discover/featured videos, video covers).

## Requirements

### 1. YouTube Support
- Add download button to YouTube video player controls
- Detect video pages and inject button
- Send video URL to FlowSelect via WebSocket

### 2. Bilibili Support
- Add download button to Bilibili video player controls
- Detect video pages and inject button
- Send video URL to FlowSelect via WebSocket

### 3. Douyin Extended Support
- Current: Only `/video/` pages have download button
- Add support for:
  - Discover/Featured pages (精选视频)
  - Video covers/thumbnails in feeds
  - Search results
  - User profile video lists

## Acceptance Criteria

- [ ] YouTube: Download button appears in video player controls
- [ ] Bilibili: Download button appears in video player controls
- [ ] Douyin: Download button appears on discover/featured video pages
- [ ] Douyin: Download button appears on video covers in feeds
- [ ] All buttons use the cat icon SVG
- [ ] All buttons send correct video URL to background script
- [ ] manifest.json updated with new content scripts

## Technical Notes

- Follow existing pattern from twitter-detector.js and douyin-detector.js
- Use MutationObserver for dynamic content detection
- Reference aixdownloader implementation for Douyin page selectors
- Button styling should match platform aesthetics
