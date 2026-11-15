# artifact-delivery Specification

## Purpose

定义真实媒体从受控工作区到用户目录的完整性、命名和不覆盖交付，以及已实现集合下载的保留与重试边界。源身份、目标 stage 与精确返回路径必须在整个交付流程中保持一致。

## Requirements

### Requirement: 同一已验证对象发布

系统 SHALL 在 pinned ffprobe、哈希及复制期间持有只允许 read-sharing 的源身份 guard；DestinationStage SHALL 以 READ/WRITE/DELETE handle 和只读共享保留同一目标对象，使用 ReplaceIfExists=false 的 FileRenameInfo 原子发布。FILE_RENAME_INFO SHALL 显式包含结尾 UTF-16 零，而 FileNameLength 只计名称字节；不依赖分配器 padding。

#### Scenario: 目标同名文件已经存在

- **WHEN** 目标名称发生碰撞，包括边界 UTF-16 名称长度
- **THEN** 保留旧文件，通过无覆盖后缀重试；返回的精确路径、字节数和哈希必须对应实际交付对象。

### Requirement: 清理只处理确切 owned 文件

系统 SHALL 在发布或显式清理成功前持有目标 stage；FileDispositionInfo 之后还须证明实际路径消失。MUST NOT 把 delete-pending、清理尝试或现有 sentinel 当作成功，清理失败保持 Held 与确切所有权。

#### Scenario: 其他 reader 使删除尚未完成

- **WHEN** owned partial 处于 delete-pending 且路径仍存在
- **THEN** 保持非终态并允许有效 cleanup retry，不删除用户已有文件。

### Requirement: 标题与真实分辨率命名

系统 SHALL 优先使用接受的下载器标题，缺少时回退对象 ID 或原生 item stem。视频 SHALL 从已验证文件的实际尺寸附加 `[WIDTHxHEIGHT]`；未知命名元数据不能阻断有效下载，也不能按画质设置猜测分辨率。Windows-safe 标准化和现有长度上限 SHALL 保留分辨率与碰撞后缀；集合身份/续传路径与显示文件名分离。

#### Scenario: 标题含 Windows 保留字符或重复

- **WHEN** 原始标题需要标准化或多个条目同名
- **THEN** 生成安全、受限且不覆盖的名称，保留原有文件。

### Requirement: 集合逐项验证与 Partial 重试

集合下载 SHALL 独立验证并发布条目，保留已完成文件。已识别为 Object::Gallery 的任务在 Failure 或 Partial 后显式重试 SHALL 复用原 Job 与集合目录、增加 attempt，并核对已交付文件完整性以复用；不能信任已被修改的文件或覆盖用户更改。该行为是普通失败新 Job 重试的明确例外，不引入跨应用重启的队列恢复，也不推断所有 Generic 请求具有相同续作身份。

#### Scenario: 部分条目成功后重试或取消

- **WHEN** 集合 Partial 被显式重试，或活动集合被取消
- **THEN** 保留已验证交付；重试只续作尚未可信完成项，取消等待真实资源释放，用户修改的旧文件不被覆盖。
