# Proposal

## Why

浏览器已登录的用户目前仍以匿名身份下载，无法复用已有站点会话。#24 已批准用户主动按站点授权的 Chromium 扩展、自动同步和正式下载链路接入；旧 Bilibili 个案的唯一根因尚未确认。

## What Changes

- 提供可加载、可打包的 Chromium 扩展；普通网页主动授权当前站点，准确显示站点及子域范围。
- 一个站点绑定一个明确的浏览器安装来源；轻量 Native Messaging 桥接自动同步，受保护离线保存，设置管理与移除。
- 每次下载 attempt 固定受控 CookieJar，metadata、选流、transfer、后端内部重试共用；显式重试可读取最新有效会话。
- 保留匿名下载、原生支持判断、现有失败与诊断复制，撤销停止后续使用并取消受影响在途执行。

## Capabilities

### New Capabilities
- `browser-sessions`: 站点授权、单一来源、自动同步、存储、撤销、设置及扩展交付。

### Modified Capabilities
- `download-execution`: attempt 认证一致性和认证输出隐私。

## Impact

影响 Rust 会话存储、现有下载 owner/Adapter、GPUI 设置、Chromium 扩展与 Windows/macOS 包装。使用浏览器官方 Cookie/权限/Native Messaging API，不解密日常浏览器数据库，不增加全局 Cookie 头、通用登录判断、账号中心或后台通用服务。#50/#51/#59/#60、商店发布、Tag/Release 和合并均不在范围。
