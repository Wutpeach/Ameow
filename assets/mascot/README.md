# Compact 分层矢量

来源：Figma「Ameow Icon Design」，页面「Compact · Placeholder」4:237。
用户指定 Light 画板 5:278 / instance 5:281 / component 5:276，Night 画板 5:279 / instance 5:301 / component 5:277。

用户后续澄清：Light 黑猫、Night 白猫。已先在指定 Figma Light 源组件中将猫咪对应 16 层填充映射为 Page 1 / 3:155「Ameow · B · 雾白黑猫」的原始配色/渐变，去除白猫专用浅灰描边，截图核对后再导出本目录素材。Night 白猫、两主题 60px 几何和前景保持原样。应用圆窗背景继续使用现有 Palette（Light #FFFFFF / Night #232427），不导入 1024px 图标背景或底托。

本目录从对应 component 导出，保留全部填充路径、渐变、剩余 inside stroke mask 与 60×60 圆形裁剪，只增加 head、ear、eye、gaze、glint 变换组；没有使用 190×158 展示背景。左右耳内侧随对应外廓分组，彼此不重叠；爪子、趾缝、前景与细线保持原位。

`src/mascot.rs` 使用 GPUI 已有原生 SVG 栅格器按窗口 DPI 绘制矢量姿态，缓存单个当前图像并释放旧 atlas 图像。静止时复用；无新运行时或预烘焙 PNG/帧序列。动作逻辑位于 `src/mascot_motion.rs`。
