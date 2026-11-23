# Design

## Context

动机与批准来源见 proposal.md。现有 PageVideoTools 已持有当前播放器、胶囊 IntersectionObserver、Peek恢复和解绑生命周期；Popup已有info资产及原生popover。

## Goals / Non-Goals

**Goals:** 扩大原胶囊，利用现有生命周期管理准确反馈目标的可逆隐藏，复用Popup提示。

**Non-Goals:** 后台连接/host协议、白屏修复、逐站避让、拖拽/位置记忆和通用控件识别。

## Decisions

- 保留绝对定位及现有展开状态机，协调按钮宽度、clip-path与图标位移，避免引入第二套交互。
- 真实DOM核查之后才添加站点精确selector，限定当前player查询；只修改目标按钮的visibility，保存原值/priority，并在生命周期退出时恢复。不通过全页CSS隐藏区域。
- 复用现有刷新与可见性回调，Peek进入即恢复、返回后重核；局部DOM观察处理反馈节点更换和胶囊撤下，不新增后台协议。
- Popup名称旁添加现有info图标按钮和popover，原开关逻辑不变。英文使用“Clip/download toolbar”，允许标签在窄栏自然换行。

## Risks / Trade-offs

- [站点结构变化或匿名页面无反馈目标] → 不猜测，保留页面并报告真实覆盖。
- [Peek/离屏/解绑遗留隐藏] → 共用恢复路径并用浏览器检查每条生命周期。
- [较长英文] → 保持正文13px与开关36px，通过标签可换行保留完整内容。
