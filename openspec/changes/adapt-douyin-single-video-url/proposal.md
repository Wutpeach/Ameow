# Proposal

## Why

#97 的精选页 modal_id 链接不在当前 yt-dlp Douyin 提取器 URL 语法中，且换成规范链接仍需验证真实提取、同作品媒体与资源结算。应用不能把链接形态错误误认为整站不可下载。

## What Changes

- 将明确且无歧义的抖音精选单作品目标规整到同 ID 规范视频链接，冻结的传输 URL 与对象身份保持一致。
- 拒绝重复、冲突或非法作品 ID；明确作品的原生身份不匹配时拒绝交付。
- 沿现有下载器、网络、授权及错误处理，保留提取失败的真实边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `download-execution`: 明确抖音单作品链接的规整及身份核验。

## Impact

src/download/request.rs、yt-dlp 身份适配及定向测试。真实下载消费 #98 固定运行时；不改格式选择或输出策略，不以元数据成功代替媒体成功。胶囊接入须先满足真实下载前置。
