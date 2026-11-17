# release-integrity Specification

## Purpose

定义当前 Windows 构建、签名和交付的安全及兼容边界。取代旧 R11 Gate A/B 审核文件流程；本规范记录既有发行机制，不授予本次迁移公开上传或签发权限。

## Requirements

### Requirement: 同源真实构建与材料

构建 SHALL 使用现有单入口、locked/offline、指定 Windows x64/MSVC 工具链、static CRT 和新输出目录，记录 Commit/tree、dirty、实际源码/资源/Cargo.lock/工具链和二进制身份并核验材料字节哈希。MUST NOT 要求已取消的 approval 状态、review 文件、reviewer 身份或构建前 Tag。dirty 开发输入可准备未签名材料，正式签名拒绝 dirty/合成身份；构建与打包不自动签名或上传。

#### Scenario: 已有输出目录或构建期间输入变化

- **WHEN** 输出已存在或输入/打包实现发生变化
- **THEN** 拒绝覆盖或混用，保留原件与证据。

### Requirement: 生产可信根与完整性

正式签名/交付 SHALL 拒绝空生产根、fixture 根、版本/roots 不匹配、无效签名和修改后的 ZIP/EXE/notices/成员。私钥 SHALL 留在仓库和候选目录之外，CI 不生成或使用生产私钥；fixture 只可用于显式 debug/test 并明显标记。取消旧审核 Gate 不代表免除真实第三方许可、来源、署名和发行主体义务。

#### Scenario: 将测试资产改名为正式包

- **WHEN** fixture 或篡改资产被交付工具接收
- **THEN** 真实信任/签名/身份校验拒绝，改名或修改状态字段不能成为生产权威。

### Requirement: 唯一最终核心与显式公开授权

installer、portable、单 EXE 更新 ZIP 和签名清单 SHALL 来自同一最终签名核心并核对成员/哈希。Tag 若存在 SHALL 指向签名构建对应 Commit；不得移动历史 Tag、覆盖远端资产或把本地验签当作公网 HTTPS 验收。公开 Tag/Release/上传需要当前明确授权；本机准备、CI 成功和历史私有验收均不自动授权。

#### Scenario: 本地候选尚未公开

- **WHEN** 本地签名/Ready 或损坏拒绝已验证，但公开 Release 尚不存在
- **THEN** 保留本地结果，真实公网清单/包验证仍标为未完成，不造新版本来补验收。

### Requirement: 保持已有用户身份与证据边界

工程根级 Rust/GPUI 身份 SHALL 保留既有 AmeowNext 数据位置、设置/运行时选择/历史/缓存和 Windows 注册状态兼容；规范迁移不搬迁用户数据、导入 Electron 配置或重新注册启动项。历史路径与 Git 保全、忽略产物的恢复范围 SHALL 区分，未核对原始资料不得据此删除工作树、发布快照或历史证据。

#### Scenario: 开发文档或工程名称调整

- **WHEN** 新文档采用当前根路径或 Ameow 名称
- **THEN** 不把旧命令/旧原生结果解释成新路径或新产物验证，不由文档整理触发数据迁移或发行。
