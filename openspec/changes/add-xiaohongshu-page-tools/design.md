# Design

## Context

当前样本已在默认App/CLI匿名完整下载成功。浏览器真实页面为noteContainer、xhsplayer-skin-default单个video，当前笔记状态是Vue ref；媒体流时长为29300/29355ms，浏览器实际29.35467s。原始分享查询参数需要保留。

## Goals / Non-Goals

复用原胶囊、权限与Peek，不新增下载管线或Cookie采集。不接抖音，不处理图文或模糊多视频笔记。

## Decisions

- 读取当前笔记ref值、指定noteDetailMap视频类型、声明流时长与可见单播放器，和URL ID交叉核验；不以第一条推荐项或blob URL猜作品。
- 保留原完整分享URL，仅清fragment；片段沿原CLI/Native能力。后端只核明确XHS笔记ID与XiaoHongShu提取器，其余Generic不变。
- 小红书只增加PAGE_ORIGINS支持，复用已有可选访问申请，不新增必需host权限；撤销Cookie后的页面权限合同继续复用。
- 内容脚本复用真实XGPlayer节点，小红书Peek使用视频固有比例；仅隐藏已确认controls/start/replay/loading层，退出移除局部样式恢复。

## Risks / Trade-offs

网站状态/DOM会变：不匹配时撤下，定向覆盖切换与多播放器；分享参数会过期：保留当前原链接，重提取失败如实显示。真实浏览器UI与模拟ACK、自有正式App/CLI媒体分别留证，不混称Native握手通过。
