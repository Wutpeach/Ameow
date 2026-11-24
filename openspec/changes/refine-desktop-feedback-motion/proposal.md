# Proposal

## Why

下载和目录保存成功反馈到期时撤下偏突然，Compact 的现有耳动与观察偏头在 60px 下不易辨认。根据用户确认的 #85/#86 范围，试做克制的成功淡出与局部姿态调整，交本人试用后决定效果。

## What Changes

- 成功反馈保留约 1500ms，再做 180ms 纯透明度退场，随后衔接原窗口收起；目录悬浮取消保留现有退出。
- 新下载、新反馈即时替换旧反馈，不等待淡出；减少动态直接正确终态，旧时钟不清新状态。
- 仅调整现有耳动与观察偏头，使单侧耳旋转、错时、轻微倾斜与短停回正在实际 60px 可辨；保留原低频、眨眼、抓沿入场与窗口形变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-interaction`: 成功反馈的退场顺序、替换边界及现有 Compact 耳动/观察的辨识度。

## Impact

局部 Model、Full 状态槽、现有 Mascot 动作、Gallery、定向测试及设计参考。无设置、应用更新、扩展源码或下载 ACK 语义改动；最终主规范 sync/archive 由 main 整合者处理，产品效果待本人审阅。
