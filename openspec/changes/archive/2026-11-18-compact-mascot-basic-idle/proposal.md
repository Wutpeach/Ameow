# Proposal

## Why

用户希望先体验猫咪眨眼等基础生命感，再决定后续调参与发行选择（Wutpeach/Ameow #25，父项 #37）。第一轮基础动作已获用户认可；后续明确要求先修正 Figma 指定 Compact 源稿，再将 Light 黑猫、Night 白猫接入应用。用户比较三种沿口草案后选择 A 圆润小窗沿继续落地供看效果，修正版后续已随 f520 双端动作及本轮窗口、启动范围获用户验收。

## What Changes

- 以 Figma「Ameow Icon Design / Compact · Placeholder」5:278、5:279 的分层矢量接入 60px 猫咪；Light 使用 Page 1 / 3:155「Ameow · B · 雾白黑猫」的实际分层配色，Night 沿用白猫。窗口背景使用应用现有主题色。
- 增加低频自然眨眼、眼先头后的轻观察、偶发错时耳动，保持爪子与前景稳定。
- 不可见或 Full 活跃时暂停 Mascot 刷新，减少动态时呈现静止待机；不延迟现有展开/收起。
- 维护原生预览场景，提供 Windows 可启动应用和真实动效证据。
- 本次有界修正先改指定 Figma 源组件并核对截图，再导出应用素材；保留已认可的节奏、构图及第一轮交付。
- 前景采用已展示的 A 圆润小窗沿：克制的圆弧厚度、上缘柔和高光和爪下浅接触阴影。先更新正式 Figma 5:276/5:277 及其指定实例，再导出接入应用；保留 B/C 独立草案。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`：增加 Compact 基础猫咪的姿态、可见性与交互边界。

## Impact

局部 Mascot 绘制/行为模块、main 的展示与唤醒接入、预览目录；不引入运行时依赖，不重构窗口/下载/平台层。不开发探头、舔爪、跳跃、鼠标追踪或下载进度。#36 保留，发行验收另行决定，GitHub 由来源伙伴维护。
