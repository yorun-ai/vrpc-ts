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

export type HttpClientErrorOptions = {
  cause?: unknown;
};

export type HttpAbortErrorOptions = HttpClientErrorOptions & {
  reason?: unknown;
};

export type HttpClientErrorKind = "invoke" | "timeout" | "abort" | "transport" | "protocol";

export const HTTP_TIMEOUT_ERROR_CODE = "HTTP_TIMEOUT" as const;
export const HTTP_ABORT_ERROR_CODE = "HTTP_ABORTED" as const;
export const HTTP_TRANSPORT_ERROR_CODE = "HTTP_TRANSPORT_ERROR" as const;
export const VRPC_PROTOCOL_ERROR_CODE = "VRPC_PROTOCOL_ERROR" as const;

export class HttpClientError<
  TKind extends HttpClientErrorKind = HttpClientErrorKind,
> extends Error {
  readonly isHttpClientError = true as const;
  readonly kind: TKind;
  readonly url: string;
  readonly method: string;

  constructor(
    message: string,
    kind: TKind,
    requestMeta: HttpErrorRequestMeta = {},
    options: HttpClientErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpClientError";
    this.kind = kind;
    this.url = requestMeta.url || "";
    this.method = requestMeta.method || "GET";
  }
}

export class HttpTimeoutError extends HttpClientError<"timeout"> {
  readonly code: typeof HTTP_TIMEOUT_ERROR_CODE;
  readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    requestMeta: HttpErrorRequestMeta = {},
    options: HttpClientErrorOptions = {},
  ) {
    super(`request timeout after ${timeoutMs}ms`, "timeout", requestMeta, options);
    this.name = "HttpTimeoutError";
    this.code = HTTP_TIMEOUT_ERROR_CODE;
    this.timeoutMs = timeoutMs;
  }
}

export class HttpAbortError extends HttpClientError<"abort"> {
  readonly code: typeof HTTP_ABORT_ERROR_CODE;
  readonly reason?: unknown;

  constructor(requestMeta: HttpErrorRequestMeta = {}, options: HttpAbortErrorOptions = {}) {
    super("request aborted", "abort", requestMeta, options);
    this.name = "HttpAbortError";
    this.code = HTTP_ABORT_ERROR_CODE;
    this.reason = options.reason;
  }
}

export class HttpTransportError extends HttpClientError<"transport"> {
  readonly code: typeof HTTP_TRANSPORT_ERROR_CODE;

  constructor(requestMeta: HttpErrorRequestMeta = {}, options: HttpClientErrorOptions = {}) {
    super("network request failed", "transport", requestMeta, options);
    this.name = "HttpTransportError";
    this.code = HTTP_TRANSPORT_ERROR_CODE;
  }
}

export class VrpcProtocolError extends HttpClientError<"protocol"> {
  readonly code: typeof VRPC_PROTOCOL_ERROR_CODE;
  readonly status: number;
  readonly statusText: string;
  readonly responseHeaders: Headers;
  readonly vrpcStatus: string | null;

