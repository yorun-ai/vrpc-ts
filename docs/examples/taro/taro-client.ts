// Application-owned example. This file is not a package runtime export.
import type Taro from "@tarojs/taro";
import type {
  VrpcClient,
  VrpcClientOptions,
  VrpcInterceptor,
  VrpcInvokeContext,
  VrpcInvokeRequest,
} from "@yorun-ai/vrpc/client";
import {
  buildVrpcHeaderRecord,
  buildVrpcPath,
  decodeVrpcResponseData,
  encodeVrpcRequestBody,
  generateVrpcId,
  generateVrpcSpan,
  mergeVrpcApplicationHeaders,
  normalizeVrpcHeaderRecord,
  VrpcResponseError,
  type VrpcResponseResult,
} from "@yorun-ai/vrpc/protocol";

import { createTaroTransport } from "./taro-transport";

export type TaroVrpcInterceptor = {
  beforeRequest?: VrpcInterceptor["beforeRequest"];
  afterResponse?: (
    response: VrpcResponseResult,
    context: VrpcInvokeContext,
  ) => void | Promise<void>;
  onError?: VrpcInterceptor["onError"];
};

export interface TaroVrpcClient extends VrpcClient {
  useData: (interceptor: TaroVrpcInterceptor) => void;
}

export type TaroVrpcClientOptions = Omit<
  VrpcClientOptions,
  "fetchImpl" | "transport" | "prefixUrl" | "interceptors"
> & {
  prefixUrl: string;
  interceptors?: TaroVrpcInterceptor[];
};

// Generated factories still accept this client. Taro response hooks and errors
// use plain protocol data; no Fetch objects or Fetch globals are installed.
export function createTaroVrpcClient(
  request: typeof Taro.request,
  options: TaroVrpcClientOptions,
): TaroVrpcClient {
  const transport = createTaroTransport(request);
  const interceptors = [...(options.interceptors ?? [])];
  const prefixUrl = options.prefixUrl.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(prefixUrl)) {
    throw new Error("prefixUrl must be an absolute HTTP(S) invoke URL without query or fragment");
  }

  async function invoke<T = unknown>(input: VrpcInvokeRequest): Promise<T> {
    const call = input.options ?? {};
    const timeoutMs = call.timeoutMs ?? options.timeoutMs ?? 15000;
    const wire = call.wire;
    if (wire && !wire.arguments && !wire.result) throw new Error("vRPC wire is empty");
    if (wire && !options.cborCodec)
      throw new Error("A cborCodec is required for vRPC wire methods");
    const trace = call.trace ?? {
      id: generateVrpcId(),
      ...(options.traceMode === "direct" ? { span: generateVrpcSpan() } : {}),
    };
    const headers = {
      ...mergeVrpcApplicationHeaders(headerRecord(options.headers), headerRecord(call.headers)),
      ...buildVrpcHeaderRecord({
        clientInfo: options.clientInfo,
        trace,
        timeoutMs,
        requestUsesCbor: Boolean(wire?.arguments),
        responseUsesCbor: Boolean(wire?.result),
      }),
    };
    const body = await encodeVrpcRequestBody(input.params, wire?.arguments, options.cborCodec);
    const requestInit = { ...options.requestInit, ...call.requestInit };
    const context: VrpcInvokeContext = {
      url: `${prefixUrl}/${buildVrpcPath(input.serviceName, input.methodName)}`,
      request: input,
      options: {
        ...call,
        headers,
        timeoutMs,
        trace,
        requestInit,
        suppressGlobalToast: call.suppressGlobalToast ?? options.suppressGlobalToast,
      },
      init: { ...requestInit, method: "POST", headers, body },
    };
    try {
      for (const interceptor of interceptors) await interceptor.beforeRequest?.(context);
      if (context.init.method !== "POST") throw new Error("vRPC only supports POST");
      const requestBody = context.init.body;
      if (
        requestBody != null &&
        typeof requestBody !== "string" &&
        !(requestBody instanceof ArrayBuffer)
      ) {
        throw new Error("Taro vRPC requests require a string or ArrayBuffer body");
      }
      const result = await transport.request({
        url: context.url,
        method: "POST",
        headers: headerRecord(context.init.headers ?? headers),
        body: requestBody ?? undefined,
        timeoutMs,
        signal: context.init.signal,
      });
      const parsed = await decodeVrpcResponseData<T>(
        {
          ...result,
          method: "POST",
          text: () => new TextDecoder().decode(result.body ?? new Uint8Array()),
          arrayBuffer: () => new Uint8Array(result.body ?? []).buffer,
        },
        { cborCodec: options.cborCodec, resultSchema: wire?.result },
      );
      for (const interceptor of interceptors) {
        await interceptor.afterResponse?.(parsed, context);
      }
      if (!parsed.ok) throw new VrpcResponseError("invoke", parsed, parsed.error);
      return parsed.result;
    } catch (error) {
      for (const interceptor of interceptors) await interceptor.onError?.(error, context);
      throw error;
    }
  }
  function use(interceptor: VrpcInterceptor) {
    if (interceptor.afterResponse) {
      throw new Error(
        "Taro does not provide Fetch Response hooks. Use useData({ afterResponse }) instead.",
      );
    }
    interceptors.push({ beforeRequest: interceptor.beforeRequest, onError: interceptor.onError });
  }
  return { invoke, use, useData: (interceptor) => void interceptors.push(interceptor) };
}

function headerRecord(input?: HeadersInit): Record<string, string> {
  if (!input) return {};
  if (Array.isArray(input)) {
    const values: Record<string, string[]> = Object.create(null);
    for (const [name, value] of input) (values[name.toLowerCase()] ??= []).push(value);
    return normalizeVrpcHeaderRecord(values);
  }
  if (typeof (input as Headers).forEach === "function") {
    const values: Record<string, string> = Object.create(null);
    (input as Headers).forEach((value, name) => {
      values[name] = value;
    });
    return normalizeVrpcHeaderRecord(values);
  }
  return normalizeVrpcHeaderRecord(input as Record<string, string>);
}
