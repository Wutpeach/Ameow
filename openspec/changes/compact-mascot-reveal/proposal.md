# Proposal

## Why

用户实际体验带动画功能包后，反馈反向退场有残留且不如直接消失，入场也偏拖沓。最新决定覆盖此前反向加速退场偏好：Full目标同帧隐藏整套角色，保留窗口收起末段才开始的分层探头入场，并收紧其节奏。

## What Changes

- Full目标同帧隐藏猫、台面及爪子，清除入场进度、等待与角色唤醒；再次收起在末段重新开始一次入场。
- 保留窗口先完成主要收起、台面先起、猫后探的层次；压短探头停顿与落定收尾，最终回到已认可姿态并衔接既有idle。
- 同步现有Gallery场景描述、状态/像素回归与正式合成器离线快节奏预览；Reduced Motion沿用正确终态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：更新Compact猫咪末段入场、Full即时隐藏、可见性及idle衔接约定。

## Impact

以c7c7146d为父修正现有入场小状态及显示选择，同一feature分支供既有整合者接PR41。用户已验收的5143窗口宏观弹性/几何mask、Prepared素材接口、主题/资产/idle保持；不新增依赖、不扩展高级动作、不新增写入者。本轮不自动合并或发行。
