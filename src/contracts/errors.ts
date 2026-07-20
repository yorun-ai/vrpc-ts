export type HttpErrorPayload = {
  type?: string;
  code?: string;
  message?: string;
  reason?: string;
  detail?: string;
};

export type HttpErrorRequestMeta = {
  url?: string;
  method?: string;
};

export const HTTP_TIMEOUT_ERROR_CODE = "HTTP_TIMEOUT" as const;

export class HttpTimeoutError extends Error {
  code: typeof HTTP_TIMEOUT_ERROR_CODE;
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`request timeout after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
    this.code = HTTP_TIMEOUT_ERROR_CODE;
    this.timeoutMs = timeoutMs;
  }
}

function readServerErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const body = payload as HttpErrorPayload;
  if (typeof body.message !== "string" || !body.message.trim()) {
    return undefined;
  }
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";
  return detail ? `${body.message}\n${detail}` : body.message;
}

function readServerErrorStringField(payload: unknown, field: keyof HttpErrorPayload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const value = (payload as HttpErrorPayload)[field];
  return typeof value === "string" ? value : undefined;
}

export class HttpInvokeError extends Error {
  type?: string;
  code?: string;
  reason?: string;
  detail?: string;
  status: number;
  statusText: string;
  responseHeaders: Headers;
  payload: unknown;
  url: string;
  method: string;

  constructor(response: Response, payload: unknown, requestMeta: HttpErrorRequestMeta = {}) {
    const message = readServerErrorMessage(payload) || `request failed (status=${response.status})`;
    super(message);
    this.name = "HttpInvokeError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.responseHeaders = response.headers;
    this.payload = payload;
    this.type = readServerErrorStringField(payload, "type");
    this.code = readServerErrorStringField(payload, "code");
    this.reason = readServerErrorStringField(payload, "reason");
    this.detail = readServerErrorStringField(payload, "detail");
    this.url = requestMeta.url || response.url || "";
    this.method = requestMeta.method || "GET";
  }
}

export type VrpcErrorPayload = HttpErrorPayload;

export class VrpcInvokeError extends HttpInvokeError {
  vrpcStatus: string | null;

  constructor(response: Response, payload: unknown, requestMeta: HttpErrorRequestMeta = {}) {
    super(response, payload, requestMeta);
    this.name = "VrpcInvokeError";
    const vrpcStatus = response.headers.get("vrpc-status");
    this.vrpcStatus = vrpcStatus;
  }
}
