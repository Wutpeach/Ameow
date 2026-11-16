# Compact 分层矢量

来源：Figma「Ameow Icon Design」，页面「Compact · Placeholder」4:237。
用户指定 Light 画板 5:278 / instance 5:281 / component 5:276，Night 画板 5:279 / instance 5:301 / component 5:277。

本目录由对应 component 的只读 SVG 导出保留全部路径、渐变、inside stroke mask 与 60×60 圆形裁剪，只增加 head、ear、eye、gaze、glint 变换组；没有使用 190×158 展示背景。左右耳内侧随对应外廓分组，彼此不重叠；爪子、趾缝、前景与细线保持原位。

`src/mascot.rs` 使用 GPUI 已有原生 SVG 栅格器按窗口 DPI 绘制矢量姿态，缓存单个当前图像并释放旧 atlas 图像。静止时复用；无新运行时或预烘焙 PNG/帧序列。动作逻辑位于 `src/mascot_motion.rs`。
