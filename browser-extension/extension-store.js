// Ameow Browser Extension - Serialized Storage Store
//
// Prevents lost updates on concurrent read-modify-write operations by
// serializing updates per storage key. Feature code calls
// `update(key, reducer)`; the reducer receives the current value and
// returns the next value. Writes to different keys proceed independently.
//
// Pure module: storage read/write functions are injected by the background
// composition root (chrome.storage.local adapter).

(function (root) {
  "use strict";

  const createSerializedStorageStore = function (options = {}) {
    const storageGet = typeof options.storageGet === "function"
      ? options.storageGet
      : async () => ({});
    const storageSet = typeof options.storageSet === "function"
      ? options.storageSet
      : async () => {};
    const logger = typeof options.logger === "function"
      ? options.logger
      : () => {};
    const queues = new Map();

    const update = function (key, reducer) {
      if (typeof key !== "string" || typeof reducer !== "function") {
        return Promise.resolve(null);
      }

      const previous = queues.get(key) || Promise.resolve();
      const next = previous.then(async () => {
        const current = await storageGet(key);
        const nextValue = reducer(current?.[key]);
        if (typeof nextValue === "undefined") {
          return current?.[key] ?? null;
        }
        await storageSet({ [key]: nextValue });
        return nextValue;
      }).catch((error) => {
        logger("error", "[Ameow] Serialized storage update failed:", key, error);
        return null;
      });

      queues.set(key, next.catch(() => {}));
      return next;
    };

    const get = function (key) {
      return storageGet(key).then((current) => current?.[key] ?? null);
    };

    return {
      get,
      update,
    };
  };

  root.AmeowExtensionStore = {
    createSerializedStorageStore,
  };
})(typeof self !== "undefined" ? self : globalThis);
