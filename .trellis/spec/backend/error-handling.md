# Error Handling

> How errors are handled in FlowSelect backend.

---

## Overview

FlowSelect desktop/runtime code primarily uses typed TypeScript errors plus structured result payloads. Renderer-facing failures should preserve stable command/event behavior and avoid lossy generic string-only error handling where richer context already exists.

---

## Error Types

**Preferred runtime error shape:**
```ts
throw new DownloadRuntimeError("E_EXECUTION_FAILED", "Readable message", {
  context: {
    exitCode,
    stderrTail,
  },
});
```

---

## Error Handling Patterns

**Wrap execution failures with context:**
```ts
throw new DownloadRuntimeError("E_EXECUTION_FAILED", summary, {
  context: {
    stdoutTail,
    stderrTail,
  },
});
```

**Return descriptive validation failures early:**
```ts
if (!isSafeHttpUrl(url)) {
  throw new DownloadRuntimeError("E_INPUT_INVALID", `Unsupported URL: ${url}`);
}
```

---

## Common Mistakes

**WRONG: throw generic errors with no context**
```ts
throw new Error("Error");
```

**CORRECT: preserve stable error code + readable message**
```ts
throw new DownloadRuntimeError("E_OUTPUT_WRITE_FAILED", `Failed to copy ${path}: ${message}`);
```
