# Proposal

## Why

用户在Mac实际体验后明确纠正466的头先出顺序：应先伸手抓住窗沿，再使劲把头拉出来。共享探头因此改为台面初露、两爪先抓牢并短暂承重、头再上提，最后落定接idle；台面与爪的入场仍紧凑重叠。Full目标同帧隐藏继续保持。

## What Changes

- Full目标同帧隐藏猫、台面及爪子，清除入场进度、等待与角色唤醒；再次收起在末段重新开始一次入场。
- 保留窗口先完成主要收起；末段台面初露、两爪先伸出抓牢，短暂承重后上提头部。真实可见爪先于任何可读头部，抓牢时无头，拉起时爪与台面保持接触；最终回到已认可姿态并衔接既有idle。
- 同步现有Gallery场景描述、状态/像素回归与正式合成器离线快节奏预览；Reduced Motion沿用正确终态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：更新Compact猫咪末段入场、Full即时隐藏、可见性及idle衔接约定。

## Impact

以466242d3为父局部修正角色时间线及爪的台面相对位移/裁切，同一feature分支供既有整合者接PR41并向Mac树交增量。用户已验收的5143窗口宏观弹性/几何mask、c7 Prepared素材接口、主题/原SVG/idle及即时隐藏保持。复用merry-colden开发目录和target缓存，用普通cargo run查看；离线预览直接编码至固定路径，不生成新EXE副本、ZIP、重复target或大BGRA归档。不新增依赖、高级动作或写入者，不自动合并、发行或操作运行中的App。
