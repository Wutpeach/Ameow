## MODIFIED Requirements

### Requirement: 唯一最终核心与显式公开授权

Windows 安装 EXE 与完整 portable ZIP、Mac 完整 App ZIP 及两平台签名更新 JSON SHALL 构成五项发行资产，来自各平台匹配的最终签名核心并核对成员及哈希。Windows 完整 portable ZIP SHALL 同时作为后续应用内更新载荷，不再输出独立单 EXE 更新 ZIP；Mac 完整 App ZIP 与签名清单保留。Tag 若存在 SHALL 指向签名构建对应 Commit；不得移动历史 Tag、覆盖远端资产或把本地验签当作公网 HTTPS 验收。公开 Tag/Release/上传需要当前明确授权；本机准备、CI 成功和历史私有验收均不自动授权。

#### Scenario: 本地候选尚未公开

- **WHEN** 本地签名、完整包切换或损坏拒绝已验证，但公开 Release 尚不存在
- **THEN** 保留本地结果，真实公网清单及包验证仍标为未完成，公开下载链接继续指向已发布版本。

## ADDED Requirements

### Requirement: Windows 稳定入口与完整配套

Windows 0.5.2 起完整安装版及完整 portable SHALL 包含清楚的根目录 Ameow.exe 稳定启动器，并嵌正式品牌图标、FileDescription 和版本资源；桌面、开始菜单、开机启动和内部调用 SHALL 使用该入口。版本文件可保存在内部 versions 目录，CLI、host 与扩展 SHALL 随主程序完整交付。MUST NOT 为入口增加根 README/TXT，或把开发 cargo run 的主程序替换为启动器。0.5.2 推荐完整重装，本布局 MUST NOT 建立旧 Launcher 名、快捷方式或单 EXE 载荷的兼容桥接。

#### Scenario: 隔离安装后的实际快捷方式

- **WHEN** 用本任务自有目录及独立快捷方式安装新完整包
- **THEN** 核实实际快捷方式目标、图标来源及 Shell 提取的正式图标，运行该快捷方式确认主程序启动；安装器自身图标及图标缓存推测不能代替此证据。

#### Scenario: 完整重装目录仍保留旧布局状态

- **WHEN** 所选程序文件夹仍保留旧布局的安装状态，缺少新稳定入口清单
- **THEN** 安装前明确要求清理旧程序目录或选择空文件夹，保留原文件，不导入旧状态或宣称已迁移。

### Requirement: 完整版本事务与失败恢复

Windows 后续应用更新 SHALL 验签并校验完整载荷和全部配套成员，只在真实启动 Ready 确认后将整套版本设为当前；缺件、篡改、非法路径、重放或启动失败 SHALL 安全拒绝并保留可运行的旧完整版本。固定扩展磁盘路径 SHALL 与已确认活动版本匹配，镜像失败 MUST NOT 宣称切换完成；中断后下一次启动 SHALL 修复派生镜像并继续正确旧版或候选处理。稳定 CLI/host SHALL 分派至已验证活动版本。

#### Scenario: 完整组件升级与回退

- **WHEN** 明确身份的新契约消费者接收更高版本完整包，或该候选未 Ready、成员损坏
- **THEN** 前者确认后主程序、CLI、host、扩展全部匹配新版本，后者恢复整套旧版本；保留实际消费者、源码及包身份，静态公钥或新版 NoUpdate 不能充当真实升级结果。

#### Scenario: 下载完成但尚未活动

- **WHEN** 新包仅已下载到 Ready，或已确认活动并成功更新固定扩展目录
- **THEN** 仅后者代表磁盘配套扩展已更新；浏览器已加载代码仍须手动重载扩展及刷新网页，不假称浏览器自动更新。

#### Scenario: 首次安装与升级期间的配套分派

- **WHEN** 首次安装尚无已接受版本，或已有版本正在试运行新升级
- **THEN** 前者只允许完整验证且未标记失败的首次安装候选（pending/trial）供根 CLI/host 使用，Ready 后使用已接受版本，首次失败后拒绝分派；后者始终优先已接受 current，不把未确认升级交给根配套入口。
