# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

FlowSelect backend follows Rust idioms with consistent naming and error handling patterns.

---

## Forbidden Patterns

**1. Using unwrap() or expect()**
```rust
// WRONG - panics on error
let file = fs::File::open(path).unwrap();

// CORRECT - propagate error
let file = fs::File::open(path)
    .map_err(|e| format!("Failed: {}", e))?;
```

**2. Blocking in async functions**
```rust
// WRONG - blocks async runtime
async fn download() {
    std::thread::sleep(Duration::from_secs(1));
}

// CORRECT - use tokio
async fn download() {
    tokio::time::sleep(Duration::from_secs(1)).await;
}
```

**3. Missing log prefix**
```rust
// WRONG - inconsistent logging
println!("Processing files");

// CORRECT - use >>> prefix
println!(">>> [Rust] Processing files");
```

---

## Required Patterns

**1. Tauri command signature**
```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    // ...
}
```

**2. Async commands with AppHandle**
```rust
#[tauri::command]
async fn my_async_command(app: AppHandle) -> Result<(), String> {
    // ...
}
```

**3. Thread-safe state with Mutex**
```rust
static DOWNLOAD_CHILD: Mutex<Option<u32>> = Mutex::new(None);
```

**4. Normalize wrapper URLs before download**
```rust
// CORRECT - resolve wrapper URL (e.g. google imgres) to direct media URL first
let resolved_url = resolve_image_download_url(&url);
let response = reqwest::Client::new().get(&resolved_url).send().await?;
```

---

## Code Review Checklist

- [ ] No unwrap() or expect()
- [ ] Errors have descriptive messages
- [ ] Logs use `>>>` prefix
- [ ] Async functions use tokio
- [ ] State uses Mutex for thread safety
