# API Reference

Public exports of the published `@yorun-ai/vrpc` package. For task-oriented
guidance, start with the [Usage guide](../guides/usage.md); for wire-level
details, see the [vRPC protocol](../maintainers/protocol.md).

Everything listed here is exported from `src/entrypoints/`. Anything not listed
is internal and may change in any release.

## Package entry points

| Import                  | Contents                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| `@yorun-ai/vrpc`        | Identical to `@yorun-ai/vrpc/client`.                                    |
| `@yorun-ai/vrpc/client` | vRPC client, protocol helpers, id helpers, transport, errors, and types. |
| `@yorun-ai/vrpc/http`   | Generic HTTP client, Fetch transport, HTTP errors, and HTTP types.       |

Each entry point publishes an ESM build (`import`), a CommonJS build
(`require`), and matching type declarations.

## Client factories

### `createVrpcClient(options)`

```ts
function createVrpcClient(options: VrpcClientOptions): VrpcClient;
```

| Option                | Type                                                 | Default         | Notes                                                                         |
| --------------------- | ---------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `prefixUrl`           | `string \| URL`                                      | required        | Base URL. The runtime appends `/<serviceName>/<methodName>`.                  |
| `clientInfo`          | `VrpcClientInfo`                                     | required        | Sent as `vrpc-client`; see the validation rules below.                        |
| `traceMode`           | `"portal" \| "direct"`                               | `"portal"`      | Controls only the generated `vrpc-trace` header.                              |
| `cborCodec`           | `VrpcCborCodec`                                      | —               | Required when a request supplies `options.wire`.                              |
| `headers`             | `HeadersInit`                                        | —               | Cannot override `accept`, `content-type`, or any `vrpc-*` header.             |
| `timeoutMs`           | `number`                                             | —               | Client default for the local timer and `vrpc-options`. Disabled when omitted. |
| `requestInit`         | `Omit<RequestInit, "method" \| "body" \| "headers">` | —               | Merged per request.                                                           |
| `suppressGlobalToast` | `boolean`                                            | —               | Interceptor-only metadata; a per-request value overrides it.                  |
| `fetchImpl`           | `typeof fetch`                                       | global `fetch`  | Custom Fetch implementation for the built-in transport.                       |
| `transport`           | `VrpcTransport`                                      | Fetch transport | Replaces the built-in transport.                                              |
| `interceptors`        | `VrpcInterceptor[]`                                  | `[]`            | Same as calling `client.use()` for each entry.                                |

`VrpcClientInfo` fields are validated before the request is sent:

- `clientName`: lower-case dot-separated identifier, for example `demo.browser`.
- `clientVersion`: valid SemVer, for example `1.0.0`.
- `clientInstanceId`: UUID, for example from `getClientInstanceId()`.

### `client.invoke(request)`

```ts
client.invoke<TResponse = unknown>(request: VrpcInvokeRequest): Promise<TResponse>;
```

`VrpcInvokeRequest`:

| Field         | Type                              | Notes                                                           |
| ------------- | --------------------------------- | --------------------------------------------------------------- |
| `serviceName` | `string`                          | Encoded into the request path.                                  |
| `methodName`  | `string`                          | Encoded into the request path.                                  |
| `params`      | `Record<string, unknown> \| null` | Required. Both `null` and `{}` are accepted for no-arg methods. |
| `options`     | `VrpcRequestOptions`              | Optional per-request overrides.                                 |

The returned promise resolves to the envelope `result` and rejects with a
`VrpcError` (or an ordinary developer error for invalid configuration). vRPC
always uses `POST`.

### `createHttpClient(options)`

```ts
function createHttpClient(options: HttpClientOptions): HttpClient;
```

| Option                | Type                                                 | Default         | Notes                                                                                 |
| --------------------- | ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `prefixUrl`           | `string \| URL`                                      | required        | Base URL for relative request paths.                                                  |
| `allowAbsoluteUrls`   | `boolean`                                            | `false`         | Allows absolute `http:`/`https:` request paths. Protocol-relative URLs stay rejected. |
| `headers`             | `HeadersInit`                                        | —               | Merged with per-request headers.                                                      |
| `timeoutMs`           | `number`                                             | —               | Disabled when omitted.                                                                |
| `requestInit`         | `Omit<RequestInit, "method" \| "body" \| "headers">` | —               | Merged per request.                                                                   |
| `suppressGlobalToast` | `boolean`                                            | —               | Interceptor-only metadata.                                                            |
| `fetchImpl`           | `typeof fetch`                                       | global `fetch`  |                                                                                       |
| `transport`           | `HttpTransport`                                      | Fetch transport |                                                                                       |
| `interceptors`        | `HttpInterceptor[]`                                  | `[]`            |                                                                                       |

