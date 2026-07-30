## Scenario: Tauri Command + Event Type Contract

_Part 3 of 3._

#### Correct

```ts
const result = await invoke<{ success: boolean; file_path?: string; error?: string }>(
  "download_video",
  { url }
);
if (result.success && result.file_path) {
  console.log(result.file_path);
}

listen<{ enabled: boolean }>("devmode-changed", (event) => {
  setDevMode(event.payload.enabled);
});
```

---
