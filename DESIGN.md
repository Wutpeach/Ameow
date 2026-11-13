---
name: Ameow
description: 安静地呈现下载，以克制的图形、就近的反馈和一致的交互表达状态。
colors:
  blue-light: "#0285ff"
  blue-dark: "#3d9aff"
  orange-light: "#ef720d"
  orange-dark: "#f68f3c"
  green-light: "#199a4d"
  green-dark: "#3cbb72"
  red-light: "#e3474c"
  red-dark: "#ee5c61"
  error-text-light: "#b8323c"
  surface-light: "#ffffff"
  surface-dark: "#232427"
  neutral-light: "#62656b"
  neutral-dark: "#a5a8ad"
  border-light: "#ecedef"
  border-dark: "#2e3033"
  badge-light: "#f2f2f3"
  badge-dark: "#2b2c2f"
  primary-text-light: "hsl(220 4.3902439024% 16%)"
  primary-text-dark: "hsl(217.5 4.6511627907% 90%)"
typography:
  body:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  caption:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  floating:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, monospace"
    fontSize: "12px"
    fontWeight: 400
  queue:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, monospace"
    fontSize: "10px"
    fontWeight: 400
  queue-status:
    fontFamily: "JetBrains Mono, Microsoft YaHei UI, monospace"
    fontSize: "8px"
    fontWeight: 400
    lineHeight: "14px"
rounded:
  icon: "4px"
  control: "6px"
  dropdown: "8px"
  panel: "12px"
  full: "20px"
  compact: "30px"
  circle: "9999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-standard:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.primary-text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-full-info:
    textColor: "{colors.neutral-light}"
    rounded: "{rounded.circle}"
    size: "24px"
  button-popover-icon:
    textColor: "{colors.neutral-light}"
    rounded: "{rounded.icon}"
    size: "24px"
  button-settings-icon:
    textColor: "{colors.neutral-light}"
    rounded: "{rounded.control}"
    size: "32px"
  button-full-close:
    rounded: "{rounded.circle}"
    size: "28px"
  button-state-action:
    rounded: "{rounded.circle}"
    size: "16px"
  chip-queue-summary:
    backgroundColor: "{colors.badge-light}"
    textColor: "{colors.neutral-light}"
    typography: "{typography.queue}"
    rounded: "{rounded.control}"
    padding: "0 6px"
    height: "22px"
  input-path:
    textColor: "{colors.primary-text-light}"
    typography: "{typography.floating}"
    rounded: "{rounded.control}"
    padding: "6px 6px 6px 12px"
  nav-settings:
    textColor: "{colors.neutral-light}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "36px"
  notice-inline:
    textColor: "{colors.neutral-light}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "10px"
---

# Design System: Ameow

## Overview

**Creative North Star: “安静地呈现下载”**

Ameow 的界面用圆环、图标、短标签和稳定的布局呈现下载。操作靠近对象，状态反馈发生在原位；已经由图形、标题或当前值表达的信息，不再堆成副标题、长按钮或说明段落。Compact 只承担收起外观，下载信息集中在 Full；设置与诊断按需提供完整信息。

本文记录截至 2026-11-13 的用户确认边界与现行代码配置。设计边界约束后续修改；具体实现值以 [tokens.rs](src/tokens.rs)、[download_ui.rs](src/download_ui.rs)、[settings_window.rs](src/settings_window.rs) 和对应 owner 为准。发现差异时先查用户最新决定与受影响实现，不能把偶发现象或旧证据中的废弃样式重新立为规则。

**Key Characteristics:**

- 密度紧凑，标题、状态、操作各司其职。
- 按容器选择形状，同类同密度操作保持一致。
- 以中性色承载操作，以语义色区分真实状态。
- 反馈就近、可解释，普通退出与正常准备过程保持安静。
- 普通控件动效克制，保留已验收的 Ameow 磁吸与形变手感。

## Colors

使用 frontmatter 的浅色、深色成对色值；新控件复用 Palette，不能在页面内另造相近色。组件 token 中的浅色引用是文档默认示意，深色实现必须切换到同名 dark 角色。

