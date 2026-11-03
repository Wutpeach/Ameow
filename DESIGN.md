---
name: Ameow Next
description: Native desktop-edge download controls built with Rust and GPUI.
colors:
  night-surface: "#232427"
  night-neutral: "#A5A8AD"
  night-border: "#2E3033"
  night-badge: "#2B2C2F"
  night-blue: "#3D9AFF"
  night-orange: "#F68F3C"
  night-green: "#3CBB72"
  night-red: "#EE5C61"
  light-surface: "#FFFFFF"
  light-neutral: "#62656B"
  light-border: "#ECEDEF"
  light-badge: "#F2F2F3"
  light-blue: "#0285FF"
  light-orange: "#EF720D"
  light-green: "#199A4D"
  light-red: "#E3474C"
typography:
  floating-progress:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, PingFang SC, monospace"
    fontSize: "14px"
    fontWeight: 500
  floating-count:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, PingFang SC, monospace"
    fontSize: "12px"
    fontWeight: 500
  queue-title:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, PingFang SC, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: "14px"
  queue-status:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, PingFang SC, monospace"
    fontSize: "8px"
    fontWeight: 400
    lineHeight: "14px"
  settings-title:
    fontFamily: "Segoe UI, Helvetica Neue, Microsoft YaHei UI, PingFang SC, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: "24px"
  settings-body:
    fontFamily: "Segoe UI, Helvetica Neue, Microsoft YaHei UI, PingFang SC, sans-serif"
    fontSize: "13px"
    lineHeight: "20px"
  settings-control:
    fontFamily: "Segoe UI, Helvetica Neue, Microsoft YaHei UI, PingFang SC, sans-serif"
    fontSize: "13px"
  settings-hint:
    fontFamily: "Segoe UI, Helvetica Neue, Microsoft YaHei UI, PingFang SC, sans-serif"
    fontSize: "12px"
    lineHeight: "20px"
rounded:
  floating-compact: "30px"
  floating-full: "20px"
  control: "6px"
  panel: "8px"
  toggle: "9px"
  toggle-knob: "6px"
  queue-action: "4px"
spacing:
  small: "4px"
  medium: "8px"
  row-gap: "12px"
  settings-inset: "24px"
components:
  settings-button-light:
    backgroundColor: "{colors.light-surface}"
    typography: "{typography.settings-control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  settings-button-night:
    backgroundColor: "{colors.night-surface}"
    typography: "{typography.settings-control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  settings-navigation-selected-light:
    backgroundColor: "{colors.light-border}"
    typography: "{typography.settings-control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  toggle-on-light:
    backgroundColor: "{colors.light-blue}"
    rounded: "{rounded.toggle}"
    padding: "3px"
    width: "32px"
    height: "18px"
  floating-surface-light:
    backgroundColor: "{colors.light-surface}"
    rounded: "{rounded.floating-full}"
    size: "200px"
  floating-surface-night:
    backgroundColor: "{colors.night-surface}"
    rounded: "{rounded.floating-full}"
    size: "200px"
---

# Design System: Ameow Next

## Overview

**Creative North Star: "桌面边缘控制台"**

保留既有比喻：Ameow 是贴在桌面边缘、随时可用的紧凑控制台。它让用户查看任务、处理队列和调整设置，同时继续手头的桌面工作。当前语言是安静的中性实色表面、明确的状态色、细边界和受控的短动效。

本文件于 2026-11-03 从当前 Rust / GPUI 源码增量提取，适用于 `ameow-next/`。根目录 Electron 与网站不属于此规范的实现对象。旧版文档保存在 `.impeccable/archive/electron-2026-05-23/`。这是已实现规则的记录，不是重新设计或新的产品验收。

**Key Characteristics:**

- 主浮窗承载紧凑状态；偏好和详细诊断进入独立设置窗口。
- 颜色以 `tokens::Palette` 为来源，状态语义贯穿进度环、标签和队列。
- 主浮窗使用等宽拉丁字体，设置与托盘以系统 UI 字体为主。
- 实色填充、轻边界和现有阴影形成层次，不恢复 Electron 渐层配方。
- 界面投影真实队列状态；动效和标签不能制造成功、完成率或可用操作。

