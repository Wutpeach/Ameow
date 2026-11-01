import { createInterface } from "node:readline";
import { chromium } from "playwright";

const endpoint = process.argv[2] ?? "http://127.0.0.1:9333";
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts().flatMap((context) => context.pages())
  .find((candidate) => !candidate.url().startsWith("devtools://"));

if (!page) {
  throw new Error("No Electron renderer page found");
}

await page.waitForFunction(() => Boolean(window.ameow));

const emit = (event, payload) => page.evaluate(
  ([eventName, eventPayload]) => window.ameow.events.emit(eventName, eventPayload),
  [event, payload],
);

const inspect = () => page.evaluate(() => ({
  url: location.href,
  viewport: { width: innerWidth, height: innerHeight },
  currentFailure: [...document.querySelectorAll("[aria-label]")]
    .map((element) => element.getAttribute("aria-label"))
    .find((label) => label === "Current failure" || label === "当前失败") ?? null,
  buttons: [...document.querySelectorAll("button")].map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      label: button.getAttribute("aria-label") ?? button.getAttribute("title") ?? button.textContent?.trim(),
      disabled: button.disabled,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
    };
  }).filter((button) => button.visible),
  text: document.body.innerText,
  themeBackground: getComputedStyle(document.body).backgroundColor,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  currentFailureButtonStyle: (() => {
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => ["Copy report", "复制报告"].includes(candidate.getAttribute("aria-label")));
    if (!button) return null;
    const style = getComputedStyle(button);
    return { backgroundColor: style.backgroundColor, color: style.color };
  })(),
  focusTargetRect: (() => {
    const target = document.querySelector('[tabindex="0"]');
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  })(),
}));

const clickAction = async (names) => {
  const button = page.getByRole("button", { name: new RegExp(names.join("|"), "i") }).first();
  await button.click();
  return inspect();
};

const handlers = {
  inspect,
  expand: async () => {
    await emit("shortcut-show");
    await page.waitForTimeout(300);
    return inspect();
  },
  enterHotspot: async () => {
    const rect = await page.locator('[tabindex="0"]').first().boundingBox();
    if (!rect) throw new Error("Compact hotspot target not found");
    await page.mouse.move(rect.x + (rect.width / 2), rect.y + (rect.height / 2));
    await page.waitForTimeout(300);
    return inspect();
  },
  failure: async ({ traceId = "failure-a", rawMessage = "controlled failure" } = {}) => {
    await emit("video-download-complete", {
      traceId,
      success: false,
      error: rawMessage,
      failure: {
        code: "E_EXECUTION_FAILED",
        classification: "execution",
        diagnosticCategory: "unknown",
        rawMessage,
      },
    });
    await page.waitForTimeout(100);
    return inspect();
  },
  failureAndCopy: async ({ traceId = "failure-copy", rawMessage = "controlled failure" } = {}) => {
    await handlers.failure({ traceId, rawMessage });
    const button = page.getByRole("button", { name: /Copy report|复制报告/i }).first();
    await button.click();
    await page.waitForTimeout(100);
    return inspect();
  },
  backgroundFailure: async ({ traceId = "background-failure" } = {}) => {
    await emit("video-queue-detail", {
      tasks: [{ traceId: "active-download", label: "Controlled active download", status: "active", phase: "downloading" }],
    });
    await emit("video-download-progress", {
      traceId: "active-download",
      percent: 42,
      stage: "downloading",
      speed: "1 MB/s",
      eta: "5s",
    });
    await emit("video-download-complete", {
      traceId,
      success: false,
      error: "controlled background failure",
      failure: { code: "E_EXECUTION_FAILED", classification: "execution" },
    });
    await page.waitForTimeout(100);
    return inspect();
  },
  unmarkedPromotion: async () => {
    await emit("video-queue-detail", {
      tasks: [{ traceId: "promoted", label: "Controlled promoted download", status: "active", phase: "downloading" }],
    });
    await page.waitForTimeout(100);
    return inspect();
  },
  acceptedIntake: async () => {
    await emit("video-queue-detail", {
      acceptedTraceId: "accepted-new",
      tasks: [{ traceId: "accepted-new", label: "Controlled accepted download", status: "active", phase: "downloading" }],
    });
    await page.waitForTimeout(100);
    return inspect();
  },
  copy: () => clickAction(["Copy report", "复制报告"]),
  enterAndCopy: async () => {
    await handlers.enterHotspot();
    return clickAction(["Copy report", "复制报告"]);
  },
  save: () => clickAction(["Save report", "保存报告"]),
  dismiss: () => clickAction(["Dismiss", "关闭"]),
  wait: async ({ ms }) => {
    await page.waitForTimeout(ms);
    return inspect();
  },
  theme: async ({ value }) => {
    await emit("theme-changed", value);
    await page.waitForTimeout(100);
    return inspect();
  },
  reducedMotion: async ({ value }) => {
    await page.emulateMedia({ reducedMotion: value ? "reduce" : "no-preference" });
    await page.waitForTimeout(100);
    return inspect();
  },
  screenshotReduced: async ({ path }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    await page.screenshot({ path });
    return { path, state: await inspect() };
  },
  keyboard: async () => {
    await page.locator('[tabindex="0"]').first().focus();
    const focused = [];
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => (
        document.activeElement?.getAttribute("aria-label")
        ?? document.activeElement?.getAttribute("title")
        ?? document.activeElement?.textContent?.trim()
        ?? null
      ));
      if (label) focused.push(label);
    }
    return { focused, state: await inspect() };
  },
  collapseCycle: async () => {
    await page.mouse.move(40, 40);
    await page.waitForTimeout(100);
    await page.mouse.move(260, 260);
    await page.waitForTimeout(300);
    const collapsed = await inspect();
    await page.mouse.move(100, 100);
    await page.waitForTimeout(300);
    return { collapsed, expanded: await inspect() };
  },
  screenshot: async ({ path }) => {
    await page.screenshot({ path });
    return { path, state: await inspect() };
  },
};

if (process.argv[3]) {
  const request = JSON.parse(process.argv[3]);
  const handler = handlers[request.action];
  if (!handler) throw new Error(`Unknown action: ${request.action}`);
  process.stdout.write(`${JSON.stringify({ ok: true, action: request.action, result: await handler(request) })}\n`);
  process.exit(0);
}

process.stdout.write(`${JSON.stringify({ ready: true, endpoint, url: page.url() })}\n`);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  if (request.action === "exit") process.exit(0);
  try {
    const handler = handlers[request.action];
    if (!handler) throw new Error(`Unknown action: ${request.action}`);
    process.stdout.write(`${JSON.stringify({ ok: true, action: request.action, result: await handler(request) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, action: request.action, error: String(error) })}\n`);
  }
}
