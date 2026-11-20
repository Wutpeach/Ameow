# Proposal

## Why

用户需要从其他应用用一个可配置组合键呼出或隐藏 Ameow，并能在鼠标未移入浮窗时直接使用既有粘贴操作。当前仅有应用内按键和托盘恢复，不能完成这一流程。

## What Changes

- 常规设置增加小型“快捷键”区，仅一项“呼出／隐藏 Ameow”，默认 Ctrl+Shift+F，支持录入、修改与清空；有组合即启用、清空即关闭，不提供独立开关。
- 仅 Primary GUI 注册普通修饰组合；原生注册与现有设置保存回执协作，冲突和保存失败保留真实状态与旧绑定。
- 隐藏或 Compact 呼出同一 Full 并保持键盘焦点；后台 Full 先聚焦，已持焦点的 Full 再按隐藏。设置窗口与下载生命周期独立。
- Esc／失焦释放键盘保持并回原仲裁；保留 Mac Compact 全屏边界与 PR58 面板焦点模式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`：单一全局呼出动作、常规页配置、原生注册与持久化生命周期。

## Impact

影响窗口 Model、主窗口输入与恢复、设置投影／保存链路、普通设置字段与两平台原生注册适配。复用现有 Windows 和 AppKit 依赖；不引入全局输入 hook、宏、额外服务、其它快捷键动作或页面。候选仅以独立 Draft PR 交付，不修改发行或用户当前配置。
