/* MR3 Progress Field — Windows real-renderer smoke (CDP).
 * Drives the REAL data path: Main UI Lab scenario -> bridge events ->
 * Download reducer/selectors -> App projection -> DotFieldCanvas runtime.
 * Evidence: frame counters (patched canvas clearRect/arc + rAF) and canvas
 * pixel alpha at known dot coordinates. */
const http = require("node:http");

const LIST_URL = "http://127.0.0.1:9222/json/list";

const getTargets = () => new Promise((resolve, reject) => {
  http.get(LIST_URL, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => resolve(JSON.parse(data)));
  }).on("error", reject);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error("eval failed: " + JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }
  close() { this.ws.close(); }
}

(async () => {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === "page" && t.url.includes("1420"));
  if (!page) throw new Error("main window target not found: " + JSON.stringify(targets));
  const cdp = new Cdp(page.webSocketDebuggerUrl);

  // Instrument BEFORE the document scripts run: count canvas frame draws
  // (clearRect per runtime frame), arcs (dots), and rAF callbacks.
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__smoke = { draws: 0, arcs: 0, rafs: 0 };
      (() => {
        const clear = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) {
          window.__smoke.draws += 1;
          return clear.apply(this, args);
        };
        const arc = CanvasRenderingContext2D.prototype.arc;
        CanvasRenderingContext2D.prototype.arc = function (...args) {
          window.__smoke.arcs += 1;
          return arc.apply(this, args);
        };
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => {
          window.__smoke.rafs += 1;
          return raf(cb);
        };
      })();
    `,
  });

  await cdp.send("Page.enable");
  await cdp.send("Page.reload", { ignoreCache: true });
  await sleep(6000); // app mount + startup settle + compact canvas

  const evidence = { steps: [] };
  const step = (name, data) => { evidence.steps.push({ name, ...data }); };
  const snapshot = () => cdp.eval(`(() => {
    const canvases = [...document.querySelectorAll("canvas")];
    const field = canvases.find((c) => c.width >= 60 && c.width <= 600);
    let pixels = null;
    let cssSize = null;
    let dpr = window.devicePixelRatio;
    if (field) {
      const ctx = field.getContext("2d");
      cssSize = { w: field.clientWidth, h: field.clientHeight };
      const alphaAt = (x, y) => {
        const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
        return d[3];
      };
      pixels = {
        "33,33": alphaAt(33, 33),
        "100,100": alphaAt(100, 100),
        "167,167": alphaAt(167, 167),
        "100,80": alphaAt(100, 80),
      };
    }
    return {
      smoke: { ...window.__smoke },
      canvasCount: canvases.length,
      cssSize,
      dpr,
      pixels,
      title: document.title,
    };
  })()`);

  // 1. Compact idle: canvas mounted (60x60 sleeping); no frame activity.
  await sleep(1500);
  const compact = await snapshot();
  step("compact-idle", compact);
  await sleep(1200);
  const compactAfter = await snapshot();
  step("compact-idle+1.2s", compactAfter);

  // 2. NOTE: compact->full expansion is NOT scriptable via CDP mouse events.
  //    The real trigger is the Windows compact-passthrough window-level
  //    pointer path (native boundary/hotspot signals), which synthetic
  //    events do not drive (observed: mouseMoved inside the hotspot geometry
  //    produced no size change). Expansion reliably happens through the
  //    app's own download -> full presentation path, so the first 200x200
  //    snapshot is the determinate-46% step below.

  // 3. Determinate progress via the real UI Lab scenario (Main emits
  //    queue-detail + progress -> reducer -> selectors -> projection).
  await cdp.eval(`window.ameow.commands.invoke("dev_ui_lab_apply_scenario", { scenario: "download-active" })`);
  await sleep(1500);
  const determinate = await snapshot();
  step("determinate-46%", determinate);
  await sleep(1500);
  const determinateAfter = await snapshot();
  step("determinate-46%+1.5s", determinateAfter);

  // 4. Click acknowledgement over the frontier, then settle to zero frames.
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 120, y: 120 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 120, y: 120, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 120, y: 120, button: "left", clickCount: 1 });
  await sleep(400);
  const clickPeak = await snapshot();
  step("click-over-progress-peak", clickPeak);
  await sleep(1200);
  const clickSettled = await snapshot();
  step("click-over-progress-settled", clickSettled);
  await sleep(1200);
  const clickSettled2 = await snapshot();
  step("click-over-progress-settled+1.2s", clickSettled2);

  // 5. Terminal/removal: UI Lab reset empties the queue -> projection idle.
  await cdp.eval(`window.ameow.commands.invoke("dev_ui_lab_apply_scenario", { scenario: "reset" })`);
  await sleep(1200);
  const idleRevert = await snapshot();
  step("idle-after-removal", idleRevert);
  await sleep(1200);
  const idleRevert2 = await snapshot();
  step("idle-after-removal+1.2s", idleRevert2);

  console.log("MR3_SMOKE_EVIDENCE " + JSON.stringify(evidence, null, 1));
  cdp.close();
})().catch((error) => {
  console.error("MR3_SMOKE_FAILED", error);
  process.exit(1);
});