### Primary

下载蓝用于下载进度及既有主题中的焦点、选择语义。它不是所有图标按钮的常驻强调底色。

### Neutral

surface 承载窗口，badge 提供轻量底色，border 划分边界，neutral 承载辅助文字与普通图标，primary-text 承载正文。正文色由 neutral 保持色相与饱和度、调整亮度得到；浅色错误正文使用 error-text-light，深色使用 red-dark。

橙色表示转码，绿色表示成功，红色表示失败、部分失败及破坏性操作。它们是状态色，不是额外的品牌主色。

**The Neutral Action Rule.** 复制、重试和普通更新操作使用中性处理；关闭、取消、退出按其破坏性语义强调。页面处于失败状态不意味着整页按钮都要染红。真实错误可以使用语义色文字、图标与浅背景。

## Typography

设置与托盘使用系统 UI 字体；Full 浮层和队列保留 JetBrains Mono 与中文回退。Windows 使用 frontmatter 中的字体栈；macOS 代码声明 Helvetica Neue 与 PingFang SC，尚不构成原生验收。

正文使用 body，页标题使用 title，说明与提示条使用 caption。队列分别使用 queue 与 queue-status；这些微型字号只属于既有紧凑队列，不能扩散到设置页或浮窗操作。图标复用 [assets](assets) 中的现有资源，禁止用 emoji 或文本字符冒充图标。

**The Single Message Rule.** 标题表达对象，状态表达事实，按钮表达动作。删除重复解释与“刚刚检查”一类低价值尾注；保留用户做决定所需的真实错误、恢复方式和被截断内容。

## Layout

### 窗口与密度

Compact 可见表面为 60px，圆角取 compact；Full 可见表面为 200px，圆角取 full。外侧 gutter 分别为 10px、14px，对应原生窗口为 80px、228px。表面尺寸、原生窗口边界与按钮点击范围是不同概念，不能互相替代。中间形变由 [model.rs](src/model.rs) 的 Geometry 管理。

设置页沿用原生桌面布局与 spacing 尺度，不凭网页经验添加未经确认的移动端断点。子页返回入口位于标题前或同一标题行，不在标题下另占一行。关于页先呈现更新操作，版本、GitHub、第三方许可置于页尾，明确的动作可用带可访问名称的图标表达。

### 队列

标题只显示“队列”。右上用独立中性浅底信息胶囊表达下载图标与进行中数量、时钟图标与等待数量；仅显示非零项，两者都为零时隐藏。胶囊不是按钮，悬停解释各项含义，不添加光晕。胶囊高 22px、横向内边距 6px、组间距 8px，图标 12px，数字使用 queue 字级。

保留两行共用布局：内容宽 180px，任务行高 56px；第二行由 122px 进度轨道、4px 间隔和右对齐的 54px 状态槽组成。轨道高 3px，状态槽高 14px。悬停操作说明复用第二行状态槽，不能挤动进度轨道；长标题沿用现有延迟浏览行为。

无可见任务时不进入队列，清除最后一个可见任务后关闭队列。不保留独立空队列页面或 Gallery 的 queue.empty 场景；这不删除后端历史记录。

## Elevation & Depth

默认通过表面、浅底色与边界表达层次。通用 icon_hover 只改变底色；GPUI Base 的全局 shadow 保持为空。

**The One Halo Rule.** 只有下载状态环下方的操作按钮保留光晕，包括下载中取消和失败后复制。例外由 state_action_shadow 显式添加：纵向偏移 2.4px，模糊 4.8px，扩散 0，角色色透明度 0.3；取消使用红色，复制使用中性色。

设置、队列、托盘、Full 左下信息入口、Full 内部浮窗、菜单关闭及退出异常操作都只用底色反馈，不添加按钮阴影或光晕。窗口和菜单容器的结构性阴影、状态环自身发光不属于按钮光晕，不随此规则删除。现有设置下拉容器阴影为黑色透明度 0.12、偏移 0/2px、模糊 10px；托盘容器为浅色 0.10／深色 0.20、偏移 0/1px、模糊 8px。

