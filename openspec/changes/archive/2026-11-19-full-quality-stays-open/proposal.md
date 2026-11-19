# Proposal

## Why

用户要求 Full 自绘菜单在切换画质后保持打开，以便连续调整和确认选中值。现有保存成功回执会关闭菜单；2026-11-19 的明确决定替代该行为。

## What Changes

- Mac、Windows 的 Full 自绘菜单保存画质成功后保留菜单和菜单锁，清除保存提示。
- 继续只展示 owner 已确认值，保存期间禁用画质，失败保留原值并允许重试。
- 保留 Esc、关闭、设置、隐藏、退出以及原有窗口外部交互语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`: 明确 Full 画质选择后的菜单保留和回执行为。

## Impact

涉及 context_menu.rs 的回执、download_ui.rs 的关闭调用和相关回归用例，无新增依赖。Mac 系统 NSMenu 不变。同 PR 的 Mac 键盘粘贴修复恢复 macos-native 既有 Command+V 合同，不新增规范变更。
