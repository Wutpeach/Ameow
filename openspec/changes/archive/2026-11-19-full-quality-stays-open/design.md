# Design

## Context

见 proposal.md。共享的 Menu::saved 在成功时关闭菜单，poll_downloads 还依据其返回值调用 close_menu 释放锁。画质选中态原本即由 DownloadUi 的确认设置驱动，无需新增状态。

## Goals / Non-Goals

**Goals:** 成功回执只更新提示和已确认画质，保留菜单与锁。

**Non-Goals:** 不改设置权威、原键盘导航、点击外部语义或 Mac NSMenu。

## Decisions

移除成功回执的两层关闭路径；Menu::saved 继续以 generation 隔离旧会话，成功清除 hint，失败沿原提示。保留 settings_pending 的禁用机制，选中背景仍使用现有 settings()/ui_motion。相比在成功后重新打开菜单，这不会重播进入、重置导航或短暂释放菜单锁。

## Risks / Trade-offs

- 保留菜单使保存完成后的空闲 Full 继续受菜单锁保护 → 用回执、Esc 和重开场景验证正常释放。
- Mac 锁屏时不能证明真实点击和 Command+V 手势 → 平台编译、隔离原生机制检查与用户可见验收分别记录。