## Shapes

**The Container Shape Rule.** Full 本体上的小图标按钮使用圆形底；Full 内部浮窗、设置页、托盘弹窗中的普通图标按钮使用圆角矩形。不能因为浮窗在 Full 内部就把它的按钮也做成圆形。

标准控件使用 control 圆角，小型浮窗图标按钮使用 icon 圆角，下拉容器使用 dropdown。Full 菜单与退出异常的右上关闭仍是共用的圆形关闭控件。相同用途、相同密度统一尺寸；不同容器与密度不机械共用一个按钮大小。

**The Hit Target Rule.** 点击范围与可见底色分开。Full 右上关闭点击范围 28px，队列 X 点击范围 24px；二者可见圆底均为 18px，图标不随点击范围缩放。保留键盘焦点以及可见底色外、点击范围内的悬停和按压反馈。

## Components

### 按钮与复制反馈

- 标准按钮高 32px、横向内边距 12px、使用 control 圆角和 body 字级；通用图标为 16px。设置图标按钮为 32px，小型浮窗图标按钮为 24px。
- Full 左下信息入口与退出异常左下信息入口共用大小、位置与圆形底色。复制、检查更新、重启更新等明确动作优先图标化，同时保留可访问名称与键盘操作。
- 复制真实成功后在原位切换 check，约 2000ms 后恢复；重复成功重置反馈时间。失败保留可解释原因与恢复入口，不能显示成功勾。Gallery 可以演示反馈，但不写入真实剪贴板。

### Tooltip

**The Anchored Tooltip Rule.** 以控件真实 bounds 为锚，优先在上方、间隔 6px；空间不足时翻转并约束在窗口内，避开指针。复用 [ui_tooltip.rs](src/ui_tooltip.rs)，不能回到跟随鼠标的位置算法。

删除与完整可见文字重复的 tooltip。保留图标名称、错误原因和截断全文；明显的关闭通常不需要 tooltip，但必须保留可访问名称。点击、键盘操作、离开窗口或触发控件消失时清除等待中及已显示的提示，不抢焦点或吞掉操作。

### 提示、诊断与路径框

Full 及其内部菜单不显示底部临时状态小字或 toast，包括“保存失败”。反馈通过原位图标、就近提示或相关入口内的详情表达。普通错误说明可使用浅背景与图标的提示条，并与内容区对齐；提示条采用 notice-inline，图标 14px、间距 8px，错误背景用 red 的浅色 0.07／深色 0.12 透明度，普通背景用 badge 的 0.55 透明度。

组件与诊断页在列表下设置独立诊断区，标题右侧提供唯一的整区复制，归集当前状态、失败原因与恢复方式。正常状态不留下空卡片；局部对象的复制必须让对象清晰可辨，不能重复设置含义不明的诊断复制入口。

路径框最小高 44px，使用 input-path 的内边距和圆角、badge 的 0.55 透明度，正文用 12px 等宽字体，32px 复制按钮嵌入框内。第三方许可正文滚动与滚动条保持同步，复制可嵌入文本框。

### Full 信息浮窗与更新

只有应用更新需要提示时仅显示更新信息；组件确在准备或异常时才同时显示组件信息。更新图标、版本、动作合成一个默认中性的整行按钮，交互底色覆盖整行。准备失败的复制图标为 16px，置于标题行右侧，保留正常按钮尺寸与圆角矩形底，不再缩成夹在标题后的微小图标。

有任务执行时保持常规更新状态；点击更新后由业务层安排任务结束再更新，并提供就近解释，不增设常驻等待状态或二次确认。简化展示不能绕过更新安全门槛。组件升级在版本弹窗内采用图标＋版本＋“升级”的整行操作，外层不重复放升级入口。

### 导航、菜单与托盘

设置导航采用 nav-settings，图标 14px、图文间距 8px；选中与悬停使用局部底色。下拉入口重复点击应收起／展开，组件版本菜单遵守相同行为；退出动画期间控件不能继续操作。

