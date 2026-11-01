# brainstorm: portable windows artifact rendering issues

## Goal

分析 FlowSelect 便携版在不同 Windows 电脑上出现“默认像图标态 / 窗口边缘有锯齿或发虚 / 图标边缘不干净”等现象的成因，并收敛出一组可执行的修复路线，重点区分是便携版分发方式、WebView2 运行时差异、Windows DPI/合成差异，还是当前透明异形窗口实现本身带来的问题。

## What I already know

* 用户观察到：打包后的便携版在不同 Windows 电脑上会出现图标态或窗口边缘锯齿问题。
* 当前项目是 Tauri v2 + React 19 桌面应用，Windows 主窗口为无边框透明窗口：`decorations: false`、`transparent: true`、`shadow: false`，初始尺寸 `200x200`。见 `src-tauri/tauri.conf.json`。
* 主窗口前端自身还会做一次缩放动画：`isMinimized` 时内容 `scale` 从 `1` 缩到 `0.3`，并在动画结束后把原生窗口从 `200x200` 改成 `80x80`。见 `src/App.tsx`。
* 主窗口初始状态就是 `isMinimized = true`，启动后依赖 `resetIdleTimer()` / `expandWindow()` 恢复，所以首帧表现本身就对不同机器上的初始化时序较敏感。见 `src/App.tsx`。
* 便携版不是 Tauri 的安装器产物，而是 `scripts/package-portable.ps1` 先执行 `npx tauri build --no-bundle`，再把 `FlowSelect.exe` 和 sidecar 二进制直接压缩成 ZIP。
* 这意味着便携版不会走 Tauri Windows Installer 的 `webviewInstallMode`，也不会自动安装或校验 WebView2 Runtime。
* 当前 `tauri.conf.json` 没有显式配置 `bundle.windows.webviewInstallMode` 或 `nsis.minimumWebview2Version`。
* 本地 `src-tauri/icons/icon.ico` 含 `16/24/32/48/64/256` 尺寸；缺少 Windows 常见缩放位点常用的 `20/30/36/40/60/72/96`。
* Microsoft 文档说明 Windows 会按缩放因子选择图标尺寸；没有精确尺寸时会优先找更大的尺寸再缩小，更多尺寸可以减少缩放失真。
* Tauri 官方仓库在 2025-10 有已关闭 issue `#14351`，描述 `tauri icon` 在透明 PNG/SVG 输入下可能生成带灰边/光晕的图标。
* Microsoft WebView2 官方反馈仓库存在与透明渲染、DPI、跨机器差异相关的问题：
  * 少数机器会出现额外 zoom factor，且和 transparency + DPI 相关。
  * 某些机器在最小化/恢复后会出现恢复绘制异常。

## Assumptions (temporary)

* “图标模式”大概率不是单独的打包 bug，而是当前最小化状态机、透明窗口初始化时序和 DPI/绘制差异共同触发的视觉表现。
* “窗口边缘锯齿”大概率首先来自透明异形窗口 + WebView2 合成 + 非整数缩放，而不是 ZIP 压缩过程本身。
* “图标边缘问题”若发生在任务栏 / 开始菜单 / 标题栏，更可能与 ICO 尺寸覆盖不足或 icon 生成链路有关。

## Open Questions

* 本次要收敛的方向更偏向哪一类：
  * 先做根因定位和复现手段
  * 直接做低风险稳态修复
  * 进一步控制 WebView2 运行时分发

## Requirements (evolving)

* 解释为什么该问题会在“不同 Windows 电脑”上表现不同。
* 明确区分便携版 ZIP 和 MSI/NSIS 安装器在 WebView2 依赖上的差异。
* 说明当前窗口实现中哪些部分会放大 DPI / 合成差异。
* 给出 2-3 条可落地修复路线，并标注优先级、收益、代价。
* 修复方案需要覆盖两类问题：
  * 窗口边缘锯齿 / 发虚 / 恢复后异常
  * 应用图标在不同缩放和系统位置下的失真或灰边

## Acceptance Criteria (evolving)

