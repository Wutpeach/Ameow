# macOS 菜单栏图标

白色SVG及18px、36px PNG为用户于2026-11-17确认的原始导出，保持原字节。来源为Figma文件Ameow Icon Design的组件57:4782、路径57:4781；交付归档SHA256为af766918d6e5f436eee9a09f59f50279b12142879851d7348656a6457697c74a。

白色源SHA256：

- SVG：66d286f6ae7b01999c5b4ef6ed32cd8fb14d101afc141c6a64eec1964a55530a。
- 18px：6ab9fe7a9e761077ef21de0ab4a1d067bbf7734d1a962374e5118483f9af79f3。
- 36px：3940ac37b5e5587335842f50a8e9612b2373f9329b03b20a320cbc13f17a3f0c。

黑色template PNG由同一源逐像素保留alpha，仅将RGB设为0，不加背景。可用本机AppKit重新生成到新的输出目录：

    xcrun swift scripts/derive_macos_menu_bar_template.swift assets/brand/tray/macos <new-output-directory>

Mac跟随外观偏好使用这两档NSBitmapImageRep，均声明18×18pt逻辑尺寸，NSImage启用template，由AppKit处理菜单栏外观。状态项保持26pt。显式彩色偏好沿用现有资源；Windows、Dock和应用图标不受影响。
