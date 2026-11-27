# Design

## Context

日常实例保留user_selected yt-dlp2026.11.23，恰与当前推荐一致；GalleryDl新推荐文件未缓存。原动态离线恢复拒绝补依赖。Peek独立抓手及86px额外tooltip偏移造成实际截图问题。

## Goals / Non-Goals

复用推荐准备、现有工具栏和单轨映射；不改变用户选择，不跳过信任检查，不加缩放/磁吸或账号操作。

## Decisions

- 所有显式版本均等于编译manifest才复用推荐RuntimeManager，来源完全固定；其他版本保留原proof及禁止冷启动动态获取合同。空选择的显式Restore同样使用推荐入口。
- 键盘按钮按需展示I/O、F、空格、方向键及Esc帮助；帮助显示时先处理其关闭，避免误改视频草稿。
- 播放头不再单独命中，刻度区通过pointer capture连续定位，标记/区间仍独立命中。tooltip去除额外86px偏移。

## Risks / Trade-offs

- 推荐准备可能需要网络：保留typed失败、原缓存和显式重试。
- 窄窗帮助越界：集中验证320px、浅深主题和指针/键盘。
