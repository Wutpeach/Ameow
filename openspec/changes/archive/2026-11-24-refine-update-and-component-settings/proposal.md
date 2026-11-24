# Proposal

## Why

本人验收发现同版可信旧更新格式被误报为安全失败，组件页的版本下拉、重复检查与散落配置入口增加理解成本。按已确认方案保留现有更新和演示 owner，集中配置、检查与低频恢复动作。

## What Changes

- 应用更新先验签与产品身份，再判新旧；同版/旧版安静结束，真正新候选保留完整包校验，格式不支持与安全失败分别反馈。
- 组件首行集中扩展版本、真实待处理点、重载提示和配置入口；原配置/快速演示移入此入口，下载页继续站点授权同步。
- 两下载器版本为文本，顶部检查两者；行内直接更新、独立结果与冷却，更多只保留低频恢复推荐。
- 同步info透明默认样式、中英和Gallery，保留原动态/减少动态与焦点行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- desktop-interaction：组件页集中操作、配置演示导航与键盘返回。
- release-integrity：明确可信同版/旧版清单无需安装契约及新候选保持严格验证。

## Impact

app_update package/service/UI、settings_components、settings_browser_sessions、settings_window、Gallery与设计资料；无新增依赖、更新owner或旧载荷安装桥接。保持Ready重查/授权阻断、下载器日缓存与独立选择，Issue仍Open待本人验收。
