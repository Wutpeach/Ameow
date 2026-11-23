# Design

## Context

动机见 proposal.md。A/E 已稳定不可变发布和已认证租约，C 已稳定 Full 应用提醒，B 管理活动配套文件。F 只扩展组件更新及扩展身份，不重造这些 owner。

## Goals / Non-Goals

复用唯一队列准备 owner、现有组件布局和 Palette。检查与显式安装分开；本任务不发布版本、不管理浏览器账号、不改页面/Popup交互。

## Decisions

- 使用固定的两种 Downloader 区分检查、选择和恢复，保留现有 yt-dlp 调用入口，降低无关调用变更。
- 缓存绑定当前可信运行环境与固定recipe；隐藏设置不记已读，记录落盘失败保留未读。缓存官方检查结果、每日尝试和具体已读版本；请求合并由检查 owner 负责，不在渲染阶段联网。错误与旧结果分别保留。
- 准备候选后通过既有 dispatch 安全门切换整套组合。选择保存与有效租约发布保持事务顺序，不覆盖正在使用的文件。
- 扩展构建时把同一身份注入运行代码并写入 build.json；host 只持久有界安全身份，磁盘身份从活动目录读取。未知/断连不产生新提醒。
- 导航点按具体版本已读清除；组件点依据真实可安装/待重载状态。Full 只新增扩展条目，保留应用 full_attention 和原故障条目。

## Risks / Trade-offs

- 官方版本可能更换运行需求 → 检查兼容信息及资产，候选仍重新验证/probe；不支持提示更新 Ameow。
- Mac wheel 与固定依赖需要组合认证 → 只接受当前可信 recipe 可承载的候选，不更新 Python 或依赖；禁止获取的已选恢复仅复用已验证固定wheel，缺失关闭式失败。
- gallery签名pin → 使用作者官方公钥fingerprint 3E09F5908333DD83DBDCE7375680CA389D365A88（https://github.com/mikf.gpg），官方Codeberg版本化SHA256SUMS及签名提供资产身份，未知key拒绝。
- 浏览器尚未报告身份 → 保留未知，不把文件存在或断连当完成/错误。
- Windows Computer Use 关闭 → Gallery/定向状态证据说明覆盖，最终 UX 留用户验收。

## Migration Plan

从原 yt-dlp 选择记录读取保留意图；新增 gallery-dl 选择默认推荐。整合者统一同步 delta 并保留历史；代码在 F 分支提交推送后整合。
