// Ameow Browser Extension - Desktop Download Protocol
// Sender/correlation/response normalization for the desktop loopback
// WebSocket contract: `{ action, data }` requests with `data.requestId`
// correlation (plus `request_id` response aliases) and
// `{ success, message, data }` acknowledgement envelopes.
// No UI/state architecture lives here; the client is a plain registry.

(function () {
  'use strict';

  const buildRequestFailure = function (code, requestId = null) {
    const data = { code };
    if (requestId) {
      data.requestId = requestId;
    }

    return {
      success: false,
      message: code,
      data,
    };
  };

  const createDesktopDownloadRequestClient = function (options) {
    const pendingRequests = new Map();
    let requestCounter = 0;

    const nextRequestId = function () {
      requestCounter += 1;
      return `req_${Date.now()}_${requestCounter}`;
    };

    const sendWhenConnected = function (action, data, timeoutMs) {
      if (!options.isConnected()) {
        return Promise.resolve(buildRequestFailure('not_connected'));
      }

      const requestId = nextRequestId();
      const payload = {
        action,
        data: {
          ...data,
          requestId,
        },
      };

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!pendingRequests.has(requestId)) {
            return;
          }
          pendingRequests.delete(requestId);
          resolve(buildRequestFailure('request_timeout', requestId));
        }, timeoutMs);

        pendingRequests.set(requestId, { resolve, timer });

        try {
          options.send(payload);
        } catch (error) {
          clearTimeout(timer);
          pendingRequests.delete(requestId);
          resolve(buildRequestFailure('send_failed', requestId));
        }
      });
    };

    return {
      nextRequestId,

      async sendRequest(action, data = {}, timeoutMs = 7000, requestOptions = {}) {
        const connectTimeoutMs = typeof requestOptions.connectTimeoutMs === 'number'
          ? requestOptions.connectTimeoutMs
          : 500;
        const forceConnect = requestOptions.forceConnect === true;

        if (!options.isConnected()) {
          const connected = await options.ensureConnection(connectTimeoutMs, { force: forceConnect });
          if (!connected) {
            return buildRequestFailure('not_connected');
          }
        }

        return await sendWhenConnected(action, data, timeoutMs);
      },

      handlePendingResponse(message) {
        const requestId = message?.data?.requestId || message?.data?.request_id;
        if (!requestId) {
          return false;
        }

        const pending = pendingRequests.get(requestId);
        if (!pending) {
          return false;
        }

        pendingRequests.delete(requestId);
        clearTimeout(pending.timer);
        pending.resolve(message);
        return true;
      },

      rejectPending(reason) {
        for (const [requestId, pending] of pendingRequests.entries()) {
          clearTimeout(pending.timer);
          pending.resolve(buildRequestFailure(reason, requestId));
        }
        pendingRequests.clear();
      },
    };
  };

  self.AmeowDesktopDownloadProtocol = {
    buildRequestFailure,
    createDesktopDownloadRequestClient,
  };
})();
