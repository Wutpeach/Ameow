# Proposal

## Why

Agent 和脚本需要控制已运行的桌面 Ameow，并取得准确任务身份及交付结果。第一阶段复用现有 Rust 队列、组件准备与下载内核，让 GUI 与 CLI 观察并操作同一任务。

## What Changes

- 增加 Windows/macOS 当前用户本机控制入口，以及独立控制台程序 ameow-cli。
- 提供提交、列表、查看、取消、重试、等待、设置读取、组件状态与诊断；提交可覆盖本任务画质和目录。
- 定义版本化 JSON、稳定错误与退出状态、实例绑定任务身份、有界请求去重和普通应用自动启动握手。
- CLI 退出、超时与失联不取消任务；不新增持久任务历史。第二阶段 #46、全部设置写入、更新写操作、Gallery 控制、Linux、远程 HTTP、MCP、独立无界面服务不在本次范围。

## Capabilities

### New Capabilities

- `desktop-control`: 桌面实例的本机命令、机器输出、身份、启动与访问边界。

### Modified Capabilities

- `queue-lifecycle`: 任务级提交选项在统一受理边界冻结，不污染全局默认。

## Impact

影响 Rust 库控制模块、桌面命令线程与实例仲裁、控制台入口、相关构建/打包入口及工程使用说明。下载业务继续由原 DownloadCoordinator 负责。原实现基于准确 7d3bb8ef，原 PR42 依赖已合入 main；后续正常合入 main 的已验收修复，不更改 0.5.0 版本或发行资产。包内入口验证使用现有 debug fixture 和任务独立数据域，不操作日常实例或生产签发材料。
