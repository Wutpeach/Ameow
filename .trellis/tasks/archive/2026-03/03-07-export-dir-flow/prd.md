# brainstorm: 简化导出目录设置流程

## Goal

让用户更少地进入设置页即可完成“导出目录”设定，优先评估是否能把“拖拽文件夹到主窗口”收敛为一步完成；如果受技术约束无法稳定实现，则定义一个更顺手的主窗口内替代入口。

## What I already know

* 当前设置页已提供 `Output Path` 按钮用于选择导出目录，入口在 `src/pages/SettingsPage.tsx`。
* 主窗口当前已经识别“拖入的是文件夹”，逻辑在 `src/App.tsx` 的 `handleDrop` 中。
* 识别到文件夹后，当前行为不是直接采用拖入目录，而是再次弹出系统目录选择器，标题是“确认素材导出路径”。
* README 已把“拖拽文件夹到悬浮窗设置输出目录”写成现有能力，但和当前实现存在体验落差。
* 主窗口已有自定义右键菜单窗口，当前只有 `Open Folder` 一个动作，代码在 `src/pages/ContextMenuPage.tsx` 和 `src/App.tsx`。
* 设置页保存输出目录时，会同时发出 `output-path-changed` 事件，并尝试重置重命名计数器。
* 主窗口里 `outputPath` 变化也会自动落盘，但当前这条路径不会复用设置页的“重置重命名计数器”逻辑。

## Assumptions (temporary)

* 用户真正想要的是“在主窗口完成设置”，而不是一定要保留当前这段拖拽确认弹窗。
* 不应该为了简化“设置导出目录”，破坏现有拖拽文件、图片、URL、视频链接的主流程。
* 如果自动采用拖入文件夹，会默认用户接受“将该文件夹设为后续导出目录”，但最好仍给出轻量反馈而不是静默修改。

## Open Questions

* 无

## Requirements (evolving)

* 用户应能在主窗口内完成导出目录设置，不必强依赖进入设置页。
* MVP 采用主窗口右键菜单新增 `Set Output Folder` 入口。
* 新流程不能削弱现有拖拽收集文件、图片和 URL 的能力。
* 设置页改目录、主窗口右键菜单改目录、拖文件夹改目录，这三条路径必须复用同一套“保存输出目录”逻辑。
* 只要输出目录发生切换，就必须重置重命名计数器。
* 目录切换后不需要额外提示，不需要撤回按钮。
* 右键菜单中的目录设置入口命名和行为应与现有 `Open Folder` 区分清楚，并保持现有英文菜单风格一致。

## Acceptance Criteria (evolving)

* [ ] 用户无需打开设置页，也能从主窗口完成导出目录设置。
* [ ] 现有文件 / 图片 / URL / 视频链接拖拽流程保持可用。
* [ ] 导出目录变更后会持久化，下次启动仍生效。
* [ ] 通过设置页、主窗口右键菜单、拖文件夹三条路径修改导出目录时，均会复用同一套保存逻辑。
* [ ] 只要导出目录发生变化，重命名计数器都会被重置；若目录未变化，则不会重复重置。
* [ ] 主窗口右键菜单同时提供 `Open Folder` 和 `Set Output Folder`。
* [ ] README 与实际交互一致。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重做整个主窗口拖拽模型
* 新增复杂的多级菜单或完整命令面板
* 调整下载/收集主流程的其它交互
* 为目录切换增加 toast、系统通知或撤回能力

## Technical Approach

抽取一个前端共享的输出目录更新方法，统一负责：

* 比较新旧目录是否变化
* 保存配置
* 广播 `output-path-changed`
* 在目录实际变化时重置重命名计数器

三条入口统一调用这套逻辑：

* 设置页的 `selectOutputPath`
* 主窗口右键菜单新增 `Set Output Folder`
* 主窗口拖入文件夹后的目录确认流程

## Research Notes

### What similar platform capabilities allow