Full 右键菜单保留画质三段、规格悬停入口与右上关闭。退出单独分组，默认中性，悬停再强调。托盘顶部状态优先图标与数量，异常使用图标与短标签；“更新已就绪”与“重启并更新”合为一个图标操作，悬停说明版本与含义。

### 退出异常

普通退出静默安全停止，不闪现确认或退出中提示。只有真实清理异常才呈现恢复界面；具体异常判定、可重试性和退出权威仍由业务 owner 管理。

异常状态使用整个 Full 作为背景，不另画内部卡片底框：左下信息、右上收起、中央状态图形与短标签、下方可用的重试操作，详细原因按需查看。收起、Esc 或查看详情不撤销退出意图；不能强退、无效重试或以简洁为由隐藏真实故障。

### 动效

普通 UI 动效由 [ui_motion.rs](src/ui_motion.rs) 原生适配 motion-primitives 的 Animated Background、Transition Panel、Morphing Popover 行为，用于菜单、选中态、选项卡、开关、托盘和 Full 信息浮窗。它不是 React 运行时依赖，也不要求删除 GPUI Kit 的控件与渲染基础。

通用反馈 150ms、进入 180ms、退出 110ms；标量缓动为 1−(1−t)³，快速反向从当前可见值继续，不重播或越界。减少动态时直接呈现正确终态；休止时不持续请求动画帧。

**The Signature Motion Rule.** 磁吸、Compact／Full 形变与状态环由各自 owner 管理。展开不重新加入弹性；Full→Compact 保留按实际窗口尺寸调过、已验收的克制弹性；保留单层 6px 磁吸和无边缘 glow。普通 UI 调整不能顺带重调这些手感或照搬网页弹簧参数。

## Do's and Don'ts

### Do:

- **Do** 先辨明按钮所属容器，再复用对应形状、密度与反馈；用现有 SVG 和主题角色。
- **Do** 把反馈放在操作附近；错误信息交代原因与恢复路径，图标动作保留可访问名称与键盘访问。
- **Do** 维护受影响的 Gallery 场景，集中到修改完成后验证；尽量不占用用户的鼠标与前台，需要主观点击或手感验收时交给用户。
- **Do** 区分代码配置、工程／原生检查和用户验收。复用未受影响的既有证据，历史报告保留当时结论；本文件和 sidecar 同步维护。

### Don't:

- **Don't** 把所有选中态加光晕，把普通复制或重试染红，或把 Full 内部浮窗的按钮改成圆形。
- **Don't** 让点击范围决定可见圆底大小，把辅助数量挤进队列标题，或让悬停说明挤动轨道。
- **Don't** 恢复底部临时小字、重复说明、含义不明的复制入口、常驻等待更新状态或空队列页面。
- **Don't** 让 tooltip 被鼠标挡住，把读取失败显示成读取中，或用动画掩盖错误和业务安全门槛。
- **Don't** 把文档示意、构建成功或其他平台的配置当作原生视觉通过；Windows x64/MSVC 是当前已验证目标，macOS 仍未验证。

基线依据：本轮用户确认与 [按钮光晕范围收敛](docs/evidence/ui-review/2026-11-13-button-backgrounds.md)、[Tooltip 位置](docs/evidence/ui-review/2026-11-13-tooltip-placement.md)、[队列标题与空状态](docs/evidence/ui-review/2026-11-13-queue-header.md)、[队列关闭圆底](docs/evidence/ui-review/2026-11-13-queue-close-disc.md)。历史报告中的待验收说明保留其时间语境；队列关闭圆底的后续用户验收已通过。队列报告中前台／光标未变化的两项环境检查未通过、原因未确认，不归为全项通过。

[.impeccable/design.json](.impeccable/design.json) 提供格式扩展与组件示意，HTML／CSS 仅用于文档预览，不是产品实现或 GPUI 原生验证证据。颜色梯度若用于文档面板辅助预览，不增加产品可用色。