  constructor(
    response: Response,
    message: string,
    requestMeta: HttpErrorRequestMeta = {},
    options: HttpClientErrorOptions = {},
  ) {
    super(
      message,
      "protocol",
      {
        url: requestMeta.url || response.url || "",
        method: requestMeta.method || "POST",
      },
      options,
    );
    this.name = "VrpcProtocolError";
    this.code = VRPC_PROTOCOL_ERROR_CODE;
    this.status = response.status;
    this.statusText = response.statusText;
    this.responseHeaders = response.headers;
    this.vrpcStatus = response.headers.get("vrpc-status");
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

export class HttpInvokeError extends HttpClientError<"invoke"> {
  type?: string;
  code?: string;
  reason?: string;
  detail?: string;
  status: number;
  statusText: string;
  responseHeaders: Headers;
  payload: unknown;

  constructor(
    response: Response,
    payload: unknown,
    requestMeta: HttpErrorRequestMeta = {},
    options: HttpClientErrorOptions = {},
  ) {
    const message = readServerErrorMessage(payload) || `request failed (status=${response.status})`;
    super(
      message,
      "invoke",
      {
        url: requestMeta.url || response.url || "",
        method: requestMeta.method || "GET",
      },
      options,
    );
    this.name = "HttpInvokeError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.responseHeaders = response.headers;
    this.payload = payload;
    this.type = readServerErrorStringField(payload, "type");
    this.code = readServerErrorStringField(payload, "code");
    this.reason = readServerErrorStringField(payload, "reason");
    this.detail = readServerErrorStringField(payload, "detail");
  }
}

export type VrpcErrorPayload = HttpErrorPayload;

export class VrpcInvokeError extends HttpInvokeError {
  vrpcStatus: string | null;

  constructor(
    response: Response,
    payload: unknown,
    requestMeta: HttpErrorRequestMeta = {},
    options: HttpClientErrorOptions = {},
  ) {
    super(response, payload, requestMeta, options);
    this.name = "VrpcInvokeError";
    this.vrpcStatus = response.headers.get("vrpc-status");
  }
}

export type HttpError = HttpAbortError | HttpInvokeError | HttpTimeoutError | HttpTransportError;

export type VrpcError =
  | HttpAbortError
  | HttpTimeoutError
  | HttpTransportError
  | VrpcInvokeError
  | VrpcProtocolError;

function hasHttpClientErrorBrand(error: unknown): error is HttpClientError {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { isHttpClientError?: unknown }).isHttpClientError === true,
  );
}

export function isHttpError(error: unknown): error is HttpError {
  if (!hasHttpClientErrorBrand(error)) {
    return false;
  }

  const candidate = error as HttpClientError & {
    code?: unknown;
    payload?: unknown;
    status?: unknown;
    timeoutMs?: unknown;
  };
  switch (candidate.kind) {
    case "abort":
      return candidate.code === HTTP_ABORT_ERROR_CODE;
    case "timeout":
      return candidate.code === HTTP_TIMEOUT_ERROR_CODE && typeof candidate.timeoutMs === "number";
    case "transport":
      return candidate.code === HTTP_TRANSPORT_ERROR_CODE;
    case "invoke":
      return typeof candidate.status === "number" && "payload" in candidate;
    default:
      return false;
  }
}

export function isVrpcError(error: unknown): error is VrpcError {
  if (!hasHttpClientErrorBrand(error)) {
    return false;
  }

  const candidate = error as HttpClientError & {
    code?: unknown;
    status?: unknown;
    timeoutMs?: unknown;
    vrpcStatus?: unknown;
  };
  switch (candidate.kind) {
    case "abort":
      return candidate.code === HTTP_ABORT_ERROR_CODE;
    case "timeout":
      return candidate.code === HTTP_TIMEOUT_ERROR_CODE && typeof candidate.timeoutMs === "number";
    case "transport":
      return candidate.code === HTTP_TRANSPORT_ERROR_CODE;
    case "protocol":
      return candidate.code === VRPC_PROTOCOL_ERROR_CODE && typeof candidate.status === "number";
    case "invoke":
      return typeof candidate.status === "number" && "vrpcStatus" in candidate;
    default:
      return false;
  }
}

export function isAbortErrorLike(error: unknown): boolean {
  if (!error || typeof error !== "object" || error instanceof HttpTimeoutError) {
    return false;
  }

  const candidate = error as {
    kind?: unknown;
    name?: unknown;
    code?: unknown;
    __CANCEL__?: unknown;
  };
  return (
    candidate.kind === "abort" ||
    candidate.name === "HttpAbortError" ||
    candidate.name === "AbortError" ||
    candidate.code === HTTP_ABORT_ERROR_CODE ||
    candidate.code === "ABORT_ERR" ||
    candidate.code === "ERR_CANCELED" ||
    candidate.__CANCEL__ === true
  );
}
