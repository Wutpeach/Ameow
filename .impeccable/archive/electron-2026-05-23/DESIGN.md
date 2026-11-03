---
name: Ameow
description: Compact desktop-edge control surfaces for collecting files, images, and web video.
colors:
  black-bg-primary: "#201E25"
  black-bg-secondary: "#323137"
  black-field-bg: "#2B2A31"
  black-border: "#4B4951"
  black-text-primary: "#EEEEEE"
  black-text-secondary: "#AAAAAA"
  black-accent-text: "#60a5fa"
  black-accent-solid: "#3b82f6"
  black-warning-solid: "#f59e0b"
  black-warning-text: "#fbbf24"
  black-danger-solid: "#ef4444"
  black-danger-text: "#fca5a5"
  white-bg-primary: "#E3E3E3"
  white-bg-secondary: "#F5F5F5"
  white-bg-gradient-end: "#EFEFEF"
  white-field-bg: "#F7F7F8"
  white-field-border: "#D8D8DA"
  white-text-primary: "#333333"
  white-text-secondary: "#666666"
  white-accent-solid: "#2563eb"
  white-warning-solid: "#ea580c"
  white-danger-solid: "#ef4444"
  extension-success: "#34d399"
typography:
  window-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  control:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  compact-label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "14px"
    letterSpacing: "0.08em"
  micro-status:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
rounded:
  window: "16px"
  window-large: "18px"
  context-menu: "8px"
  card: "12px"
  field: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
components:
  button-primary:
    backgroundColor: "{colors.black-accent-solid}"
    textColor: "{colors.white-field-bg}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "8px 14px"
    height: "36px"
  field-surface:
    backgroundColor: "{colors.black-field-bg}"
    textColor: "{colors.black-text-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "36px"
  window-shell:
    backgroundColor: "{colors.black-bg-primary}"
    textColor: "{colors.black-text-primary}"
    rounded: "{rounded.window}"
  compact-label:
    textColor: "{colors.black-text-secondary}"
    typography: "{typography.compact-label}"
---

# Design System: Ameow

## 1. Overview

**Creative North Star: "桌面边缘控制台"**

Ameow 的界面像一个贴在桌面边缘的微型控制台：紧凑、安静、立即响应。它服务的是轻量但高频的桌面收集工作流，用户可能正在浏览网页、整理文件或处理素材，Ameow 不能抢走主任务的注意力。

视觉语言由紧凑浮窗、连续圆角、暗亮双主题渐层、内描边、低扩散阴影、软蓝状态光和短促动效组成。蓝色是状态和焦点，不是装饰。警告和错误必须清楚，但要保持在行内、角标、提示或小型状态面中，禁止变成大面积警示块。

Ameow 是 product register。熟悉感是优点，奇怪的控件不是个性。新增界面必须先匹配现有 `ThemeColors` token、`Neon*` primitives 和 `shared-styles.ts` style factory，再考虑局部扩展。

**Key Characteristics:**

- Compact first: 小窗和 200x200 主面板内的信息必须两秒内可扫读。
- Token led: 颜色从 `ThemeColors` 和 `--fs-*` CSS variables 来，不从组件局部硬编码来。
- Surface consistent: 核心表面来自 `getWindowShellStyle`、`getPanelShellStyle`、`getFieldSurfaceStyle` 等共享工厂。
- Stateful neon: glow 只表达 hover、focus、drag、progress、selected、runtime attention。
- Minimal chrome: 控件默认安静，用户接近或聚焦时才显形。

## 2. Colors

Ameow 使用 restrained 策略：主题中性表面占主导，蓝色、琥珀、红色只承担状态语义。

### Primary

- **Soft Control Blue** (`black-accent-text`, `black-accent-solid`, `white-accent-solid`): 主操作、选中态、焦点边框、进度环、拖拽/边缘 glow。黑色主题使用更亮的 `#60a5fa` 文本蓝和 `#3b82f6` 实心蓝；白色主题使用更稳的 `#2563eb`。

### Secondary

- **Runtime Amber** (`black-warning-solid`, `black-warning-text`, `white-warning-solid`): 运行时依赖、转码、需要人工注意但不是失败的状态。
- **Compact Danger Red** (`black-danger-solid`, `black-danger-text`, `white-danger-solid`): 取消、失败、危险 hover 和错误提示。

### Tertiary

- **Extension Success Green** (`extension-success`): 浏览器扩展复制成功等网页注入场景。桌面主应用当前不把绿色作为强成功语义，`successIcon` 在主应用内保持 muted gray。

### Neutral

