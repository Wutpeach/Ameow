# Proposal

## Why

用户已批准基础 Mascot 的探头入场和同轨迹反向加速退场。当前只随 fullness 淡入淡出，无法呈现台面先上浮、猫从后方探出的节奏，快速展开时也缺少角色自身的连续退场。

## What Changes

- 增加可中断、可反向的局部入退场，最终回到已认可的猫咪和 A 窗沿姿态，并衔接既有 idle。
- 角色局部动作与窗口形变分离；退场保持小尺寸，避免随 Full 放大漂移，不延迟任何交互。
- 增加准确代表入退场的 Gallery 入口和真实渲染器离线节奏预览，覆盖 Reduced Motion 与隐藏休止。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`：增加 Compact Mascot 入退场与可见性、连续反向、基础 idle 衔接约定。

## Impact

新增小型角色时间线与必要分层；接入现有 mascot、主窗口采样和 preview 场景。依赖共享绘制底座的独立稳定化修复，不更改窗口、磁吸或 hover 权威，不新增依赖，不扩大至舔爪、坐立或行走。独立分支与提交，未授权主线合并或发行。
