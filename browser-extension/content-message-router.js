// Ameow Browser Extension - Content Message Router
//
// One router instance per frame owns every request/response content
// message. Site-specific extractors register resolvers instead of
// competing `sendResponse` listeners, so a content request has exactly one
// resolver owner and deterministic priority (site-specific first, generic
// fallback).
//
// A registered resolver receives `(message, sender)` and returns either a
// response object (answer this message) or `null`/`undefined` (skip). The
// first resolver in priority order that answers wins; the router calls
// `sendResponse` at most once per message and returns `false` for
// unowned messages so no asynchronous port is left open.
//
// The singleton is created and attached when this file loads (the generic
// all-frames content entry loads it before any detector). Pure module: no
// `chrome.*` or DOM access beyond the injected listener host.

(function (root) {
  "use strict";

  const registrations = [];

  // kind: message type string; resolver: (message, sender) -> response | null
  // priority: lower wins; site-specific resolvers use 0, generic uses 1.
  const registerResolver = function (kind, resolver, priority = 0) {
    if (typeof kind !== "string" || typeof resolver !== "function") {
      return () => {};
    }
    registrations.push({ kind, resolver, priority });
    return () => {
      const index = registrations.findIndex(
        (registration) => (
          registration.kind === kind
          && registration.resolver === resolver
          && registration.priority === priority
        ),
      );
      if (index !== -1) {
        registrations.splice(index, 1);
      }
    };
  };

  const handleMessage = function (message, sender, sendResponse) {
    const kind = message?.type;
    if (typeof kind !== "string") {
      return false;
    }

    const candidates = registrations
      .filter((registration) => registration.kind === kind)
      .sort((left, right) => left.priority - right.priority);

    if (candidates.length === 0) {
      return false;
    }

    let settled = false;
    let cursor = 0;

    const tryNext = () => {
      if (settled) {
        return;
      }
      const registration = candidates[cursor];
      if (!registration) {
        // No resolver answered: close the channel with a stable failure
        // instead of leaving an asynchronous port open.
        settled = true;
        sendResponse({ success: false, reason: "resolve_unavailable" });
        return;
      }
      cursor += 1;
      Promise.resolve()
        .then(() => registration.resolver(message, sender))
        .then((response) => {
          if (response === null || typeof response === "undefined") {
            tryNext();
            return;
          }
          if (!settled) {
            settled = true;
            sendResponse(response);
          }
        })
        .catch((error) => {
          root.console?.warn?.("[Ameow] Content resolver failed:", kind, error);
          tryNext();
        });
    };

    tryNext();
    return true;
  };

  const attach = function () {
    if (root.__ameowContentRouterAttached || !root.chrome?.runtime?.onMessage) {
      return;
    }
    root.__ameowContentRouterAttached = true;
    root.chrome.runtime.onMessage.addListener(handleMessage);
  };

  attach();

  root.AmeowContentMessageRouter = {
    attach,
    handleMessage,
    registerResolver,
  };
})(typeof window !== "undefined" ? window : globalThis);