- **Black Surface Stack** (`black-bg-primary`, `black-bg-secondary`, `black-field-bg`): 黑色主题的窗口壳、二级表面和字段表面。不是纯黑，带紫灰色温。
- **White Surface Stack** (`white-bg-primary`, `white-bg-secondary`, `white-field-bg`): 白色主题的窗口壳、二级表面和字段表面。不是纯白，保留轻微灰阶和顶部高光。
- **Compact Text Stack** (`*-text-primary`, `*-text-secondary`): 主文本必须高对比，辅助文本用于路径、hint、micro status，不承担主要动作。
- **Border Stack** (`black-border`, `white-field-border`, `accentBorder`, `fieldBorderStrong`): 默认边界安静，active/focus 才进入 accent border。

### Named Rules

**The Blue-Is-State Rule.** 蓝色只用于 active、focus、selected、progress、drag、primary action。禁止把蓝色铺成装饰背景。

**The Theme-Name Rule.** 代码和文档中的主题名是 `black` / `white`。可以解释为 dark/light，但不要新增另一套命名。

**The No Local Color Rule.** 新组件禁止直接写散落的 hex/rgba。先查 `ThemeColors`，再查 `--fs-*`，确实缺 token 才扩展 token。

## 3. Typography

**Display Font:** none  
**Body Font:** system UI stack (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)  
**Label/Mono Font:** no separate mono style in product UI

**Character:** Ameow 的字体系统是操作型，不是品牌型。字号小、权重清楚、行高紧，靠层级和截断保持可扫读。

### Hierarchy

- **Window Title** (700, 15px, 1.25): 设置页、UI Lab、二级窗口标题。不要放大成 marketing heading。
- **Panel Title / Strong Row Text** (600-700, 12-14px, 1.25-1.35): 设置行主标签、队列 badge、状态标题。
- **Control** (500-600, 12-13px, 1.35): 按钮、字段按钮、菜单项、dropdown option。
- **Body / Hint** (400-500, 10-11px, 1.35-1.4): 辅助说明、路径、状态解释。长文本必须截断或限制行数。
- **Compact Label** (600, 10px, 14px, 0.08em uppercase): section label 和结构标签。它是结构，不是强调。
- **Micro Status** (500, 8-10px, 1.2-1.35): 主窗口进度、runtime footer、极小状态文本。

### Named Rules

**The Two-Second Read Rule.** 小窗里的文字必须两秒内能扫完。用短标签、截断路径、两行 clamp，不用段落解释功能。

**The Product Font Rule.** 不引入 display font，不用装饰字体，不让按钮、label、data 使用非系统字体。

## 4. Elevation

Ameow 通过渐层表面、内描边、内高光和低扩散阴影建立深度。默认表面不靠厚重 drop shadow；浮层、dropdown、二级窗口和 active 状态才提高阴影强度。

### Shadow Vocabulary

- **Panel Shadow** (`panelShadow`): 默认窗口和卡片阴影。黑色主题是低扩散三层阴影，白色主题透明度更轻。
- **Compact Shadow** (`panelShadowCompact`): context menu、紧凑浮层和主窗口小型状态的阴影。
- **Strong Shadow** (`panelShadowStrong`): dropdown menu、强浮层、需要盖过内容的临时面板。
- **Shadow Backdrop Layer** (`getShadowBackdropStyle`): 在窗口内容外创建透明 absolute 层承载阴影，避免 `overflow: hidden` 裁剪。
- **Inset Highlight** (`fieldInset`): 所有 field/panel 表面顶部的微弱高光，通常为 `inset 0 1px 0 ...`。

### Named Rules

**The Inset-First Rule.** 控件深度优先用内描边、内高光和 tonal layer。外阴影只用于浮层、hover、active 和窗口外壳。

**The Glow-Is-Feedback Rule.** glow 是反馈，不是背景。edge glow、drag glow、accent glow 必须由用户接近、拖拽、聚焦或任务状态触发。

**The Continuous Corner Rule.** 核心桌面表面使用 `superellipse(1.5)` 和 Electron corner smoothing。不要把新核心表面降级成普通硬圆角。

## 5. Components

所有产品级 UI primitive 使用 `Neon` 前缀。新增组件优先组合现有 primitive；需要表面样式时先调用 `shared-styles.ts` 工厂函数。

### Window Shell

- **Shape:** 连续圆角，默认窗口 16px，UI Lab 可到 18px，context menu 是 8px。
- **Background:** `bgGradientStart` 到 `bgGradientEnd` 的纵向渐层。
- **Border:** 内描边，不做厚重外边框。
- **Shadow:** 二级窗口优先配合 `getShadowBackdropStyle`，避免阴影被裁切。
- **Drag Regions:** header 可使用 `WINDOW_DRAG_REGION_STYLE`；交互控件必须使用 no-drag 区域。

### Field Surfaces