### `client.request(config)`

```ts
client.request<TResponse = unknown>(config: HttpRequestConfig): Promise<TResponse>;
```

| Field     | Type                                 | Notes                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------- |
| `path`    | `string`                             | Required. Relative to `prefixUrl` unless absolute URLs are allowed. |
| `method`  | `string`                             | Defaults to `GET`.                                                  |
| `query`   | `HttpQueryParams \| URLSearchParams` | Appended to the URL. `null` and `undefined` values are skipped.     |
| `json`    | `unknown`                            | Serialized body; sets `content-type: application/json` when unset.  |
| `body`    | `BodyInit \| null`                   | Raw body, for example `FormData` or `URLSearchParams`.              |
| `options` | `HttpRequestOptions`                 | Per-request overrides.                                              |

`json` and `body` are mutually exclusive. Response parsing is independent of
`content-type`: an empty body resolves to `null`, valid JSON is decoded, and any
other body resolves to text.

## Request options

`HttpRequestOptions` is the base shape; `VrpcRequestOptions` extends it.

| Field                 | Type                                                 | Applies to | Notes                                                           |
| --------------------- | ---------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `headers`             | `HeadersInit`                                        | both       | Merged over client defaults.                                    |
| `timeoutMs`           | `number`                                             | both       | Overrides the client default.                                   |
| `requestInit`         | `Omit<RequestInit, "method" \| "body" \| "headers">` | both       | Shallow-merged over the client default.                         |
| `suppressGlobalToast` | `boolean`                                            | both       | Read by application interceptors; the runtime never touches UI. |
| `trace`               | `{ id: string; span?: string }`                      | vRPC       | Replaces the generated trace.                                   |
| `wire`                | `VrpcMethodWireSpec`                                 | vRPC       | Selects JSON or CBOR. Never sent on the wire.                   |

Create-time scalar values and `requestInit` fields are overridden by
per-request values. `context.options` always contains the merged result.

## Interceptors

```ts
type VrpcInterceptor = {
  beforeRequest?: (context: VrpcInvokeContext) => void | Promise<void>;
  afterResponse?: (response: Response, context: VrpcInvokeContext) => void | Promise<void>;
  onError?: (error: unknown, context: VrpcInvokeContext) => void | Promise<void>;
};

type VrpcInvokeContext = {
  url: string;
  init: RequestInit;
  request: VrpcInvokeRequest;
  options: VrpcRequestOptions;
};
```

`HttpInterceptor` and `HttpInvokeContext` have the same shape with
`HttpRequestConfig` / `HttpRequestOptions`. Register an interceptor with
`client.use(interceptor)`.

- `options` is the merged configuration, including resolved headers, timeout,
  trace, and `suppressGlobalToast`.
- `request` is the original call shape and `init` is the resolved `RequestInit`.
- `onError` completes before the request promise rejects. Returning normally
  does not swallow the error.
- Request-construction failures that occur before a context exists reject
  directly and never reach an interceptor.

## Errors

Use the guard for your client, then branch on `kind`:

```ts
isVrpcError(error): error is VrpcError;
isHttpError(error): error is HttpError;
```

| `kind`      | Class                | Entry point | Extra fields                                                                             |
| ----------- | -------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `abort`     | `HttpAbortError`     | both        | `reason` (the `AbortSignal` reason), `url`, `method`, `cause`                            |
| `timeout`   | `HttpTimeoutError`   | both        | `timeoutMs`, `code: "HTTP_TIMEOUT"`, `url`, `method`, `cause`                            |
| `transport` | `HttpTransportError` | both        | `url`, `method`, `cause`                                                                 |
| `invoke`    | `HttpInvokeError`    | both        | `status`, `statusText`, `responseHeaders`, `payload`, `type`, `code`, `reason`, `detail` |
| `invoke`    | `VrpcInvokeError`    | vRPC        | All `HttpInvokeError` fields plus `vrpcStatus`                                           |
| `protocol`  | `VrpcProtocolError`  | vRPC only   | `status`, `statusText`, `responseHeaders`, `vrpcStatus`                                  |

`HttpError` is `HttpAbortError | HttpTimeoutError | HttpTransportError |
HttpInvokeError`. `VrpcError` adds `VrpcInvokeError` and `VrpcProtocolError`;
`isHttpError` does not accept a `VrpcProtocolError`.

`VrpcInvokeError.message` combines the server `message` and `detail` fields with
a newline. Use `vrpcStatus` for the protocol outcome and `code` plus `reason`
for business branching; do not parse `message`. Error classes remain exported
for advanced use, but application policy normally needs only the guard and
`kind`.

