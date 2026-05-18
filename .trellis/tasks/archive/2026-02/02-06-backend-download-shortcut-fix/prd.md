# Backend: Download and Shortcut Fix

## Goal

修复三个后端问题：Bilibili下载残留m4a文件、图片保存路径、全局快捷键跨屏。

## Requirements

1. 下载完成后清理残留的 .m4a 音频文件
2. 图片下载时从 config 读取 outputPath（与视频保持一致）
3. 全局快捷键支持负坐标（多显示器）

## Acceptance Criteria

- [ ] Bilibili 视频下载后，输出目录无 .m4a 残留文件
- [ ] 图片拖拽保存到用户设置的指定文件夹
- [ ] 副屏在主屏左侧时，快捷键能正确定位窗口

## Technical Notes

**文件**: `src-tauri/src/lib.rs`

### Issue 1: m4a 清理 (line ~600)

下载成功后清理同目录的 .m4a 文件：
```rust
if success {
    if let Some(ref final_path) = last_file_path {
        let final_path = std::path::Path::new(final_path);
        if let Some(parent) = final_path.parent() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext == "m4a" {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
}
```

### Issue 2: 图片保存路径 (lines 178-184, 287-293)

修改 `download_image` 和 `save_data_url`，当 target_dir 为 None 时从 config 读取：
```rust
let final_target_dir = if let Some(dir) = target_dir {
    std::path::PathBuf::from(dir)
} else {
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    config.get("outputPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        })
};
```

### Issue 3: 快捷键跨屏 (lines 1172-1176)

移除 `.max(0.0)` 限制：
```rust
if let Ok(pos) = window.cursor_position() {
    let window_width = 220.0;
    let x = pos.x - 50.0 - window_width;  // 移除 .max(0.0)
    let y = pos.y + 50.0;
    let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
}
```
