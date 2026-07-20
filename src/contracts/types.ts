export type HttpRequestInit = Omit<RequestInit, "method" | "body" | "headers">;

export type HttpQueryPrimitive = string | number | boolean;

export type HttpQueryValue = HttpQueryPrimitive | HttpQueryPrimitive[] | null | undefined;

export type HttpQueryParams = Record<string, HttpQueryValue>;

export type HttpRequestOptions = {
  headers?: HeadersInit;
  timeoutMs?: number;
  requestInit?: HttpRequestInit;
  suppressGlobalToast?: boolean;
};

export type HttpRequestConfig = {
  path: string;
  method?: string;
  query?: HttpQueryParams | URLSearchParams;
  json?: unknown;
  body?: BodyInit | null;
  options?: HttpRequestOptions;
};

export type HttpClientOptions = HttpRequestOptions & {
  prefixUrl: string | URL;
  fetchImpl?: typeof fetch;
  transport?: HttpTransport;
  interceptors?: HttpInterceptor[];
};

export type HttpInvokeContext = {
  url: string;
  init: RequestInit;
  request: HttpRequestConfig;
  options: HttpRequestOptions;
};

export type HttpInterceptor = {
  beforeRequest?: (context: HttpInvokeContext) => void | Promise<void>;
  afterResponse?: (response: Response, context: HttpInvokeContext) => void | Promise<void>;
  onError?: (error: unknown, context: HttpInvokeContext) => void | Promise<void>;
};

export type HttpTransportRequest = {
  url: string;
  init: RequestInit;
  method: string;
  headers: HeadersInit;
  body?: BodyInit | null;
  timeoutMs?: number;
  signal?: AbortSignal | null;
};

export type HttpTransportResponse = {
  status: number;
  statusText?: string;
  headers: Headers;
  body: Uint8Array | null;
  url: string;
};

export type HttpTransport = {
  request: (request: HttpTransportRequest) => Promise<HttpTransportResponse>;
  close?: () => Promise<void> | void;
};

export type HttpClient = {
  request: <TResponse = unknown>(request: HttpRequestConfig) => Promise<TResponse>;
  use: (interceptor: HttpInterceptor) => void;
};

export type VrpcClientInfo = {
  clientName: string;
  clientVersion: string;
  clientInstanceId: string;
};

export type VrpcTrace = {
  id: string;
  span?: string;
};

export type VrpcTraceMode = "portal" | "direct";

export type GetClientInstanceIdOptions = {
  key?: string;
};

export type VrpcWireSchema =
  | { kind: "value"; nullable?: boolean }
  | { kind: "binary"; nullable?: boolean }
  | { kind: "list"; value: VrpcWireSchema; nullable?: boolean }
  | {
      kind: "map";
      key: "int" | "string";
      value: VrpcWireSchema;
      nullable?: boolean;
    }
  | {
      kind: "object";
      fields:
        | Readonly<Record<string, VrpcWireSchema>>
        | (() => Readonly<Record<string, VrpcWireSchema>>);
      nullable?: boolean;
    };

export type VrpcMethodWireSpec = {
  arguments?: VrpcWireSchema;
  result?: VrpcWireSchema;
};

export type VrpcCborCodec = {
  encode: (value: unknown) => Uint8Array | Promise<Uint8Array>;
  decode: (bytes: Uint8Array) => unknown | Promise<unknown>;
};

export type VrpcResponseLike = {
  status: number;
  statusText?: string;
  headers?: Headers | HeadersInit | Record<string, unknown> | null;
  url?: string;
  method?: string;
};

export type ParsedVrpcSuccessResponse<TResponse = unknown> = {
  ok: true;
  status: number;
  statusText: string;
  vrpcStatus: "OK";
  headers: Headers;
  url: string;
  method: string;
  payload: unknown;
  result: TResponse;
  error: null;
};

export type ParsedVrpcErrorResponse = {
  ok: false;
  status: number;
  statusText: string;
  vrpcStatus: string | null;
  headers: Headers;
  url: string;
  method: string;
  payload: unknown;
  result: unknown;
  error: unknown;
};

export type ParsedVrpcResponse<TResponse = unknown> =
  | ParsedVrpcSuccessResponse<TResponse>
  | ParsedVrpcErrorResponse;

export interface VrpcRequestParams {
  [key: string]: unknown;
}

export type VrpcRequestInit = HttpRequestInit;

export interface VrpcRequestOptions extends HttpRequestOptions {
  trace?: VrpcTrace;
  wire?: VrpcMethodWireSpec;
}

export type VrpcClientOptions = Omit<HttpClientOptions, "interceptors" | "transport"> & {
  clientInfo: VrpcClientInfo;
  traceMode?: VrpcTraceMode;
  cborCodec?: VrpcCborCodec;
  transport?: VrpcTransport;
  interceptors?: VrpcInterceptor[];
};

export interface VrpcInvokeRequest {
  serviceName: string;
  methodName: string;
  params: VrpcRequestParams | null;
  options?: VrpcRequestOptions;
}

export type VrpcInvokeContext = {
  url: string;
  init: RequestInit;
  request: VrpcInvokeRequest;
  options: VrpcRequestOptions;
};

export type VrpcInterceptor = {
  beforeRequest?: (context: VrpcInvokeContext) => void | Promise<void>;
  afterResponse?: (response: Response, context: VrpcInvokeContext) => void | Promise<void>;
  onError?: (error: unknown, context: VrpcInvokeContext) => void | Promise<void>;
};

export type VrpcInterceptors = VrpcInterceptor;

export type VrpcTransportRequest = HttpTransportRequest;
export type VrpcTransportResponse = HttpTransportResponse;
export type VrpcTransport = HttpTransport;

export interface VrpcClient {
  invoke: <TResponse = unknown>(request: VrpcInvokeRequest) => Promise<TResponse>;
  use: (interceptor: VrpcInterceptor) => void;
}
