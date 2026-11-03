---
version: 1
slug: "ameow-next-src-download-ui-rs"
primary_target: "ameow-next/src/download_ui.rs"
related_targets: ["ameow-next/src/queue_presentation.rs", "ameow-next/src/queue_fixture.rs"]
---

# 下载队列

## Mode

Operate

## Scope and evidence

2026-11-03 从队列组件与 presentation 源码提取。download_ui.rs 是共享文件：此 brief 聚焦 queue_panel、队列行、操作与投影；主状态、菜单、退出确认和组件指示器仍需核对各自调用处。不要将队列专用尺寸推广到整份文件。

## User and success

用户在小浮窗中识别正在执行与等待的任务、读出真实阶段及进度，并对特定任务采取当前允许的操作。标题、短提示和动作不能破坏紧凑扫描与进度连续性。

## Current composition

- 行高 56、内容宽 180。第二行固定为 122 进度轨道 + 4 间隔 + 54 右齐状态。
- 标题 10/14 Medium，第二行状态 8/14；图标槽 24×24、间隔 2。保留既有两行组织和截断／悬停浏览。
- 主题色、阶段色、禁用和焦点反馈复用当前 Palette 与 GPUI 组件。

## Behavior and boundaries

队列 snapshot、命令回执、FIFO 与 slot ownership 保持后端权威。Presentation 的前台选择、终态保留与行消退不能改写任务历史。动作悬停说明优先于真实键盘焦点说明，离开后恢复实时状态；显示说明时进度轨道仍更新。失效或 pending 的动作不能因焦点／悬停重新开放。

## Verification when this surface changes

检查空队列、多行滚动、长标题、中英文、浅深主题、下载／转码／等待／失败／取消／完成、动作可用性、键盘与鼠标提示切换、进度连续更新及 reduced motion。Fixture 明确是演示数据，不能当作真实下载成功证据。
