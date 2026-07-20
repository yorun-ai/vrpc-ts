import { HttpInvokeError } from "../contracts/errors";
import {
  HttpClient,
  HttpClientOptions,
  HttpInvokeContext,
  HttpRequestConfig,
  HttpRequestOptions,
} from "../contracts/types";
import { createClientCore } from "./create-client-core";
import { appendQueryToUrl, buildRequestUrl, mergeHeaders } from "./http-utils";
import { splitHttpRequestOptions, SplitHttpRequestOptionsResult } from "./request-options";

function resolveJsonBody(request: HttpRequestConfig) {
  if (request.json !== undefined && request.body !== undefined) {
    throw new Error("Request json and body cannot be used together.");
  }

  if (request.json !== undefined) {
    return JSON.stringify(request.json);
  }

  return request.body;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { prefixUrl, fetchImpl, transport, interceptors, ...baseOptions } = options;
  const core = createClientCore<
    HttpRequestOptions,
    SplitHttpRequestOptionsResult,
    HttpRequestConfig,
    HttpInvokeContext,
    NonNullable<HttpClientOptions["interceptors"]>[number]
  >({
    prefixUrl,
    baseOptions,
    fetchImpl,
    transport,
    interceptors,
    splitRequestOptions: splitHttpRequestOptions,
    prepareRequest: (request, helpers) => {
      const requestOptions = helpers.splitRequestOptions(request.options);
      const method = String(request.method || "GET").toUpperCase();
      const url = appendQueryToUrl(buildRequestUrl(helpers.prefixUrl, request.path), request.query);
      const finalHeaders = mergeHeaders(helpers.baseOptions.headers, requestOptions.headers);
      const body = resolveJsonBody(request);
      if (request.json !== undefined && !finalHeaders.has("content-type")) {
        finalHeaders.set("content-type", "application/json");
      }

      const resolvedRequestInit = {
        ...helpers.baseOptions.requestInit,
        ...requestOptions.requestInit,
      };
      const timeoutMs = requestOptions.timeoutMs ?? helpers.baseOptions.timeoutMs;
      const suppressGlobalToast =
        requestOptions.suppressGlobalToast ?? helpers.baseOptions.suppressGlobalToast;
      const resolvedOptions: HttpRequestOptions = {
        headers: finalHeaders,
        timeoutMs,
        requestInit: resolvedRequestInit,
        suppressGlobalToast,
      };
      const init: RequestInit = {
        ...resolvedRequestInit,
        method,
        headers: finalHeaders,
      };
      if (body !== undefined) {
        init.body = body;
      }

      return {
        timeoutMs,
        fallbackMethod: method,
        fallbackHeaders: finalHeaders,
        fallbackBody: body,
        context: {
          url,
          init,
          request,
          options: resolvedOptions,
        },
      };
    },
    assertResponse: (response, payload, _context, requestMeta) => {
      if (!response.ok) {
        throw new HttpInvokeError(response, payload, requestMeta);
      }
    },
  });

  return {
    request: core.execute,
    use: core.use,
  };
}