**Evidence boundary:** 已核对 `tokens.rs`、`model.rs`、`main.rs`、`indicator.rs`、`download_ui.rs`、`settings_window.rs` 和 `settings_components.rs`。本次未重新运行原生视觉验收；源码存在不等于各主题、DPI、语言和交互状态均已验收。

## Colors

### Primary

下载蓝对应 `Palette.blue`：下载进度、交互焦点和启用开关等明确语义。浅深主题分别使用前置 token 中的 `light-blue` 与 `night-blue`。不要沿用 Electron 的旧蓝色值。

### Secondary

转码橙对应 `Palette.orange`；失败红对应 `Palette.red`。错误与等待应清楚可辨，同时保留具体状态文字。

### Tertiary

完成绿对应 `Palette.green`，`Palette.semantic(Stage::Success)` 明确返回绿色。旧规范“桌面成功态保持灰色”不再适用于 Next。

### Neutral

`surface` 是主表面与设置背景，`neutral` 是状态和辅助内容，`border` 是分隔与边界，`badge` 是标签和局部容器底色。主文字、禁用文字及控件边框由 `primary_text()`、`disabled_text()`、`control_border()` 派生，不用旧 `ThemeColors` 值替代。

**The State-Color Rule.** 下载、转码、完成、失败分别使用实现中的蓝、橙、绿、红。Idle、Resolving、Cancelled 的环采用中性语义，不能将所有状态涂成蓝色。

**The Native-Token Rule.** 新的 Next 表面先复用 Rust Palette 和现有 GPUI 样式。本文的 YAML 是提取快照，修改实现后同步更新；不要反过来把快照当作另一套运行时 token。

## Typography

**Display Font:** none

**Body Font:** 主浮窗为 JetBrains Mono；中文按平台回退到 Microsoft YaHei UI 或 PingFang SC。设置和托盘默认使用 `desktop_ui_font()`，即 Windows 上的 Segoe UI、其他分支的 Helvetica Neue，并配置中文回退。

**Label/Mono Font:** `ui_font()` 与捆绑的 JetBrains Mono 用于主浮窗及部分路径、版本、诊断内容。设置不是所有文字都强制改为同一字体。

### Hierarchy

- 主进度、计数、队列标题与微型状态使用前置 `floating-*` 和 `queue-*` 角色。
- 设置标题、正文、按钮与说明使用 `settings-*` 角色。当前设置页标题是 Medium，而非旧文档的 700 字重。
- 主浮窗标签、路径和队列标题保留现有截断及浏览行为；短状态与操作提示不能挤占进度轨道。

前置 fontFamily 列表是可移植描述；原生实际选择由 `ui_font()` 和 `desktop_ui_font()` 的平台分支决定，不是浏览器 CSS 的执行结果。

## Layout

主表面的两个端点来自 `Geometry::at()`：Compact 可见面 60×60，外部留白每侧 10，原生窗口 80×80；Full 可见面 200×200，外部留白每侧 14，原生窗口 228×228。不要把可见面与含阴影留白的窗口边界混为一谈。

主状态槽为 96×99；主进度环画布为 50×50。浮窗内队列和菜单保持现有空间关系。队列行高 56，内容宽 180；第二行固定为 122 进度轨道 + 4 间隔 + 54 右齐状态。悬停或键盘焦点说明复用状态区域，进度继续更新。

设置采用侧边导航与可滚动内容区；内容区左右留白引用 `settings-inset`，行间距与局部留白复用现有实现。页面标题、说明和控件不能套入主浮窗的微型文字尺度。

设置细节优化沿用既有视觉方向：简单设置行最小高度 56，常规与关于页通过间距组织内容；组件分组保留必要分隔，异常诊断优先于版本详情。键盘切换焦点时将目标带入可视区，溢出内容提供滚动位置提示。浅色设置错误正文使用局部 `#B8323C`，不替换 Palette 的图形状态红。