* Tauri 2 官方 `Window.onDragDropEvent()` 支持在原生文件拖拽的 drop 事件中读取 `event.payload.paths`。
* Tauri 2 官方配置文档说明：在 Windows 上，如需使用前端 HTML5 drag and drop，需要把 `dragDropEnabled` 设为 `false`。

### Constraints from our repo/project

* 当前项目的 `src-tauri/tauri.conf.json` 已显式把主窗口 `dragDropEnabled` 设为 `false`。
* 当前主窗口依赖前端 HTML5 drop 逻辑处理本地文件、图片 URL、视频 URL 和文件夹识别。
* 仅依赖当前 `handleDrop` 使用的浏览器拖拽入口，可以识别“这是文件夹”，但当前代码拿不到拖入文件夹的绝对路径，只能再弹一次系统目录选择器。
* 如果改走 Tauri 原生文件拖拽来拿真实路径，Windows 上可能会和现有 HTML5 拖拽主流程冲突，需要重新设计拖拽分流。

### Feasible approaches here

**Approach A: 右键菜单新增“Set Output Folder”** (Chosen)

* How it works:
  在现有主窗口右键菜单中新增一个入口，点击后直接打开目录选择器并保存。
* Pros:
  不影响现有拖拽主流程；实现成本低；与当前已有右键菜单结构一致；跨平台风险较小。
* Cons:
  仍然是两步操作，不是“拖入即设定”。

**Approach B: 保留拖拽文件夹入口，但改成应用内确认条 / Toast**

* How it works:
  用户拖入文件夹后，不进入设置页；若未来能拿到真实路径，则直接设定并给出撤销/提示；若当前拿不到真实路径，则只能继续弹选择器，因此这一方案受限于底层事件能力。
* Pros:
  最贴近用户直觉，学习成本最低。
* Cons:
  以当前实现约束，无法仅靠现有 HTML5 drop 事件稳定获得拖入文件夹的真实路径。

**Approach C: 混合方案**

* How it works:
  近期先上右键菜单入口，同时把当前“拖文件夹后再弹目录选择器”的文案/反馈做得更明确；后续再评估是否要切到原生拖拽事件。
* Pros:
  MVP 风险最低，也能立即减少进设置页的频率。
* Cons:
  用户仍会看到两套入口，产品表述需要统一。

## Decision (ADR-lite)

**Context**: 用户希望简化导出目录设置流程，并优先避免进入设置页；同时要求设置页、主窗口入口和拖文件夹入口之间保持一致行为。

**Decision**: MVP 选择在主窗口右键菜单新增 `Set Output Folder`，并抽取一套共享的输出目录保存逻辑，供设置页、主窗口右键菜单、拖文件夹流程共同复用；目录切换时统一重置重命名计数器。

**Consequences**:

* 优点：改动范围可控，不破坏现有拖拽主流程，能立即减少进入设置页的频率。
* 代价：拖文件夹仍不是“拖入即自动设定”，而是继续走当前确认流程。
* 后续：如果未来愿意重构拖拽模型，可再评估接入 Tauri 原生拖拽事件来获取真实文件夹路径。

## Technical Notes

* `src/App.tsx`
  文件夹拖拽识别在 `handleDrop`，当前使用 `webkitGetAsEntry()` 判断目录后再调用 `open({ directory: true })`。
* `src/App.tsx`
  `outputPath` 改变后会自动 `save_config`，但这里没有复用设置页里“重置重命名计数器”的逻辑。
* `src/pages/SettingsPage.tsx`
  `saveOutputPath()` 已封装较完整的输出目录保存流程，可作为主窗口入口复用目标。
* `src/pages/ContextMenuPage.tsx`
  右键菜单目前只有 `Open Folder`，扩展单个新动作的结构成本很低。
* `src-tauri/tauri.conf.json`
  当前主窗口配置 `dragDropEnabled: false`。
* 官方参考:
  Tauri 配置文档说明 `dragDropEnabled` 在 Windows 上与 HTML5 drag and drop 的关系。
  Tauri JS Window API 文档说明 `onDragDropEvent()` 的 drop 事件可提供 `payload.paths`。