* [ ] 能解释为什么便携版在不同机器上会出现不同的窗口边缘和图标表现。
* [ ] 能指出当前代码和打包链路中最相关的触发点。
* [ ] 能给出至少一个低风险短期修复方案和一个高确定性长期修复方案。
* [ ] 能明确说明哪些方案只对安装器有效，哪些方案对 ZIP 便携版同样有效。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 本任务暂不直接修改窗口 UI 或打包脚本。
* 暂不处理与下载、sidecar、浏览器扩展无关的问题。
* 暂不承诺彻底消除所有 GPU/驱动/WebView2 个体机器差异，只收敛到可接受风险。

## Research Notes

### What similar tools / platforms do

* Tauri Windows Installer 默认使用 WebView2 bootstrapper；也支持 `offlineInstaller` 和 `fixedRuntime`。
* Microsoft WebView2 官方文档明确区分 Evergreen Runtime 与 Fixed Version Runtime；Fixed Version 可以减少跨机器差异，但会显著增大发包体积。
* Microsoft Windows 图标设计文档建议至少覆盖 `16/24/32/48/256`，并指出提供更多精确尺寸可以减少缩放失真。

### Constraints from our repo/project

* 当前便携版是手工 ZIP 打包，不经过 Tauri Windows Installer，因此安装器层的 WebView2 补齐逻辑对它无效。
* 当前主窗口是透明、无装饰、无 shadow 的异形窗口，并且额外做前端 scale 动画与运行时窗口尺寸切换，天然比标准矩形窗口更容易暴露合成瑕疵。
* 当前 ICO 尺寸集合满足最低要求，但不覆盖较多高 DPI 精确位点。

### Feasible approaches here

**Approach A: 稳态优先的低风险修复** (Recommended)

* How it works:
  * 保留当前产品形态，但减少透明异形窗口的高风险因素。
  * 去掉“前端缩放 + 原生窗口缩放”双重缩放中的一层，优先保留单一缩放来源。
  * 补全/重做 Windows 图标尺寸资产，必要时绕开 `tauri icon` 自动生成链路。
* Pros:
  * 改动成本较低。
  * 能优先缓解最常见的锯齿、发虚、图标失真问题。
* Cons:
  * 不能完全消除不同 WebView2 runtime / 驱动造成的个体差异。

**Approach B: 控制运行时一致性**

* How it works:
  * 对安装器产物配置 `webviewInstallMode` / `minimumWebview2Version`。
  * 对便携版改为携带 Fixed Version WebView2 runtime，或单独提供“便携完整版”。
* Pros:
  * 最能减少“同一构建在不同机器行为不同”的不确定性。
* Cons:
  * 体积明显增大，便携版会增加约 180MB 级别成本。
  * 仍不能单独解决透明异形窗口本身的锯齿问题。

**Approach C: 改变窗口视觉实现**

* How it works:
  * 减少透明区域，改为近似原生矩形窗口，或启用系统阴影/圆角并把造型交回原生窗口层。
  * 尽量避免靠透明边缘和 CSS mask 伪造轮廓。
* Pros:
  * 对“边缘锯齿 / 恢复异常 / 合成差异”最有效。
* Cons:
  * 会改变当前产品的核心视觉语言和交互体验。

## Technical Notes

* Inspected:
  * `src-tauri/tauri.conf.json`
  * `src-tauri/Cargo.toml`
  * `src-tauri/src/lib.rs`
  * `src/App.tsx`
  * `src/index.css`
  * `scripts/package-portable.ps1`
  * `README.en.md`
  * `src-tauri/icons/icon.ico`
* Local findings:
  * `src-tauri/icons/icon.ico` 当前包含 6 个尺寸：`16/24/32/48/64/256`
  * `shadow: false` 避免了 Windows undecorated + shadow 时的 1px 白边，但也失去了原生圆角/阴影帮助
  * `shortcut-show`、idle timer、startup animation、window resize 共同参与窗口态切换
* External references:
  * Microsoft icon sizing guidance: https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction
  * Microsoft WebView2 distribution guidance: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
  * Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
  * Tauri config reference (`shadow`, `transparent`): https://v2.tauri.app/reference/config/
  * Tauri icon generation halo issue: https://github.com/tauri-apps/tauri/issues/14351
  * Tauri/WebView2 high DPI issue: https://github.com/tauri-apps/tauri/issues/1074
  * WebView2 minority-system transparency/DPI zoom issue: https://github.com/MicrosoftEdge/WebView2Feedback/issues/3839
