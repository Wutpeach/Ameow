# Proposal

## Why

#96 已确认精简 Peek 的低频时间输入，并改善精确开关、聚焦和播放头的发现与操作。现有时间输入区与提示不能准确表达点击后的动作。

## What Changes

- 移除时间编辑按钮和展开输入，保留标记、方向键、拖动、时间显示和提交。
- F 与聚焦按钮共用状态和行为，仅在活动 Peek 非文本输入时处理。
- 播放头采用中性色实心尖头抓手与贯穿轨道细线，增加分区命中和局部反馈。
- 精确提示表达开启/关闭动作及耗时、边界取舍。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-video-tools`: Peek 操作、聚焦键位、播放头反馈及精确提示。

## Impact

browser-extension 的 page.mjs/page-ui.css、现有页面测试、DESIGN 与 sidecar，以及中英文扩展说明。保留切分默认值和后端路径，不新增依赖。
