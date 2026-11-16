# Proposal

## Why

用户希望先体验猫咪眨眼等基础生命感，再决定后续调参与发行选择（Wutpeach/Ameow #25，父项 #37）。当前 Compact 只有圆窗，没有指定猫咪或基础行为。

## What Changes

- 以 Figma「Ameow Icon Design / Compact · Placeholder」5:278、5:279 的分层矢量接入 Light/Night 60px 猫咪。
- 增加低频自然眨眼、眼先头后的轻观察、偶发错时耳动，保持爪子与前景稳定。
- 不可见或 Full 活跃时暂停 Mascot 刷新，减少动态时呈现静止待机；不延迟现有展开/收起。
- 维护原生预览场景，提供 Windows 可启动应用和真实动效证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`：增加 Compact 基础猫咪的姿态、可见性与交互边界。

## Impact

局部 Mascot 绘制/行为模块、main 的展示与唤醒接入、预览目录；不引入运行时依赖，不重构窗口/下载/平台层。不开发探头、舔爪、跳跃、鼠标追踪或下载进度。#36 保留，发行验收另行决定，GitHub 由来源伙伴维护。
