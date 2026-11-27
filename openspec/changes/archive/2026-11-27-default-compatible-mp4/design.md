# Design

## Context

见 proposal。现有 Adapter 固定 MKV 合并/remux；精确切片固定 H.264/AAC Matroska。已有受控 Python PP 加载与进程树结算可复用。

## Goals / Non-Goals

**Goals:** 对实际所选轨道作必要转换，分离来源观察与输出预期，保持既有发布权威。

**Non-Goals:** 不排序偏好编码、不加 CLI 格式参数、不扩 runtime 或身份层，不操作用户 Resolve 工程。

## Decisions

- 新增固定应用内 PP，与有限 HTTP PP 共用 owned 插件目录和只读 source guard。原生合并实例在当次隔离引擎中使用专用合并 run，以实际输入 probe 作轨道复制/转码决策，直接产 MP4，避免整段先合 MKV 再转码。
- 单文件及快切在实际文件上决定兼容轨道；快切沿可承载原轨的 Matroska 中间片段再作必要转换，避免未知轨道无法先装 MP4 而失败。未知色彩不从 10-bit 猜 HDR；PQ/HLG、HDR side data、原生 HDR 标识及不明确的广色域保留旧 MKV 输出。无声保持无声；全轨映射，不下混。
- BT.2020 色域本身不是 HDR。明确 SDR transfer（包括 BT.2020-10/12、BT.709）且无 HDR side/native 标记时仍走兼容 MP4；未知 BT.2020 保留谨慎旧路径。PQ/HLG、HDR side/native 标记优先，不加 tone mapping。依据 ITU-T H.Sup19 §7.2.4/Table6 的 SDR WCG（CP9/TC14）及 TC1/6/14/15 等效说明。
- 精确切片常见 SDR 在原重编码直接产 MP4；明确 HDR 保持原参数。未知输入的实际成品仍需核验，必要时补兼容处理，不远程预检 CDN。
- 不改来源 codec 观察；新增有界成品预期给独立 verifier 核对目标容器/codec/pixel format、实际尺寸、有可靠帧数和时长支持的 CFR fps 和音轨数/声道。Matroska 的 avg/r 相同不足以证明真实 CFR；未知保持未知，不放宽既有 FPS 或片段时间守卫。编码使用 fps_mode passthrough 与 enc_time_base demux，保留输入时间基且不设置 -r；局部小样本用帧数、逐包相对 PTS 和独立解码核查实际节奏。
- 处理器输出原生 PP 阶段进度；取消仍由同进程 owner 结算，不增子进程所有权层。

## Risks / Trade-offs

- [必要重新编码有损且增加等待] → CRF18/faster、四线程，不缩放/降 fps，不承诺固定倍率。
- [合并接入依赖受管 yt-dlp 的内部 PP 接口] → 小样本执行实际受管工具，定向测试及升级时复验。
- [Resolve 由本人后验] → 从已验证成品选普通/快速/精确各一，给准确路径、来源/画质、实际媒体事实、请求范围和实际时长，已有无声样例顺带注明。技术检查独立推进；Resolve 导入待本人，不等待新工程或重复询问许可，任务不操作日常工程。

## Migration Plan

整合者合入根 main 后统一构建与本人体验。正式公开文档按发行阶段更新；此 change 在实际产品验收前不归档。
