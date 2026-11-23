# Proposal

## Why

#82 已确认将应用更新策略与 Full 提醒分开，现有三个开关和只跳转设置的部分动作无法表达该行为。本次按 2026-11-23 今晚实施授权完成，最终体验仍交用户验收。

## What Changes

- 关于页只保留默认开启的自动更新、更新提醒及始终可见的检查入口，保留实际阶段的手动动作。
- 自动关闭仍检查，仅显式操作下载或安装；提醒只控制 Full 应用更新分支。
- 安装复用真实队列及资源安全门，自动安装增加连续空闲与最近交互的安静窗口。
- 迁移旧偏好时保留任一显式关闭意图，不删除个人配置。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction: 应用更新的双开关、Full 直接操作、旧偏好映射及安全空闲策略。

## Impact

影响 app_update/service.rs、app_update_ui.rs、settings_window.rs 与 Full 最小接线。完整载荷事务、依赖策略、扩展提醒和胶囊 Popup 由其他 owner 负责，不在本次重构范围；不改变发行资产或公开下载链接。
