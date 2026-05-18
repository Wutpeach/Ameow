# Error Handling

> How errors are handled in FlowSelect backend.

---

## Overview

FlowSelect uses Rust's `Result<T, String>` pattern for error handling. Errors are propagated to the frontend as string messages.

---

## Error Types

**Standard return type for Tauri commands:**
```rust
#[tauri::command]
fn my_command() -> Result<String, String> {
    // ...
}
```

---

## Error Handling Patterns

**Using `map_err` for error conversion:**
```rust
let entries = fs::read_dir(dir_path)
    .map_err(|e| format!("Failed to read directory: {}", e))?;
```

*Reference: `src-tauri/src/lib.rs:71-72`*

**Early return with descriptive errors:**
```rust
if !dir_path.exists() {
    return Err(format!("Path does not exist: {}", path));
}

if !dir_path.is_dir() {
    return Err(format!("Path is not a directory: {}", path));
}
```

*Reference: `src-tauri/src/lib.rs:63-69`*

---

## Common Mistakes

**WRONG: Using unwrap**
```rust
// WRONG - panics on error
let file = fs::File::open(path).unwrap();
```

**CORRECT: Propagate with ?**
```rust
// CORRECT - returns error to caller
let file = fs::File::open(path)
    .map_err(|e| format!("Failed to open: {}", e))?;
```

**WRONG: Generic error messages**
```rust
return Err("Error".to_string());
```

**CORRECT: Descriptive messages**
```rust
return Err(format!("Failed to copy {}: {}", path, e));
```