- **Shape:** 10px 连续圆角。
- **Default:** 约 36px 高，`0 12px` padding，字段背景从 `fieldBg` 到 `bgSecondary`。
- **Highlighted:** hover/focus 使用 `borderStart`、`fieldInset` 和文字提亮。
- **Active:** selected/open/recording 使用 accent border、accent surface 或 accent glow。
- **Implementation:** 使用 `getFieldSurfaceStyle`，不要组件内复制 surface 配方。

### Buttons

- **Primary:** 蓝色纵向渐层，10px 圆角，12-14px / 600，默认高度 32/36/40px。
- **Hover / Focus:** 上浮约 -1px，增加 accent glow 和 inset highlight。
- **Pressed:** 下压约 1px 并轻微 scale 到 0.985。
- **Outline / Ghost:** 默认安静，hover/focus 后进入 field surface 语言。

### Icon Buttons

- **Size:** 主窗口 mini controls 可用 16px，默认 chrome 18px，二级窗口关闭按钮常用 20px。
- **Default:** transparent、muted icon，无边框。
- **Hover / Focus:** field hover bg、inset border、muted hover text。
- **Danger:** 只在关闭、取消等语义上使用 danger surface/text。

### Toggles

- **Shape:** 46x26 pill，18px knob。
- **Checked:** accent solid background、accent border、accent glow。
- **Unchecked:** field background、field border、inset highlight。

### Dropdowns

- **Trigger:** `NeonFieldButton` 和 field surface 语言。
- **Menu:** 10px panel shell，strong shadow，max height 152px。
- **Motion:** AnimatePresence，0.16s，opacity + y + scale。

### Sections And Hints

- **Section:** `NeonSection` 使用 10px uppercase label，label 到内容约 9px，section bottom rhythm 18px。
- **Hint:** `NeonHint` 用 10-11px，tone 包含 default/accent/danger。提示是行内辅助，不是独立警示卡。

### Status Badges

- **Plugin Status Pill:** 10px / 600，999px pill，active 使用 accent surface，muted 使用 field surface。
- **Site Login Badge:** 13px 连续圆角，42px 左右高度，左侧状态点表达 ready/danger/muted。
- **Queue Badge:** 主窗口角标使用 field gradient、blur、inset border 和紧凑数字权重。
- **Runtime Indicator:** 24px 圆形指示器，琥珀色用于 runtime attention，必须支持 reduced motion。

### Progress And Glow

- **Progress Ring:** 24px runtime ring 或 48px foreground ring，stroke 使用 progress token，indeterminate 使用 spin。
- **Edge Glow:** 鼠标靠近主窗口边缘时出现 radial-gradient 边缘光，mask 到边框区域。
- **Drag Glow:** 文件拖拽悬停时出现 linear/radial accent glow，表示 drop affordance。

### Browser Extension Surfaces

- **Injected Panel:** 使用 Ameow surface tokens，12px panel radius，10px screenshot card radius，必要时可使用 blur。
- **Overlay Buttons:** 36px circular controls，hover 使用 site accent，danger hover 使用 danger token。
- **Success:** `#34d399` 只用于网页注入复制成功等局部确认，不代表桌面主应用的全局成功色。

## 6. Do's and Don'ts

### Do:

- **Do** 使用 `ThemeColors` 和 `--fs-*` 变量作为颜色来源。
- **Do** 通过 `shared-styles.ts` 的 style factory 构造窗口壳、面板、字段、选项和 chrome buttons。
- **Do** 保持 black/white 双主题的同构 token，新增状态时两个主题一起定义。
- **Do** 使用 `0.18s cubic-bezier(0.22, 1, 0.36, 1)` 作为默认交互反馈。
- **Do** 对窗口形态变化使用 spring，并尊重 `useReducedMotion()`。
- **Do** 把警告、错误和运行时依赖状态做成紧凑 inline / badge / indicator。
- **Do** 让滚动条、dropdown、popover 也继承 Ameow 的 accent 和 surface 语言。

### Don't:

- **Don't** 做大面积蓝色、紫色或 neon 背景。蓝色的稀缺性是状态语言的一部分。
- **Don't** 使用 generic flat gray UI。Ameow 表面需要渐层、内高光、内描边或轻微阴影。
- **Don't** 使用 loud warning blocks。错误可以强，但不能压过小窗任务。
- **Don't** 在组件局部散写 hex/rgba，除非正在新增经过命名的 token。
- **Don't** 新增无 `Neon` 前缀的产品 UI primitive。
- **Don't** 引入装饰性 glassmorphism。浏览器注入面板可以谨慎 blur，桌面主 UI 不把 blur 当默认容器语言。
- **Don't** 使用 side-stripe borders、gradient text、hero metrics、营销页卡片网格或重复 icon-card grids。
- **Don't** 用页面级编排动画。产品加载进任务，不加载进表演。
