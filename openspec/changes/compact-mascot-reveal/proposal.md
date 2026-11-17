# Proposal

## Why

用户已双端人工验收f520的台面初露、两爪抓牢承重、拉头及落定动作，现要求普通新实例初始Compact也播放同一入场。此前启动Reveal直接处于完整静态姿态，需要只补角色初始触发，避免先闪静态猫，也不制造Full→Compact窗口变形。

## What Changes

- Full目标同帧隐藏猫、台面及爪子，清除入场进度、等待与角色唤醒；再次收起在末段重新开始一次入场。
- 保留窗口先完成主要收起；末段台面初露、两爪先伸出抓牢，短暂承重后上提头部。真实可见爪先于任何可读头部，抓牢时无头，拉起时爪与台面保持接触；最终回到已认可姿态并衔接既有idle。
- 同步现有Gallery场景描述、状态/像素回归与正式合成器离线快节奏预览；Reduced Motion沿用正确终态。
- 普通新实例初始角色隐藏，以首次可见sample开始同一入场；隐藏时间不吞动作，单实例再次唤起、设置刷新和恢复可见不重置入场。Full启动隐藏，Reduced沿用正确终态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：更新Compact猫咪末段入场、Full即时隐藏、可见性及idle衔接约定。

## Impact

以f52099cd为父，只给普通Prototype新实例选择隐藏初态的Reveal；已验收曲线/图层/资产/Prepared、5143窗口宏观弹性/几何mask、idle/Reduced和Full即时隐藏均保持。fixture保留原默认姿态，单实例恢复路径不重新创建控制器。同一feature分支供原整合者接PR41及Mac固定树，复用merry-colden/target普通cargo run，不生成包、EXE副本或新target，不自动合并、发行或操作运行中的App。
