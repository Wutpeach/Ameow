## MODIFIED Requirements

### Requirement: 用户显式发现与安全激活引擎版本

系统 SHALL 为 yt-dlp、gallery-dl 读取可信 stable 元数据，排除 prerelease/yanked/不一致数据。打开设置先显示缓存，过期异步检查，自动至多每天一次；手动刷新绕过日限并合并并发。发现不安装、不阻塞启动或首单；仅显式更新获取候选。候选 SHALL 按官方资产、当前固定运行环境判定可安装性，不支持则提示更新 Ameow。新版校验和必要受监督探测通过后，同一准备 owner 的激活/恢复 SHALL 等待零活动 slot、全部 owner join、无 Held/owner lost 且未 stop，保留旧可用版本，不中断任务。FFmpeg、ffprobe、Deno、内置 Python 保持随 Ameow 推荐。

#### Scenario: 持久化用户选择失败

- **WHEN** 任一下载器新选择未能原子落盘
- **THEN** 保留旧选择与验证租约，不发布新有效 policy；版本大小不能替代用户意图。

#### Scenario: 每日检查与手动刷新

- **WHEN** 设置打开且缓存已过期，随后同一下载器又收到手动检查
- **THEN** 异步合并同一个在途请求；自动尝试每日最多一次，后续手动刷新不受日限；失败保留真实错误，不冒充本次检查成功。

#### Scenario: 当前环境不支持新版

- **WHEN** 上游有新版但官方资产或所需 Deno/Python 不适配当前运行环境
- **THEN** 提示需要更新 Ameow，不提供无法安装的更新操作或可更新橙点。

## ADDED Requirements

### Requirement: 双下载器选择互不覆盖

两个下载器 SHALL 分别保留推荐或用户选择意图，重启重新认证，更新或恢复一个下载器不得清除另一个选择。组合仍须通过可信文件、运行环境和完成标记认证。

#### Scenario: 更新图库下载器后恢复视频下载器

- **WHEN** 两个下载器均选择新版，用户只恢复 yt-dlp 推荐版本
- **THEN** gallery-dl 继续使用其已确认版本，旧目录保留；同一安全切换门确认资源释放后才发布新组合。
