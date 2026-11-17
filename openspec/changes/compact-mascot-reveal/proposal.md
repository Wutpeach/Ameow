# Proposal

## Why

用户已双端人工验收f520动作，并在c1f2确认Mac启动保持Compact、内部角色入场。Windows实机反馈为圆窗启动变大再缩回。源码及既有Windows日志证明一个原有缺陷：隐藏的临时大Rect在首个native apply/show完成前被当作指针命中，误发短暂Full目标；该历史证据并非用户本次c1现场。本轮修正Windows首显输入边界，保留已验收角色和Mac启动路径。

## What Changes

- Full目标同帧隐藏猫、台面及爪子，清除入场进度、等待与角色唤醒；再次收起在末段重新开始一次入场。
- 保留窗口先完成主要收起；末段台面初露、两爪先伸出抓牢，短暂承重后上提头部。真实可见爪先于任何可读头部，抓牢时无头，拉起时爪与台面保持接触；最终回到已认可姿态并衔接既有idle。
- 同步现有Gallery场景描述、状态/像素回归与正式合成器离线快节奏预览；Reduced Motion沿用正确终态。
- 普通新实例初始角色隐藏，以首次可见sample开始同一入场；隐藏时间不吞动作，单实例再次唤起、设置刷新和恢复可见不重置入场。Full启动隐藏，Reduced沿用正确终态。
- Windows首次原生Rect实际apply/show完成前不接收隐藏临时几何的pointer命中；完成后立即按当前真实Rect恢复正常hover。root hover与advance复用同一原生命中，避免延迟事件回写旧命中，不改弹性或加固定等待。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：更新Compact猫咪末段入场、Full即时隐藏、可见性及idle衔接约定。

## Impact

以c1f2ff68为父，仅Windows原生pointer首显边界和Windows root hover取样修正，复用已完成apply记录，不新增生命周期字段/锁。Mac代码、window apply/show本身、Model/弹性、统一mask、Reveal/曲线/图层/资产/Prepared、idle/Reduced保持。同一feature分支供原整合者接PR41及Mac固定树，复用现有target，不打包/造副本或自动合并发行。新增被动字段仅写既有可选native日志，新的启动手感仍待用户一次正常启动确认。
