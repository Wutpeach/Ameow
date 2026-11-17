# Design

## Context

动机见proposal.md。当前局部父提交为c1f2ff68；f520角色双端验收保持，Mac启动窗口稳定、内部入场已获用户正面确认。本轮仅修Windows隐藏bootstrap Rect引入的可达短暂Full输入；旧日志已记录该原有缺陷，但不冒充用户本次c1现场复现。

## Goals / Non-Goals

**Goals:** Windows首个有效native Rect实际apply/show完成前，不因隐藏临时大Rect产生pointer/Full目标；完成后真实hover立即正常。角色冷启动及Mac路径不变。

**Non-Goals:** 不改角色/窗口曲线、Model/fullness/anchor、native apply/show操作、Converged/B参数、全局mask、Prepared、资产、idle或Mac实现；仅修Windows pointer边界及root事件取样。不加固定sleep、禁用交互、依赖或新引擎，不运行自动GUI/点击录像/Gallery矩阵。

## Decisions

- 角色入场初值由720ms收紧为约480ms。具体时长是本轮开发样例，不写为用户固定要求；无反向或淡出时间线。
- 保持真实fullness<=0.04的末段触发初值与一次锁存，窗口先完成主要收起，不提前抢跑，不要求弹簧完全静止。
- 普通Prototype::new仅一次选择Reveal::startup()（progress=0、last=None、latched=false）；fixture继续Default静态姿态。复用现有sample：不可见先清时钟并返回，首次可见Compact以当前fullness=0锁存且首帧仍0，下一可见帧才推进。同一实例设置刷新/恢复不调用startup，隐藏暂停接续原进度。
- 普通启动已有Compact窗口，不改变Model或native几何，不合成Full收起行程。Full目标在sample首分支清空，随后真实收起沿原门槛；Reduced直接到Compact静止/Full隐藏，无额外帧。
- Windows GPUI以CW_USEDEFAULT创建HWND；show:false仅存初始placement，在应用自己的首个atomic apply/show前不能信任该Rect的命中。使用现有NativeResearch.last_applied记录作为完成边界：它仅在apply_window_bounds（含show）成功返回后写入；Native.last/latest只是已排队，不作完成证明。
- advance和Windows root.on_hover都用Native::inside()；初次完成前返回未命中，完成后读取当前系统cursor/Rect，忽略可能延迟的旧toolkit hover布尔值。Mac分支保留原行为。无需新生命周期字段或等待角色动画。
- 原可选native_startup日志补实际bounds/cursor/scale/pointer_ready，结合现有measure中的target/fullness/native请求、实际Rect/viewport及hover状态，可供一次用户正常启动对齐。未自动采集新GUI证据。
- 台面仍0–145ms上浮。两爪12–88ms从沿后伸出，88ms抓牢后保持台面相对零位移；88–128ms短暂承重，此时头部仍完全不可见。128–365ms用快速起力、自然减速的轨迹将头拉起，365–480ms轻落定，最后75ms接idle。数值为开发样例，可见先后以真实合成器像素核验，不以数学通道代替。
- paws_y表示相对台面的伸出距离，抓牢为零；正式局部合成将爪平移及41px接触裁切线一并加上perch_y。头仍在台面后，爪仍在前；不改Prepared类型/缓存或原SVG。拉起过程中两爪与台面共用局部运动，不漂移。
- sample首先处理Full目标：进度归零，时钟与锁存清空，不论可见性或Reduced均无角色唤醒。角色显示仅取零/一，不再随窗口展开透明度保留残影。再次收起只在末段从零启动。
- Compact隐藏暂停当前入场，恢复首帧不追赶墙钟；隐藏期间转Full仍立即清空。Reduced Motion沿用Compact静止姿态/Full隐藏。末段入场完成后恢复已冻结的idle，最后75ms平滑接其姿态。
- 原SVG路径/配色/defs、三层Arc<RenderImage>准备与一次Pixmap转换缓存、原整图休止输出，以及共同底座/AA mask保持c7接口。瞬间隐藏使用alpha=0使最终图像缓存失效，输出与无角色的底座一致；不重解析SVG、不留角色等待。
- Gallery沿用compact.entrance/full.mascot-exit入口，后者描述为Full目标立即隐藏；离线预览使用正式合成器展示快节奏入场和同帧隐藏，明确非原生UI验收。
- 调优复用同一merry-colden开发目录及target，用cargo run --locked --bin ameow直接查看。显式离线导出通过管道编码MP4、更新固定预览路径，不落大BGRA流、不生成新EXE副本/ZIP或重复缓存。

## Risks / Trade-offs

- [角色层或缓存残留] → 对完整待机和中途入场的Full首帧比较无角色底座像素，并验证零进度/无唤醒及再次末段新入场。
- [数学先爪而像素仍先头] → 两主题1×/2×比较正式合成器与同帧去头/去爪像素，验证两爪先于任何可读头部、承重段有爪无头；旧466须被回归拒绝。
- [爪脱离沿口] → 抓牢和拉起期间核对两爪像素重心相对台面的接触漂移，保证爪与裁切线共同跟随台面。离线预览仅看设计，手感由用户实机确认。
- [扩大已验收范围] → 保护5143宏观窗口、mask与素材接口，复用未受影响证据；本轮不新增原生流畅性验收结论。
- [启动闪静态猫或时间被隐藏期吞掉] → 检查新实例初始/首次可见像素与无角色底座相同，隐藏数秒后仍从零计时；只在普通新实例构造时初始化，单实例重复启动在创建Prototype前返回，restore仅复用已有状态。
- [Windows首显输入抢跑] → 用旧记录的隐藏大Rect/无效viewport到80px Compact时序做确定性回归，拒绝未完成或旧Rect输入；核实队列状态不开放pointer、完成后真实命中能正常展开。root接线审查与同一原生命中回归结合；f706实际启动随后已获用户验收，旧记录仍不冒充本次用户现场或唯一根因证明。
