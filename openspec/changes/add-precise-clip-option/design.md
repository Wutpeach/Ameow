# Design

## Context

已批准按钮方案见proposal。现有ClipRange经扩展、Native、control、queue和verification贯通；真实FFmpeg媒体时间与倍率进度已在9741b468接通。

## Goals / Non-Goals

**Goals:** 让用户显式选择输出边界策略，并把选择作为冻结意图端到端保留。

**Non-Goals:** 不改变默认粗切、账号/代理/发行，不建立全局偏好，不添加自动失败回退。

## Decisions

- ClipRange增加serde默认false的precise布尔值；关闭时序列化省略，旧请求继续快速模式。开启通过新增precise_clip_v1能力在桥接和桌面握手处拒绝旧端。现有区间相等比较自然纳入模式去重/重试/request receipt。CLI默认仍粗切，不新增命令行选项。
- 页面模式单独作为同作品草稿状态，避免清标记丢失。提交时创建不可变clip对象，pending禁用按钮，拒绝保留。右侧actions中32px高按钮采用SVG方框/勾选、既有主题与焦点反馈，原下载胶囊不动；320px通过紧凑固定宽度验证。
- 精确采用yt-dlp原生--force-keyframes-at-cuts，FFmpeg输出显式H.264/AAC、CRF18/preset fast及MKV，避免容器默认codec差异。保留原source identity/height/audio要求，只对显式重新编码更新输出codec预期。快速仍-c copy。复用FFmpeg stdout进度及真实取消结算。
- 精确核对容器及解码时长，容差取实际视频一帧加音频帧量化；不使用粗切10秒GOP容差。真实短样本使用非关键帧入点、首末画面及音频脉冲位置验证时间边界，覆盖无声输入。

## Risks / Trade-offs

- [重新编码更慢且有代际损失] → 明确opt-in及就近提示，默认不变；保留当前画质上限，不用速率猜进度。
- [旧桥接/桌面只懂粗切] → 两层能力检查，精确从不静默降级。
- [认证媒体差异] → 沿现有Jar和清理机制，只验证隔离认证观察分支；保留已知受保护媒体fixture限制。

## Migration Plan

桌面及桥接配套增量构建、扩展dist刷新；不操作用户App或日常浏览器，提供重启和扩展刷新步骤。缺省字段兼容历史请求；用户验收前change保留不归档。
