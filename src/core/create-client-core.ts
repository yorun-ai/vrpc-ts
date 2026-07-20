import { HttpRequestInit, HttpTransport } from "../contracts/types";
import { createFetchTransport } from "../transports/fetch-transport";
import { parseResponsePayload } from "./http-utils";
import {
  runAfterResponseInterceptors,
  runBeforeRequestInterceptors,
  runOnErrorInterceptors,
} from "./interceptor-runner";
import { buildResponseFromTransportResult } from "./transport-response";

type BaseInvokeContext = {
  url: string;
  init: RequestInit;
};

type RequestOptionsLike = {
  headers?: HeadersInit;
  timeoutMs?: number;
  requestInit?: HttpRequestInit;
  suppressGlobalToast?: boolean;
};

type SplitRequestOptionsResult = {
  headers?: HeadersInit;
  timeoutMs?: number;
  requestInit: HttpRequestInit;
  suppressGlobalToast?: boolean;
};

type InterceptorLike<TContext> = {
  beforeRequest?: (context: TContext) => void | Promise<void>;
  afterResponse?: (response: Response, context: TContext) => void | Promise<void>;
  onError?: (error: unknown, context: TContext) => void | Promise<void>;
};

type PrepareRequestHelpers<
  TRequestOptions extends RequestOptionsLike,
  TSplitRequestOptionsResult extends SplitRequestOptionsResult,
> = {
  prefixUrl: string | URL;
  baseOptions: TSplitRequestOptionsResult;
  splitRequestOptions: (options?: TRequestOptions) => TSplitRequestOptionsResult;
};

type PreparedRequest<TContext extends BaseInvokeContext> = {
  context: TContext;
  timeoutMs?: number;
  fallbackMethod?: string;
  fallbackHeaders?: HeadersInit;
  fallbackBody?: BodyInit | null;
};

type RequestMeta = {
  method: string;
  url: string;
};

type CreateClientCoreOptions<
  TRequestOptions extends RequestOptionsLike,
  TSplitRequestOptionsResult extends SplitRequestOptionsResult,
  TRequestConfig,
  TContext extends BaseInvokeContext,
  TInterceptor extends InterceptorLike<TContext>,
> = {
  prefixUrl: string | URL;
  baseOptions?: TRequestOptions;
  fetchImpl?: typeof fetch;
  transport?: HttpTransport;
  interceptors?: TInterceptor[];
  splitRequestOptions: (options?: TRequestOptions) => TSplitRequestOptionsResult;
  prepareRequest: (
    request: TRequestConfig,
    helpers: PrepareRequestHelpers<TRequestOptions, TSplitRequestOptionsResult>,
  ) => PreparedRequest<TContext> | Promise<PreparedRequest<TContext>>;
  parseResponse?: (response: Response, context: TContext) => unknown | Promise<unknown>;
  assertResponse: (
    response: Response,
    payload: unknown,
    context: TContext,
    requestMeta: RequestMeta,
  ) => void | Promise<void>;
  validateRequest?: (context: TContext, requestMeta: RequestMeta) => void | Promise<void>;
};

export type ClientCore<TRequestConfig, TInterceptor> = {
  execute: <TResponse = unknown>(request: TRequestConfig) => Promise<TResponse>;
  use: (interceptor: TInterceptor) => void;
};

function resolveTransportBody(init: RequestInit, fallbackBody?: BodyInit | null) {
  if (init.body !== undefined) {
    return init.body as BodyInit | null;
  }
  return fallbackBody;
}

export function createClientCore<
  TRequestOptions extends RequestOptionsLike,
  TSplitRequestOptionsResult extends SplitRequestOptionsResult,
  TRequestConfig,
  TContext extends BaseInvokeContext,
  TInterceptor extends InterceptorLike<TContext>,
>(
  options: CreateClientCoreOptions<
    TRequestOptions,
    TSplitRequestOptionsResult,
    TRequestConfig,
    TContext,
    TInterceptor
  >,
): ClientCore<TRequestConfig, TInterceptor> {
  const {
    prefixUrl,
    baseOptions,
    fetchImpl,
    transport,
    interceptors: initInterceptors,
    splitRequestOptions,
    prepareRequest,
    parseResponse = parseResponsePayload,
    assertResponse,
    validateRequest,
  } = options;
  const splitBaseOptions = splitRequestOptions(baseOptions);
  const httpTransport = transport || createFetchTransport(fetchImpl);
  const interceptors = [...(initInterceptors || [])];

  async function execute<TResponse = unknown>(request: TRequestConfig): Promise<TResponse> {
    const prepared = await prepareRequest(request, {
      prefixUrl,
      baseOptions: splitBaseOptions,
      splitRequestOptions,
    });
    const context = prepared.context;

    try {
      await runBeforeRequestInterceptors(interceptors, context);

      const method = String(context.init.method || prepared.fallbackMethod || "GET").toUpperCase();
      const headers = (context.init.headers ||
        prepared.fallbackHeaders ||
        new Headers()) as HeadersInit;
      const requestMeta = {
        method,
        url: context.url,
      };
      await validateRequest?.(context, requestMeta);
      const result = await httpTransport.request({
        url: context.url,
        init: context.init,
        method,
        headers,
        body: resolveTransportBody(context.init, prepared.fallbackBody),
        timeoutMs: prepared.timeoutMs,
        signal: context.init.signal,
      });
      const response = buildResponseFromTransportResult(result);
      const payload = await parseResponse(response, context);
      await runAfterResponseInterceptors(interceptors, response, context);
      await assertResponse(response, payload, context, requestMeta);

      return payload as TResponse;
    } catch (error) {
      await runOnErrorInterceptors(interceptors, error, context);
      throw error;
    }
  }

  return {
    execute,
    use: (interceptor) => {
      interceptors.push(interceptor);
    },
  };
}