常规、下载与关于页省略重复副标题；启动项反馈直接位于开关所在行下方，与其他偏好留出 12 间距。下载位置行右侧集中“打开”和“更改”操作，两者均复用标准按钮，间距 8，高度 32、左右留白 12、圆角 6；路径与复制图标直接显示；关于页版本号使用普通右对齐数据文本。

这些是原生逻辑像素几何，不是网页断点。DPI 缩放、实际窗口边界和文字裁剪需要在原生窗口核对，不虚构手机响应式布局或网页路由。

## Elevation & Depth

Next 以实色面、细边界和局部 tonal layer 组织层次。主浮窗保留现有原生阴影；不继承 Electron 三层 CSS 阴影、默认渐层或 `superellipse(1.5)` 实现要求。

### Shadow Vocabulary

- 主浮窗：`main.rs` 的 `paint_shadows` 配方随几何插值。Compact 到 Full 的 blur 为 3→5，纵向 offset 为 1→2，spread 为 0；夜间 alpha 为 0.1728→0.24，浅色为 0.0612→0.085。几何与阴影各自遵循现有运动路径。
- 进度环光晕：`RING_GLOW_OPACITY` 为 0.3，blur 通常为 4，Failure 为 10。它属于进度状态反馈，不能因为不保留外壳 hover glow 而一并删除。
- 主状态动作 hover：取消／诊断动作保留代码中的红色局部反馈及阴影；这不是整个窗口的 glow 规则。

不要把历史反馈中的 glow 要求推广到所有表面，也不要为了“统一”而新增 Full 或 Badge 外壳光晕。该文档只记录已存在的状态反馈。

## Shapes

Compact 主表面为圆形端点，Full 为圆角方形端点；半径引用 `floating-compact` 与 `floating-full`。GPUI 的圆角填充与边框合并绘制，以保留当前边缘覆盖和抗锯齿行为。

设置控件和导航使用 `control`，局部面板使用 `panel`。开关、滑块与队列动作分别使用前置同名角色；不要把旧版统一 10px 字段或 16px 窗口圆角套回 Next。

## Components

### Floating Surface and Progress

主面保持静态表面、细描边与现有阴影。进度环、百分比、状态 pill、任务计数和动作由真实任务投影决定。状态 pill 按阶段使用 `Palette.pill()`；主进度环不是旧版 48px CSS SVG 组件。

Full 底部不显示全局临时提示文字；目录保存、加入队列、复制结果等不额外占用主浮窗底部。相关队列行、设置页、组件弹窗与退出确认保留各自反馈，不新增替代 toast。

主状态保留 220ms 进度插值；终态保留时长按现有策略执行。窗口采用当前 Converged 运动实现，不能用旧 Electron 的 spring 参数替换。Reduced motion 分支保留，不能用装饰动画遮住信息。

### Settings Buttons and Fields

现有设置按钮默认 32 高、左右 12 留白、细边框、系统字体；Quiet、Icon、Select 是实现中的变体。默认填充来自 surface，文字来自 `primary_text()`。Hover 使用 badge，键盘焦点边框使用 blue，禁用文字与行为按实现处理。不要将其重新解释成默认蓝色渐层主按钮。

Select 变体高 28、左右留白 10、宽 144，字号保持 13；常规动作按钮继续高 32。下拉菜单圆角 6、外侧留白 4，选项高 28、左右留白 6；选中标记使用 8×8 的原生路径。

### Toggles

32×18 轨道、12×12 滑块、轨道内边距 3；外层透明点击区域保留 40×32，键盘焦点边框绘于外层。选中使用 blue，未选中使用 `control_border()`，滑块使用 surface。禁用态同时影响透明度与可交互性，不能仅改变外观。

### Navigation and Menus

