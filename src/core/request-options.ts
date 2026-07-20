import {
  HttpRequestInit,
  HttpRequestOptions,
  VrpcMethodWireSpec,
  VrpcRequestOptions,
  VrpcTrace,
} from "../contracts/types";

export type SplitHttpRequestOptionsResult = {
  headers?: HeadersInit;
  timeoutMs?: number;
  suppressGlobalToast?: boolean;
  requestInit: HttpRequestInit;
};

export type SplitVrpcRequestOptionsResult = SplitHttpRequestOptionsResult & {
  trace?: VrpcTrace;
  wire?: VrpcMethodWireSpec;
};

export function splitHttpRequestOptions(
  options?: HttpRequestOptions | null,
): SplitHttpRequestOptionsResult {
  if (!options) {
    return { requestInit: {} };
  }

  const { headers, timeoutMs, suppressGlobalToast, requestInit } = options;
  return {
    headers,
    timeoutMs,
    suppressGlobalToast,
    requestInit: requestInit ?? {},
  };
}

export function splitVrpcRequestOptions(
  options?: VrpcRequestOptions | null,
): SplitVrpcRequestOptionsResult {
  if (!options) {
    return { requestInit: {} };
  }

  const { trace, wire } = options;
  return {
    ...splitHttpRequestOptions(options),
    trace,
    wire,
  };
}
