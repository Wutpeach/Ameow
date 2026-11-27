# Proposal

## Why

当前固定 MKV 交付不便直接进入剪辑软件。用户已批准 #94：普通 SDR 默认兼容 MP4，接受必要转码，以 DaVinci Resolve 实际导入验收；此决定替代原调研的自动保留编码默认。

## What Changes

- 原生选流保持现有画质/尺寸/fps 优先；选流后仅转换不兼容轨道，输出 H.264 常规 8-bit 4:2:0 与 AAC 的 MP4。
- 整段、快切及精确共享输出意图；保留各自时间边界、资源结算、成品核验和发布。
- HDR 沿既有处理与输出，不新增 tone mapping、兼容承诺或设置面板。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `download-execution`: 默认 SDR 输出、必要转码与源/成品预期。

## Impact

yt-dlp Adapter 的应用内受控后处理、视频 verifier 与对应定向测试。CLI 复用队列的同一策略，不增加格式参数。正式用户文档待发行时同步，本次提供双语待审说明。
