// Ameow Browser Extension - Desktop Download Protocol
// Sender/correlation/response normalization for the desktop loopback
// WebSocket contract: `{ action, data }` requests with `data.requestId`
// correlation (plus `request_id` response aliases) and
// `{ success, message, data }` acknowledgement envelopes.
//
// This file is the single Desktop protocol boundary. It owns the raw
// WebSocket lifecycle (connect/replace/disconnect/reconnect), connection
// generation, request correlation, pending reset, envelope encoding and
// decoding, and Desktop-initiated command dispatch. Nothing outside this
// boundary may construct `new WebSocket`, use the loopback URL, or build a
// raw Desktop envelope. The legacy `createDesktopDownloadRequestClient`
// remains as a tested compatibility shim; feature code uses the client
// created by `createDesktopProtocolClient` through the named Desktop port.

(function () {
  'use strict';

  const WS_URL = 'ws://127.0.0.1:39527';
  const DEFAULT_RECONNECT_BASE_MS = 500;
  const DEFAULT_RECONNECT_MAX_MS = 5000;
  const DEFAULT_REQUEST_TIMEOUT_MS = 7000;
  const DEFAULT_CONNECT_TIMEOUT_MS = 500;
  const CONNECTING_STATUS_TEXT = 'Connecting';
  const OFFLINE_STATUS_TEXT = 'Offline';
  const OPEN_STATE = 1;
  const CONNECTING_STATE = 0;

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

  // ---------------------------------------------------------------------
  // Legacy compatibility client: pending correlation only. The socket
  // lifecycle lives in the Desktop protocol client below; this shim keeps
  // existing call sites and tests unchanged.
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Desktop protocol client: one owner of the socket generation and
  // pending correlation.
  //
  // Injected options:
  //   url                      loopback URL (defaults to the fixed endpoint)
  //   createSocket(url)        raw WebSocket factory (the only place a
  //                            socket is created; required)
  //   scheduleTimer / clearTimer   injectable timers (default setTimeout)
  //   scheduleReconnectAlarm / clearReconnectAlarm
  //                            optional Chrome alarms adapter owned by the
  //                            background composition root
  //   onOpen()                 injected post-connect bootstrap (theme,
  //                            language, preferences, debug config)
  //   onCommand(message)       injected Desktop-initiated command dispatcher
  //   now()                    injectable clock (default Date.now)
  //   logger(level, ...args)   injectable diagnostics (default console)
  //   reconnectBaseMs / reconnectMaxMs   backoff bounds
  // ---------------------------------------------------------------------

  const createDesktopProtocolClient = function (options = {}) {
    const url = typeof options.url === 'string' && options.url.trim() ? options.url : WS_URL;
    const createSocket = typeof options.createSocket === 'function'
      ? options.createSocket
      : () => new WebSocket(url);
    const scheduleTimer = typeof options.scheduleTimer === 'function'
      ? options.scheduleTimer
      : (callback, delayMs) => setTimeout(callback, delayMs);
    const clearTimer = typeof options.clearTimer === 'function'
      ? options.clearTimer
      : (handle) => clearTimeout(handle);
    const scheduleReconnectAlarm = typeof options.scheduleReconnectAlarm === 'function'
      ? options.scheduleReconnectAlarm
      : () => {};
    const clearReconnectAlarm = typeof options.clearReconnectAlarm === 'function'
      ? options.clearReconnectAlarm
      : () => {};
    const onOpen = typeof options.onOpen === 'function' ? options.onOpen : () => {};
    const onClose = typeof options.onClose === 'function' ? options.onClose : () => {};
    const onCommand = typeof options.onCommand === 'function' ? options.onCommand : () => {};
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const logger = typeof options.logger === 'function'
      ? options.logger
      : (level, ...args) => {
          const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
          method(...args);
        };
    const reconnectBaseMs = Number(options.reconnectBaseMs) > 0
      ? Number(options.reconnectBaseMs)
      : DEFAULT_RECONNECT_BASE_MS;
    const reconnectMaxMs = Number(options.reconnectMaxMs) > 0
      ? Number(options.reconnectMaxMs)
      : DEFAULT_RECONNECT_MAX_MS;
    const pollIntervalMs = Number(options.pollIntervalMs) > 0
      ? Number(options.pollIntervalMs)
      : 80;

    let currentSocket = null;
    let currentGeneration = 0;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastConnectionIssue = OFFLINE_STATUS_TEXT;
    const pendingRequests = new Map();
    const connectionListeners = new Set();
    let requestCounter = 0;

    const nextRequestId = function () {
      requestCounter += 1;
      return `req_${now()}_${requestCounter}`;
    };

    const isConnected = function () {
      return Boolean(currentSocket && currentSocket.readyState === OPEN_STATE);
    };

    const isConnecting = function () {
      return Boolean(currentSocket && currentSocket.readyState === CONNECTING_STATE);
    };

    const hasUnavailableIssue = function () {
      return lastConnectionIssue === OFFLINE_STATUS_TEXT;
    };

    const connectionState = function () {
      if (isConnected()) {
        return 'connected';
      }
      if (lastConnectionIssue === CONNECTING_STATUS_TEXT && !hasUnavailableIssue()) {
        return 'connecting';
      }
      return 'offline';
    };

    const connectionStatusText = function () {
      if (isConnected()) {
        return 'Connected';
      }
      if (isConnecting()) {
        if (hasUnavailableIssue()) {
          return lastConnectionIssue;
        }
        return lastConnectionIssue || CONNECTING_STATUS_TEXT;
      }
      if (reconnectTimer !== null) {
        return lastConnectionIssue || OFFLINE_STATUS_TEXT;
      }
      return lastConnectionIssue || OFFLINE_STATUS_TEXT;
    };

    const emitConnectionState = function () {
      const state = {
        connected: isConnected(),
        connecting: isConnecting() || reconnectTimer !== null,
        state: connectionState(),
        statusText: connectionStatusText(),
        generation: currentGeneration,
      };
      connectionListeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          logger('error', '[Ameow] Connection listener failed:', error);
        }
      });
    };

    const detachSocketHandlers = function (socket) {
      if (!socket) {
        return;
      }
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };

    const closeSocket = function (socket) {
      detachSocketHandlers(socket);
      try {
        const state = socket?.readyState;
        if (state === OPEN_STATE || state === CONNECTING_STATE) {
          socket.close();
        }
      } catch (error) {
        logger('warn', '[Ameow] Failed to close retired socket:', error);
      }
    };

    // Rejects every pending request exactly once with the given reason and
    // retires the socket. Used by forced replacement, disconnect, and close.
    const retireGeneration = function (reason) {
      for (const [requestId, pending] of pendingRequests.entries()) {
        clearTimer(pending.timer);
        pending.resolve(buildRequestFailure(reason, requestId));
      }
      pendingRequests.clear();

      if (currentSocket) {
        closeSocket(currentSocket);
        currentSocket = null;
      }
      currentGeneration += 1;
    };

    const clearReconnectTimer = function () {
      if (reconnectTimer !== null) {
        clearTimer(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = function () {
      if (reconnectTimer !== null) {
        return;
      }

      reconnectAttempts += 1;
      const delay = Math.min(
        reconnectBaseMs * Math.pow(1.5, reconnectAttempts),
        reconnectMaxMs,
      );
      scheduleReconnectAlarm(delay);
      reconnectTimer = scheduleTimer(() => {
        reconnectTimer = null;
        connect({ force: true });
      }, delay);
    };

    // An acknowledgement envelope matches the P3 wire shape
    // `{ success, message, data }` with a requestId correlation.
    const isAcknowledgementShape = function (message) {
      return Boolean(
        message
        && typeof message === 'object'
        && !Array.isArray(message)
        && typeof message.success === 'boolean'
        && typeof message.message === 'string',
      );
    };

    // Validates an inbound message that may be an acknowledgement envelope
    // for a pending request. Returns true when the message was consumed as
    // a response (matched, stale, duplicate, unknown-response, or
    // wrong-shape); returns false when it is a Desktop-initiated command.
    const tryConsumePendingResponse = function (message) {
      if (!isAcknowledgementShape(message)) {
        return false;
      }

      const requestId = message.data?.requestId || message.data?.request_id;

      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (!pending) {
        if (requestId) {
          // A response-shaped envelope without a matching pending request is
          // stale, duplicate, or spoofed: diagnose it, do not dispatch it.
          logger('warn', '[Ameow] Ignored response without a matching pending request:', requestId);
        }
        return true;
      }

      pendingRequests.delete(requestId);
      clearTimer(pending.timer);

      if (pending.generation !== currentGeneration) {
        logger('warn', '[Ameow] Ignored stale-generation response:', requestId);
        pending.resolve(buildRequestFailure('connection_reset', requestId));
        return true;
      }

      if (pending.expectedKind) {
        const kind = message.action || message.type || message.data?.action;
        if (kind && kind !== pending.expectedKind) {
          logger('warn', '[Ameow] Ignored response with an unexpected reply kind:', requestId);
          pending.resolve(buildRequestFailure('unexpected_response', requestId));
          return true;
        }
      }

      pending.resolve(message);
      return true;
    };

    // One inbound decoder: malformed input is diagnosed and never mutates
    // feature state; valid non-response messages are Desktop-initiated
    // commands dispatched to the injected application handler.
    const handleRawMessage = function (event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        logger('error', '[Ameow] Failed to parse message:', error);
        return;
      }

      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        logger('warn', '[Ameow] Ignored non-object message');
        return;
      }

      if (tryConsumePendingResponse(message)) {
        return;
      }
      onCommand(message);
    };

    const connect = function (options = {}) {
      const force = options.force === true;

      if (isConnected()) {
        return { connected: true, connecting: false };
      }

      if (isConnecting()) {
        if (!force) {
          return { connected: false, connecting: true };
        }
        // A stuck CONNECTING socket must not block replacement: retire the
        // generation (rejecting its pending requests) before a fresh socket.
        logger('warn', '[Ameow] Replacing stuck CONNECTING socket');
        retireGeneration('connection_reset');
      }

      if (reconnectTimer !== null) {
        if (!force) {
          return { connected: false, connecting: true };
        }
        clearReconnectTimer();
      }
      clearReconnectAlarm();

      if (currentSocket) {
        retireGeneration('connection_reset');
      }

      // The first attempt of a worker reports "Connecting"; later attempts
      // after a known outage keep the unavailable status text.
      if (reconnectAttempts === 0) {
        lastConnectionIssue = CONNECTING_STATUS_TEXT;
      }
      emitConnectionState();

      const socket = createSocket(url);
      const generation = currentGeneration + 1;
      currentGeneration = generation;
      currentSocket = socket;

      // Clearing handler properties is not enough: an event callback that
      // the runtime already dispatched keeps executing after replacement.
      // Every handler therefore re-checks that it belongs to the current
      // socket of the current generation before touching any state.
      const isCurrentSocket = function () {
        return socket === currentSocket && generation === currentGeneration;
      };

      socket.onopen = () => {
        if (!isCurrentSocket()) {
          return;
        }
        reconnectAttempts = 0;
        lastConnectionIssue = '';
        clearReconnectAlarm();
        emitConnectionState();
        onOpen();
      };

      socket.onmessage = (event) => {
        if (!isCurrentSocket()) {
          return;
        }
        handleRawMessage(event);
      };

      socket.onclose = () => {
        if (!isCurrentSocket()) {
          return;
        }
        onClose();
        retireGeneration('ws_closed');
        lastConnectionIssue = OFFLINE_STATUS_TEXT;
        emitConnectionState();
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!isCurrentSocket()) {
          return;
        }
        if (!isConnected()) {
          lastConnectionIssue = OFFLINE_STATUS_TEXT;
          logger('warn', '[Ameow] WebSocket unavailable. Open the Ameow desktop app to enable browser-extension features.');
          emitConnectionState();
          scheduleReconnect();
          return;
        }
        logger('error', '[Ameow] WebSocket error while connected.');
      };

      return { connected: false, connecting: true };
    };

    const request = function (action, data = {}, policy = {}) {
      const timeoutMs = Number(policy.timeoutMs) > 0
        ? Number(policy.timeoutMs)
        : DEFAULT_REQUEST_TIMEOUT_MS;
      const connectTimeoutMs = Number(policy.connectTimeoutMs) > 0
        ? Number(policy.connectTimeoutMs)
        : DEFAULT_CONNECT_TIMEOUT_MS;
      const forceConnect = policy.forceConnect === true;
      const expectedKind = typeof policy.expectedKind === 'string' ? policy.expectedKind : null;

      return connectAndWait(connectTimeoutMs, { force: forceConnect }).then((connected) => {
        if (!connected) {
          return buildRequestFailure('not_connected');
        }

        const generation = currentGeneration;
        const requestId = nextRequestId();
        const payload = {
          action,
          data: {
            ...data,
            requestId,
          },
        };

        return new Promise((resolve) => {
          const timer = scheduleTimer(() => {
            if (!pendingRequests.has(requestId)) {
              return;
            }
            pendingRequests.delete(requestId);
            resolve(buildRequestFailure('request_timeout', requestId));
          }, timeoutMs);

          pendingRequests.set(requestId, { resolve, timer, generation, expectedKind });

          try {
            currentSocket.send(JSON.stringify(payload));
          } catch (error) {
            clearTimer(timer);
            pendingRequests.delete(requestId);
            resolve(buildRequestFailure('send_failed', requestId));
          }
        });
      });
    };

    const connectAndWait = async function (timeoutMs, options = {}) {
      if (isConnected()) {
        return true;
      }

      connect({ force: options.force === true });
      const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
      while (now() < deadline) {
        if (isConnected()) {
          return true;
        }
        await new Promise((resolve) => {
          scheduleTimer(resolve, pollIntervalMs);
        });
      }
      return isConnected();
    };

    const sendNotification = function (action, data = {}) {
      if (!isConnected()) {
        connect({ force: true });
        return false;
      }

      try {
        currentSocket.send(JSON.stringify({ action, data }));
        return true;
      } catch (error) {
        logger('warn', '[Ameow] Failed to send notification:', error);
        return false;
      }
    };

    const disconnect = function (reason = 'ws_closed') {
      clearReconnectTimer();
      clearReconnectAlarm();
      reconnectAttempts = 0;
      retireGeneration(reason);
      lastConnectionIssue = OFFLINE_STATUS_TEXT;
      emitConnectionState();
    };

    const subscribeConnection = function (listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    };

    return {
      connect,
      connectAndWait,
      disconnect,
      request,
      sendNotification,
      subscribeConnection,
      isConnected,
      isConnecting,
      connectionState,
      connectionStatusText,
      getConnectionState() {
        return {
          connected: isConnected(),
          connecting: isConnecting() || reconnectTimer !== null,
          state: connectionState(),
          statusText: connectionStatusText(),
          generation: currentGeneration,
        };
      },
      handleRawMessage,
      // Retires the current socket without scheduling a reconnect. Used by
      // the proven-safe pre-send retry path after a `not_connected` or
      // synchronous `send_failed` result (no command was accepted).
      resetSocketForRetry() {
        clearReconnectTimer();
        clearReconnectAlarm();
        retireGeneration('send_failed');
        lastConnectionIssue = OFFLINE_STATUS_TEXT;
        emitConnectionState();
      },
    };
  };

  self.AmeowDesktopDownloadProtocol = {
    WS_URL,
    buildRequestFailure,
    createDesktopDownloadRequestClient,
    createDesktopProtocolClient,
  };
})();
