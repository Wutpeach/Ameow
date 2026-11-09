# #32 磁吸参考对照与当前体验验收

日期：2026-11-09。受测源码为 Component 阶段本地提交 `d2ea40f3bd7424be7ba57e1779281db5385f455b`。

## 阶段结论

用户在官方 Magnetic Nested 演示及当前 Ameow 的真实操作后反馈：“比之前流畅很多了，感觉可以了”。本轮当前版本的整体手感获得用户认可；**没有修改磁吸算法、参数、窗口运动曲线、GPUI 帧率限制或原生边界，不将该反馈称为本轮性能修复或升级收益证明。**

用户进一步明确：“我们不需要让内部的文字也跟着一起动”。按其在 Nested 内外层对照语境中的新指示，保留 Ameow 单个整体视觉组，不新增内部文字的独立磁吸位移。Nested 用作整体跟随、弹簧滞后、连续运动和自然回弹的参考。

记录仍发现开始收起时磁吸偏移直接归零的既有数值断点，详见下文。本轮不额外改变用户刚认可的手感；该项保留给网页侧评审，不能标为已修复。

## 参考与实现差异

- [官方演示](https://motion-primitives.com/docs/magnetic)明确定位到 Magnetic Nested，实际浏览器运行并由用户操作；不是 Basic。
- [Nested 源码](https://github.com/ibelick/motion-primitives/blob/main/app/docs/magnetic/magnetic-nested.tsx)的外层 0.2、内层 0.1、range 200、bounce 0.1；实际页面观测到外层与内部文字各有 transform。示例使用全局页面鼠标和变换后的元素中心。
- 历史 `git show 79ed2f48:ameow-next/README.md` 明确记录 Ameow B 是单外层适配：固定 rest centre，强度 0.12，最大 6px，原生 HWND 内才有跟随资格，独立解析弹簧，并用已接受的晚展开 fade。不是完整 Nested。
- Ameow 保留单个 Surface/content/border/shadow 视觉组；原生 228px Full、点击边界、anchor、Compact↔Full、Reduced Motion 继续由原有路径管理。根据用户最新反馈，不追求 Web 全局范围或独立文字层的完整复制。

## 实际证据

用户明确同意本轮范围后，仅进行两次局部录制：官方参考 45 秒、Ameow 75 秒。Ameow 用户路径包含移入展开、慢扫边、边缘内外来回、快速反向和移出。受测 EXE 冻结在 `D:/Ameow-gpui-kit/evidence/issue32/magnetic-nested/before.exe`，SHA-256 `0b1d0bab3fd28f5f546b2865ca4cf9341cafbe190e51bae588316ad13306f58a`。

- [14 秒官方 Nested 实际演示](magnetic-nested/reference-nested.mp4)：原记录 30–44 秒，仅裁剪按钮附近 224×160 区域。
- [14 秒当前 Ameow 实际操作](magnetic-nested/ameow-accepted.mp4)：原记录 41–55 秒，320×320 局部区域。
- 两段由不同人工鼠标路径产生，只比较视觉手感，不作为同路径性能基准，也不是修复前后对比。完整原片在 `evidence/issue32/magnetic-nested/`。
- [机器摘要](magnetic-nested/validation.json)：2,424 个应用 Render；932 个 Full 跟随采样的帧间隔中位数 16.6425ms、P95 17.626ms、最大 18.681ms，没有 ≥100ms 的跟随采样间隔。应用 Render 不等于 GPU Present；60fps BitBlt 录像也可能有重复帧。
- 最大磁吸向量 5.8599px，没有达到 6px cap。因此这段观察不支持把卡顿归因于 cap 平台，但不排除其他输入触发。
- Win32 请求 1,281 次，全部应用，无请求/实际矩形不一致；最大排队 3.936ms、调用 5.86ms。其中 1,143 次请求矩形未变。这是原实现的重复工作，不证明用户体验问题，也未擅自改变窗口 flags/置顶/焦点行为。
- 录像与用户反馈支持本轮整体手感可接受。没有本轮迁移前 EXE 的同环境比较，不能证明 GPUI 升级或 Component 接入导致更流畅。
- 观察宿主及录制均退出码 0，测试窗口已消失。原始来源、参数、DPI、采样限制、完整退出结果保存在机器摘要及 `manual-before/`。

## 已确认断点与未验证项

`src/magnetic_spring.rs` 在 `full_intent=false` 时直接清空 spring 和 offset。实际 44.166s 的偏移为 `[-4.5802565,-3.4079907]`，17ms 后 Full 意图切为 false 时偏移归零，当时 fullness 仍为 1；向量约 5.709px。随后窗口正常收缩。该数据确认磁吸偏移的硬清零，而不是窗口展开模型积分丢失，也不需要用 GPUI 或 Windows 失帧来解释该数值变化。是否对用户构成不可接受的视觉问题，仍由最终视觉验收决定。

原生窗口内外边界还会把跟随 target 切零，但正常 spring retarget 保留位置与速度；它与上述直接清空是不同机制。分析没有据此调参或扩大感应/点击范围。

本轮前台窗口记录始终未把 Ameow 记为 foreground，因此没有取得激活前后对比，不写 PASS。用户认可当前手感后未再启动额外桌面测试；拖动、菜单、Reduced Motion 与 Compact↔Full 的未受影响部分复用上一阶段 `19809a1a` 的定向证据，本阶段未称重新全量验收。混合 DPI、跨屏、启动项和自动更新联合回归继续保留。

若网页侧要求进一步消除上述偏移断点，建议只让磁吸在收起开始时继续回零并由原有 fade 退出；先加连续性回归，再用同一路径短复验。不要更改已接受的展开曲线、原生边界或新增文字层。该建议尚未实施或获本轮新的视觉验收。

## 交接

Component 结果见 [独立阶段报告](component-stage-report.md)和 [GitHub 阶段评论](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6735089361)。本阶段追加证据与结论后停止等待网页侧分别验收；不整合 main、不 Push/发布、不清理 Worktree、不关闭 #32。
