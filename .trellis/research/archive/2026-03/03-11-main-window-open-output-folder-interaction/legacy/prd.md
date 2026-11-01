# brainstorm: main window open output folder interaction

## Goal

评估是否为主悬浮窗增加“双击打开当前导出目录”这一快捷操作，并决定在该操作存在时，右键菜单中的 `Open Folder` 是否还应该保留。

## What I already know

* 当前主窗口右键菜单已包含两个动作：`Open Folder` 和 `Set Output Folder`，实现位于 `src/pages/ContextMenuPage.tsx`。
* 当前主窗口本体没有 `onDoubleClick` 行为。
* 主窗口容器在 `src/App.tsx` 上把左键 `onMouseDown` 直接绑定到 `handleDragStart`，并调用 `getCurrentWindow().startDragging()`，也就是说“左键按下”当前默认是拖动窗口，而不是点击命令。
* 当前项目为了保证 Windows 上右键菜单稳定，已经专门处理了 context-menu 子窗口的焦点与关闭时序。
* README 当前明确写着“右键主窗口，可以打开当前输出目录或重新选择输出目录”。
* 设置页当前没有“打开当前输出目录”动作，`open_folder(...)` 的主用途目前就是右键菜单里的 `Open Folder`。

## Assumptions (temporary)

* 用户想要的是更直觉、更快地“打开当前导出目录”，而不是单纯减少一个菜单项。
* 即便增加双击快捷操作，也不应该明显伤害主窗口拖动手感。
* `Open Folder` 是便捷动作，不是核心主流程，因此可以接受保留一个冗余但更可发现的入口。

## Open Questions

* 无

## Requirements (evolving)

* 如果实现双击入口，它应覆盖整个主窗口空白区域，只排除现有按钮、队列弹层、右键菜单等交互区域。
* 主窗口拖动能力必须保持可靠，不能因为引入双击检测而明显变差。
* 双击打开导出目录只在普通空闲态生效；下载中和最小化态不生效。
* 双击打开导出目录后，右键菜单继续保留 `Open Folder` 作为显式可发现入口。
* 右键菜单应继续承担“上下文命令集合”的角色，至少保留 `Set Output Folder`。
* README 与实际桌面交互需要保持一致。

## Acceptance Criteria (evolving)

* [x] 已明确 `Open Folder` 在双击方案下的最终入口策略。
* [x] 已明确双击热区覆盖整个主窗口空白区，只排除现有交互控件和弹层区域。
* [ ] 若启用双击，用户能在主窗口通过该手势打开当前导出目录。
* [x] 已明确双击仅在普通空闲态生效，下载中和最小化态不触发。
* [ ] 若启用双击，主窗口拖动体验没有明显回退。
* [ ] 右键菜单与 README 文案和真实行为一致。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重做整个主窗口拖拽模型
* 重新设计右键菜单视觉样式
* 为打开目录新增 toast、状态提示或复杂反馈
* 顺手修改与导出目录无关的主窗口交互

## Research Notes

### What similar desktop conventions do

* Windows 鼠标交互指南把“双击左键”定义为“执行默认命令”。
* Windows 菜单设计指南建议：当某个对象支持双击默认命令时，该默认命令也可以作为上下文菜单中的默认命令呈现。
* Windows 上下文菜单指南把 context menu 定义为“secondary commands”，同时强调上下文命令应作为可普遍访问的入口存在，而不是只依赖某一种输入手势。

### Constraints from our repo/project

* 当前主窗口左键按下即开始拖动窗口，双击并不是零成本新增，需要重新处理“点击 vs 拖动”的判定。
* `Open Folder` 当前只有右键菜单这一条显式入口；如果删除菜单项，功能会变成几乎纯隐藏手势。
* 右键菜单最近刚做过 Windows 稳定性修正，说明这个区域已有平台兼容成本，最好避免在这里做无必要的大改。

### Feasible approaches here

**Approach A: 增加双击，但保留右键菜单里的 `Open Folder`** (Chosen)

