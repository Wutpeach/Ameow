# Proposal

## Why

用户实际体验带动画功能包后，反馈反向退场有残留且不如直接消失，入场也偏拖沓，选择Full目标同帧隐藏。后续还指出台面和猫的可见入场仍像先后两段，要求台面先出现、猫仅稍后露头，而且露头时台面仍明显上浮；不能只以数学通道重叠判断衔接。

## What Changes

- Full目标同帧隐藏猫、台面及爪子，清除入场进度、等待与角色唤醒；再次收起在末段重新开始一次入场。
- 保留窗口先完成主要收起、台面先起、猫紧随的层次；按真实遮挡后可见像素提前露头，两者上浮显著重叠，最终回到已认可姿态并衔接既有idle。
- 同步现有Gallery场景描述、状态/像素回归与正式合成器离线快节奏预览；Reduced Motion沿用正确终态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：更新Compact猫咪末段入场、Full即时隐藏、可见性及idle衔接约定。

## Impact

以b1735e9f为父局部修正头部曲线，同一feature分支供既有整合者接PR41。用户已验收的5143窗口宏观弹性/几何mask、c7 Prepared素材接口、主题/资产/idle及即时隐藏保持。复用merry-colden开发目录和target缓存，用普通cargo run查看；离线预览直接编码至固定路径，不生成新EXE副本、ZIP、重复target或大BGRA归档。不新增依赖、高级动作或写入者，不自动合并或发行。
