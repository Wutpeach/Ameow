---
version: 1
slug: "ameow-next-src-main-rs"
primary_target: "ameow-next/src/main.rs"
related_targets: ["ameow-next/src/model.rs", "ameow-next/src/indicator.rs", "ameow-next/src/repair_motion.rs", "ameow-next/src/edge_hover.rs", "ameow-next/src/ring_glow.rs", "ameow-next/src/download_ui.rs"]
---

# 主浮窗

## Mode

Operate

## Scope and evidence

2026-11-03 从当前 Rust / GPUI 源码提取，沿用根 PRODUCT.md 与 DESIGN.md。该 brief 记录已有表面的使用场景和检查范围，不授权重新设计，也不是新的原生视觉验收。

## User and success

用户在其他桌面应用中工作，借助边缘浮窗快速确认当前任务、查看状态、打开队列或输出目录。成功意味着信息真实、控件可辨，并且浮窗不会抢占主任务。

## Current composition

- Compact 可见面 60×60、原生窗口 80×80；Full 可见面 200×200、原生窗口 228×228。窗口边界包含阴影留白。
- 主状态槽、50×50 环画布、百分比、阶段 pill、状态动作和任务计数采用现有 GPUI 位置与密度。
- 等宽拉丁字体与中文回退、浅深主题及阶段色来自 tokens.rs。完成绿和环光晕是已有实现的一部分。
- Full、Badge 外壳不因本次文档维护新增 hover glow；局部动作与进度环保留其现有反馈。
- Full 底部不显示全局临时提示文字，包括目录保存、加入队列、复制结果、无效输入、加载和停止提示；相关队列行、设置页、组件弹窗与退出确认保留各自反馈，不另增替代 toast。
- 组件准备指示器的弹窗显示通俗的状态标题与一条原因／必要提示，适用于 yt-dlp、Deno、FFmpeg 与通用下载组件。HTTP 状态码、内部失败阶段与底层信息进入复制诊断，不在弹窗正文中拼接；404 解释为未找到组件下载文件，不能泛化为所有获取失败。等待清理与停止异常优先说明暂时不能重试；只有实际就绪才显示就绪。活动下载可显示真实字节与已知总量百分比，未知总量只显示已下载字节；清理或异常时不继续显示残留下载进度。

## Behavior and boundaries

紧凑／展开、拖动、菜单、drop、终态保留和 reduced motion 由现有 model 与 motion 实现控制。状态来自队列投影；界面不得提前宣布完成或制造可用操作。download_ui.rs 同时承载多个表面，修改时需明确主状态、队列、菜单或组件指示器的范围。

## Verification when this surface changes

在原生窗口批量检查 Compact/Full、浅深主题、相关 DPI、中英文、鼠标接近和离开、拖动／菜单锁、下载／转码／成功／失败／取消，以及 reduced motion。确认实际窗口边界、阴影边缘和文字裁剪；源码或 sidecar 预览不能替代这些观察。