设置导航项高 36，选中使用 border 底色，未选中为透明；hover 和键盘焦点保持各自语义。选择器和主浮窗内菜单沿用现有方向键、Enter/Space、Escape 与焦点行为。拖动区域须与可聚焦交互区域分开。

设置侧栏宽 144，导航内左右留白 8；文字左侧为 14px Lucide 图标、间距 8。主浮窗右键菜单的隐藏与设置分别使用 Lucide eye-off、settings，16px 呈现；SVG 与原有线条使用相近的 1.2px 描边。

### Queue Rows

行内动作采用现有 24×24 图标槽和 2 间隔，第二行遵守固定轨道布局。状态和可用操作由 snapshot、阶段及 pending 状态决定；悬停说明优先于键盘焦点说明，离开后恢复实时状态。不要为文案长度改变轨道宽度。

### Component Status and Recovery

设置中的组件状态、版本、检查、更新、恢复、确认与诊断使用当前行和局部面板。待处理操作保持禁用及明确反馈；清理未确认时不能显示虚假的可重试状态。失败或恢复提示按实际语义使用 red 或 neutral，不能只依赖颜色解释问题。

面向用户的文案优先使用通俗状态、原因及必要下一步；HTTP 状态码、内部阶段与工程细节保留在诊断信息，不常驻界面正文。主浮窗的组件准备弹窗保留“组件名＋状态”标题和一条简短原因／提示，删除复述操作按钮的通用建议；不同网络、文件、权限、存储及取消原因仍准确区分。等待清理或停止异常的限制优先于旧失败原因，准备完成前不提前显示就绪。

日常页面直接呈现当前组件版本或不可用状态；yt-dlp 右侧的版本值与下拉箭头共同组成点击入口。版本来源、选择方式、检查更新及检查结果与时间放入右对齐的原生浮层，内容与操作之间使用一条细分割线；组件用途及更新检查错误类别可悬停查看。更新进度、准备失败原因、恢复操作与更新确认继续直接显示；空闲时不常驻更新内部流程说明。

异常标题、原因与恢复操作组合为单个中性状态区，错误图标保留语义色；底部操作右对齐，次级“复制诊断”在前、“重试”在最右侧。版本浮层宽 272、最大高度 320、圆角 8，使用 surface、细边界与有纵向偏移的柔和阴影；内容以已验证版本号和中性描边的“推荐版本／自选版本”badge 为主、来源为次，不使用固定标签列。无已验证版本时仅显示选择策略，不暗示组件已可用；保留版本与目标版本有真实值时另行显示。支持 Enter/Space 打开、Tab/方向键进入操作、Escape 关闭并返回入口；点击外部、焦点移出、滚动主内容或切换页面时关闭。下载路径的完整值提示只绑定文字区域，右侧独立复制图标按钮保留 32×32 点击区与键盘焦点。

sidecar 的 HTML/CSS 仅是上述原生组件在设计面板中的示意翻译，必须标明这一点，不能当成 GPUI 实际渲染证据。

## Do's and Don'ts

### Do:

- **Do** 从当前 Rust Palette、字体函数、Geometry 和具体组件中取值。
- **Do** 分别核对浅深主题、中英文、DPI、键盘焦点和 reduced motion。
- **Do** 保持主浮窗、队列与设置的字号和密度职责区别。
- **Do** 保留真实状态、固定队列轨道、现有环光晕和原生边缘行为。
- **Do** 将表面使用场景与验证清单放入各自 surface brief。

### Don't:

- **Don't** 把 Electron 的 ThemeColors、Neon 前缀、CSS variables、渐层或圆角工厂当成 Next 的要求。
- **Don't** 用系统字体覆盖主浮窗的 JetBrains Mono，或用灰色覆盖完成绿。
- **Don't** 为追求截图一致而改变任务真值、阶段、可用操作或持久化边界。
- **Don't** 将 sidecar 预览、源码检查或 Web detector 结果宣称为原生视觉验收。
- **Don't** 在文档维护中增加新视觉方向、动画、产品能力或未经验证的平台承诺。
