## ADDED Requirements

### Requirement: YouTube HTTPS 快切使用隔离的有限请求
系统 SHALL 仅对 YouTube 单作品点播的快速区间，在当次原生选流后确认所有输入均为直接 HTTPS 且无分段清单、显式 Range 或冲突参数时，为各输入设置 8 MiB 有限请求；MUST NOT 改变原生选流、认证或有效路由。处理器 SHALL 来源于应用固定代码并只从本 attempt 新建受控目录隔离装载，不发现环境插件。普通、精确、非 YouTube、HLS、混合/未知协议和冲突保持原参数；真实加载或执行失败沿既有失败与资源结算，不静默直连、完整下载或改下载器。

#### Scenario: 实际 HTTPS 分离轨
- **WHEN** 快速 YouTube 区间本次实际选中独立 HTTPS 视频和音轨，且均无冲突
- **THEN** 对两轨原子设置每请求最多 8 MiB，保留已有输入选项、音轨、原生流复制及真实媒体核验。

#### Scenario: transfer 重新选为 HLS
- **WHEN** resolve 预测 HTTPS，但 transfer 本次实际选中 HLS 或混合/未知协议
- **THEN** 不注入有限请求，不冻结预测格式或限制原生选流。

#### Scenario: 原生插件与模式隔离
- **WHEN** 执行普通整片、精确或非 YouTube 请求，或系统存在其他环境插件
- **THEN** 不应用该优化，不恢复环境插件发现；受控处理器加载失败仍由原生执行明确失败。
