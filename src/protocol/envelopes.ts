/**
 * Transport envelope decoders shared by electron/main.mts. Both transports
 * treat their root frame as untrusted: the IPC envelope must be an object
 * with a non-blank string command; the WS root must be an object with a
 * non-blank string action. Main uses exactly these decoders, so envelope
 * validation is unit-testable without booting Electron.
 */

export type IpcRequestEnvelope = {
  command: string;
  payload: unknown;
};

export const decodeIpcRequestEnvelope = (request: unknown): IpcRequestEnvelope => {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid IPC request envelope");
  }
  const command = (request as Record<string, unknown>).command;
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error("Invalid IPC request envelope");
  }
  return {
    command,
    payload: (request as Record<string, unknown>).payload,
  };
};

export type DecodedWsEnvelope =
  | {
    ok: true;
    action: string;
    data: unknown;
    requestId: string | null;
  }
  | {
    ok: false;
    failure: { success: false; message: string; data: null };
  };

const extractRequestId = (data: unknown): string | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.requestId === "string") {
    return record.requestId;
  }
  if (typeof record.request_id === "string") {
    return record.request_id;
  }
  return null;
};

export const decodeWsRootEnvelope = (parsed: unknown): DecodedWsEnvelope => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, failure: { success: false, message: "Invalid request", data: null } };
  }
  const action = (parsed as Record<string, unknown>).action;
  if (typeof action !== "string" || action.trim() === "") {
    return { ok: false, failure: { success: false, message: "Invalid request", data: null } };
  }
  const data = (parsed as Record<string, unknown>).data ?? null;
  return { ok: true, action, data, requestId: extractRequestId(data) };
};
