# Design

## Context

动机见 proposal。基线为 main 1ee6e36f；现有设置使用原生 GPUI、共享控件与焦点链，QueueCommand 已提供连接配置与站点移除，原生模块可定位配套扩展。Popup 使用现有 HTML/CSS 与消息协议。connect-v8 是用户已通过的布局与状态基准，原 HTML 不直接合入。

## Goals / Non-Goals

**Goals:** 保持批准布局，前台组合既有事实与操作，复用 Palette、SVG 和动画生命周期，提供真实源码对应的隔离证据。

**Non-Goals:** 不改变会话后台、Cookie 存储、认证、下载、队列、页面工具或已归档能力；不发布安装包、Tag、商店版本。

## Decisions

- 设置以局部状态管理选择与引导页，共享详情只读当前 QueueSnapshot；动作交既有命令 owner，避免另设管理服务。
- 配置、实际目录解析、复制与演示分别管理，配置回执不推导浏览器握手。替换旧 Explorer 动作；复制沿既有 OS 成功反馈。
- 原生演示使用原生绘制及有界九秒时钟，减少动态和可见性参与唤醒；不嵌网页或录像替代真实交互。
- 品牌 SVG 复用已批准锁定 Simple Icons 修订的精确路径及 viewBox，主题单色；不请求 favicon 或安装图标包。
- Popup 校验完整状态响应并从实际字段表达同步、旧快照、零 Cookie、分区与来源，双语沿系统 sans 栈。
- Gallery 覆盖动态多站、空、失败加旧快照、零加分区、长值和连接引导。截图绑定新候选 EXE SHA256，网页模拟与原生证据分别标识。

## Risks / Trade-offs

- [GPUI 与 HTML 布局差异] → 对照原生实际截图审阅，不能以 HTML PASS 替代原生验收。
- [配置测试影响本机注册] → 合成 Gallery 验证展示与隔离；真实动作需要单独可控入口，保护 pensive 注册。
- [可见窗口占用用户桌面] → 候选准备好后经来源协调；独立 headless 与构建先行。
- [跨任务写入冲突] → 本任务只写产品与规范；README、site 各自候选由本任务最终整合。
