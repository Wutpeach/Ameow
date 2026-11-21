# Design

## Context

Peek已具有遮罩点击和Esc恢复路径，下载主动作与队列ACK共用状态更新。动机见proposal.md；保持现有播放器节点、单区间和桌面受理权威。

## Goals / Non-Goals

**Goals:** 右侧单个胶囊承担下载，所有状态下文字与图标一起保留，关闭后原页面入口可继续操作。

**Non-Goals:** 不改变页面绑定、选区协议、Cookie授权或桌面下载执行。

## Decisions

- 复用现有纯色品牌SVG及currentColor，胶囊保留原aria-label、等待和真实受理状态，只增加可见「下载」文字。
- 去掉关闭按钮及其图形，沿用遮罩和Esc的restore路径；在dialog归还焦点前唤醒可能已inert的原胶囊。
- 同步现有浏览器测试退出入口，验证浅深/禁用/受理态和320px窄窗。

## Risks / Trade-offs

- [浮窗原入口闲置后无法重新聚焦] → 在恢复前唤醒，并用真实content script和键鼠操作覆盖Esc/遮罩退出及显式OFF。
- [新增文字挤压窄窗] → 复用32px控制栏与紧凑间距，在320px运行布局回归。