## Protocol helpers

Exported from `@yorun-ai/vrpc` and `@yorun-ai/vrpc/client`:

| Export                      | Signature                                                                        |
| --------------------------- | -------------------------------------------------------------------------------- |
| `buildVrpcPath`             | `(serviceName: string, methodName: string) => string`                            |
| `buildVrpcRequestBody`      | `(params: Record<string, unknown> \| null \| undefined) => string`               |
| `encodeVrpcRequestBody`     | `(params, schema, cborCodec) => Promise<string \| ArrayBuffer>`                  |
| `buildVrpcHeaders`          | `(options: BuildVrpcHeadersOptions) => Headers`                                  |
| `decodeVrpcResponsePayload` | `(response: Response, cborCodec, resultSchema) => Promise<unknown>`              |
| `parseVrpcResponse`         | `<T>(responseLike: VrpcResponseLike, payload: unknown) => ParsedVrpcResponse<T>` |
| `unwrapVrpcResponse`        | `<T>(responseLike: VrpcResponseLike, payload: unknown) => T`                     |
| `generateVrpcId`            | `() => string` (32 lowercase hex characters)                                     |
| `generateVrpcSpan`          | `() => string` (16 lowercase hex characters)                                     |
| `generateClientInstanceId`  | `() => string` (lowercase UUID)                                                  |
| `getClientInstanceId`       | `(options?: { key?: string }) => string`                                         |
| `createFetchTransport`      | `(fetchImpl?: typeof fetch) => HttpTransport`                                    |

Constants and stores:

| Export                                   | Value                       |
| ---------------------------------------- | --------------------------- |
| `VRPC_JSON_CONTENT_TYPE`                 | `"application/vrpc+json"`   |
| `VRPC_CBOR_CONTENT_TYPE`                 | `"application/vrpc+cbor"`   |
| `HTTP_TIMEOUT_ERROR_CODE`                | `"HTTP_TIMEOUT"`            |
| `DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY` | `"vrpc-client-instance-id"` |

`BuildVrpcHeadersOptions` is `{ clientInfo, trace, timeoutMs?, requestUsesCbor?,
responseUsesCbor? }`. `parseVrpcResponse` never throws and returns a
discriminated result; `unwrapVrpcResponse` throws `VrpcInvokeError` for a
non-OK response. `getClientInstanceId` reads and writes `localStorage`, and
falls back to a fresh id when storage is unavailable.

## Types

Exported from `@yorun-ai/vrpc` and `@yorun-ai/vrpc/client`:

| Type                                                                                             | Purpose                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------- |
| `VrpcClient`, `VrpcInvokeRequest`, `VrpcClientOptions`                                           | vRPC client contracts.          |
| `VrpcRequestOptions`, `VrpcRequestInit`                                                          | vRPC request configuration.     |
| `VrpcInvokeContext`, `VrpcInterceptor`, `VrpcInterceptors`                                       | Interceptor contracts.          |
| `VrpcClientInfo`, `VrpcTrace`, `VrpcTraceMode`                                                   | Client identity and tracing.    |
| `VrpcWireSchema`, `VrpcMethodWireSpec`, `VrpcCborCodec`                                          | JSON/CBOR wire selection.       |
| `VrpcResponseLike`, `ParsedVrpcResponse`, `ParsedVrpcSuccessResponse`, `ParsedVrpcErrorResponse` | Response helpers.               |
| `VrpcTransport`, `VrpcTransportRequest`, `VrpcTransportResponse`                                 | Custom transport contracts.     |
| `VrpcError`, `VrpcErrorPayload`, `HttpClientErrorKind`                                           | Error unions and payload shape. |
| `GetClientInstanceIdOptions`, `BuildVrpcHeadersOptions`                                          | Helper options.                 |

`@yorun-ai/vrpc/http` exports the HTTP subset: `HttpClient`,
`HttpRequestConfig`, `HttpClientOptions`, `HttpRequestOptions`, `HttpRequestInit`,
`HttpQueryParams`, `HttpQueryValue`, `HttpQueryPrimitive`, `HttpInvokeContext`,
`HttpInterceptor`, `HttpTransport`, `HttpTransportRequest`,
`HttpTransportResponse`, `HttpError`, `HttpErrorPayload`,
`HttpErrorRequestMeta`, `HttpClientErrorOptions`, `HttpAbortErrorOptions`, and
`HttpClientErrorKind`.

## Stability

The package is in the `0.x` line. The public API is not yet covered by a stable
`1.x` compatibility commitment, and a breaking change may ship in a new `0.x`
minor release with migration guidance.
