// Shared VM harness: loads the content message router into a window, then
// loads a detector source into the same window, and returns the router
// handleMessage so tests exercise the real single-resolver dispatch path.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const routerSource = readFileSync(
  path.resolve("browser-extension/content-message-router.js"),
  "utf8",
);

export function loadContentWithRouter(detectorSource, detectorPath, buildContext) {
  const context = buildContext();
  context.window.AmeowContentMessageRouter = undefined;
  vm.runInNewContext(routerSource, context, { filename: "content-message-router.js" });
  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return {
    window: context.window,
    router: context.window.AmeowContentMessageRouter,
    async handleMessage(message, sender = {}) {
      let response = null;
      const handled = context.window.AmeowContentMessageRouter.handleMessage(
        message,
        sender,
        (payload) => {
          response = payload;
        },
      );
      // The router answers across microtasks; flush them before returning.
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
      return { handled, response };
    },
  };
}