* How it works:
  双击主窗口作为快捷默认动作；右键菜单继续保留 `Open Folder` 和 `Set Output Folder`。
* Pros:
  兼顾效率和可发现性；符合“双击=默认动作、右键=次级命令”的桌面约定；即使用户不知道双击，也不会失去入口。
* Cons:
  会产生功能重复；实现时仍要谨慎处理双击与拖动的冲突。

**Approach B: 增加双击，并删除右键菜单里的 `Open Folder`**

* How it works:
  右键菜单只保留 `Set Output Folder`；打开目录全部交给双击手势。
* Pros:
  菜单更干净；避免重复命令。
* Cons:
  可发现性显著下降；如果双击因为拖动冲突而不稳定，用户会失去唯一显式入口。

**Approach C: 保持现状，不增加双击**

* How it works:
  继续只通过右键菜单打开目录。
* Pros:
  风险最低；不碰主窗口拖动逻辑。
* Cons:
  打开导出目录仍然偏“二级入口”，不够直觉。

## Expansion Sweep

### Future evolution

* 后续如果主窗口想承载更多快捷动作，双击会占用一个非常宝贵的默认手势。
* 如果未来加入键盘快捷键或小型 hover action，`Open Folder` 可能会形成多入口并存的策略。

### Related scenarios

* `Set Output Folder` 与 `Open Folder` 最好保持在同一个“目录动作集合”里，避免一部分走手势、一部分走菜单却没有回退入口。
* 设置页和 README 对目录入口的描述需要同步，不然会出现“文档写右键，实际主推双击”的认知偏差。

### Failure & edge cases

* 双击判定若与窗口拖动冲突，可能造成“想打开目录却拖动了窗口”。
* 下载进行中、窗口最小化、或用户点在小按钮附近时，双击热区定义需要明确。

## Decision (ADR-lite)

**Context**: 用户希望让“打开当前导出目录”更符合直觉，但不确定在新增双击后，右键菜单中的同名动作是否仍应保留。

**Decision**: 增加双击打开导出目录，同时保留右键菜单中的 `Open Folder`。

**Consequences**:

* 保留一个显式、可发现的后备入口，避免把功能完全压在隐藏手势上。
* 菜单会出现与双击重复的命令，但这符合“默认动作 + 次级命令入口”模式。
* 双击仅在普通空闲态生效，能避开下载中按钮和最小化态的手势冲突。
* 双击热区覆盖整个主窗口空白区，更符合“对主窗口本体操作”的直觉，但实现上必须明确排除按钮、弹层和菜单区域。

## Technical Approach

在主窗口容器层增加“双击打开导出目录”判定，但只在普通空闲态启用，并只响应空白区域：

* 复用现有后端 `open_folder(...)` / 打开输出目录命令链路，不新增另一套目录打开实现。
* 为主窗口拖动逻辑补上“单击按下准备拖动”与“双击触发打开目录”的判定边界，避免左键按下立即进入拖动导致双击无法成立。
* 明确排除现有交互控件、队列弹层、右键菜单等区域，避免双击误触。
* 保留右键菜单中的 `Open Folder` 和 `Set Output Folder`。
* 更新 README，使“右键可打开目录”与“双击也可快捷打开目录”的描述一致。

## Technical Notes

* `src/App.tsx`
  主窗口容器使用 `onMouseDown={handleDragStart}`，而 `handleDragStart` 在左键按下时立即调用 `getCurrentWindow().startDragging()`。
* `src/pages/ContextMenuPage.tsx`
  当前上下文菜单已同时渲染 `Open Folder` 和 `Set Output Folder` 两个按钮。
* `README.md`
  当前文案写明：右键主窗口可打开当前输出目录或重新选择输出目录。
* 外部参考：
  * Microsoft Learn: Windows 7 Mouse and Pointers
  * Microsoft Learn: Windows 7 Menus (Design basics)
  * Microsoft Learn: Menus and context menus
  * Microsoft Learn: Contextual commanding
