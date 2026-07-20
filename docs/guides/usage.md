# Usage

## 1. Generic HTTP client

```ts
import { HttpInvokeError, HttpTimeoutError, createHttpClient } from "@yorun-ai/vrpc/http";

const client = createHttpClient({
  prefixUrl: "https://api.example.com",
  timeoutMs: 5_000,
  suppressGlobalToast: false,
  requestInit: {
    credentials: "omit",
  },
});

client.use({
  beforeRequest(context) {
    console.log(context.url, context.init.method);
  },
  onError(error, context) {
    if (context.options.suppressGlobalToast) {
      return;
    }
    console.error(error);
  },
});

const profile = await client.request<{ id: number; name: string }>({
  path: "/users/me",
  query: {
    withProfile: true,
    lang: "zh-CN",
  },
  options: {
    timeoutMs: 3_000,
    suppressGlobalToast: true,
  },
});

await client.request({
  path: "/users",
  method: "POST",
  json: { name: "Vine" },
});
```

Request shape:

```ts
client.request({
  path: string,
  method?: string,
  query?: HttpQueryParams | URLSearchParams,
  json?: unknown,
  body?: BodyInit | null,
  options?: {
    headers?: HeadersInit,
    timeoutMs?: number,
    requestInit?: Omit<RequestInit, "method" | "body" | "headers">,
    suppressGlobalToast?: boolean,
  },
});
```

- `json` and `body` are mutually exclusive.
- `json` is serialized automatically and adds `content-type: application/json`.
- Pass `FormData` through `body`; do not set its content-type boundary manually.
- Create-time defaults are merged with per-request options; per-request scalar and requestInit fields take precedence.
- An interceptor receives merged configuration in `context.options` and the original call shape in `context.request`.
- Options do not leak into the transport request.
- `timeoutMs` is disabled by default. Set an application default at creation and override it per request when needed.
- The default is `credentials: "omit"`; use `requestInit.credentials: "include"` for cookies.
- An empty body returns `null`; a timeout throws `HttpTimeoutError`; a non-2xx response throws `HttpInvokeError`.

## 2. vRPC client

```ts
import { VrpcInvokeError, createVrpcClient, getClientInstanceId } from "@yorun-ai/vrpc/client";

const client = createVrpcClient({
  prefixUrl: "https://api.example.com/invoke",
  timeoutMs: 15_000,
  suppressGlobalToast: false,
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: getClientInstanceId(),
  },
});

client.use({
  onError(error, context) {
    if (context.options.suppressGlobalToast) {
      return;
    }

    if (error instanceof VrpcInvokeError) {
      console.error(error.status, error.vrpcStatus, error.code, error.reason);
    }
  },
});

const user = await client.invoke<{ id: number }>({
  serviceName: "user.UserService",
  methodName: "getUser",
  params: { userId: 1 },
  options: {
    timeoutMs: 3_000,
    headers: { "x-env": "dev" },
    suppressGlobalToast: true,
  },
});

await client.invoke({
  serviceName: "user.UserService",
  methodName: "ping",
  params: null,
});
```

vRPC always uses POST. Methods with arguments use a parameter object; argument-free methods accept `null` or `{}`. `options` is optional.

### Trace and timeout

`traceMode` controls only the shape of the automatically generated `vrpc-trace` header. It does not select a route, change `prefixUrl`, or decide whether the request passes through Portal. The target is always determined by `prefixUrl`.

For requests through Vine Portal, use the default `"portal"` mode. The runtime generates only a trace id:

```text
vrpc-trace: id=<32hex>
```

For a direct connection to a vRPC service, set `traceMode: "direct"`. The runtime generates both a trace id and a span:

```ts
const directClient = createVrpcClient({
  prefixUrl: "https://service.example.com/rpc/invoke",
  traceMode: "direct",
  clientInfo,
});
```

```text
vrpc-trace: id=<32hex>,span=<16hex>
```

An explicit per-call `options.trace` completely overrides the generated value and is suitable for propagating an upstream trace. Direct calls should provide both id and span:

```ts
options: {
  trace: {
    id: "123e4567e89b12d3a456426614174000",
    span: "1234567890abcdef",
  },
}
```

`timeoutMs` is disabled by default. Setting `timeoutMs: 2500` creates both a local timeout and `vrpc-options: timeout=2500ms`. The create-time value is the client default and may be overridden per call; a vRPC timeout must be a positive safe integer.

## 3. Automatic CBOR

A generated method without Binary has no wire and uses JSON. A method whose arguments or result contain Binary includes the corresponding schema:

```ts
import type { VrpcCborCodec, VrpcMethodWireSpec } from "@yorun-ai/vrpc";

const uploadWire = {
  arguments: {
    kind: "object",
    fields: {
      content: { kind: "binary" },
      chunks: {
        kind: "map",
        key: "int",
        value: { kind: "binary" },
      },
    },
  },
} as const satisfies VrpcMethodWireSpec;

const cborCodec: VrpcCborCodec = {
  encode: (value) => cbor.encode(value),
  decode: (bytes) => cbor.decode(bytes),
};

const client = createVrpcClient({
  prefixUrl,
  clientInfo,
  cborCodec,
});

await client.invoke({
  serviceName: "file.FileService",
  methodName: "upload",
  params: {
    content: new Uint8Array([1, 2]),
    chunks: {
      1: new Uint8Array([3]),
    },
  },
  options: {
    wire: uploadWire,
  },
});
```

Selection depends entirely on wire-property presence:

- `arguments`: CBOR request.
- `result`: CBOR response negotiation.
- Both: CBOR in both directions.
- Wire without a codec throws a configuration error before transport.

Wire never appears in the HTTP body, custom headers, or transport request.

## 4. Protocol helpers

```ts
import {
  buildVrpcHeaders,
  buildVrpcPath,
  buildVrpcRequestBody,
  generateVrpcId,
  parseVrpcResponse,
  unwrapVrpcResponse,
} from "@yorun-ai/vrpc";

const path = buildVrpcPath("user.UserService", "getUser");
const headers = buildVrpcHeaders({
  clientInfo,
  trace: { id: generateVrpcId() },
  timeoutMs: 3_000,
});
const body = buildVrpcRequestBody({ userId: 1 });
```

`parseVrpcResponse` returns a normalized result without throwing; `unwrapVrpcResponse` throws `VrpcInvokeError` on failure. A fully custom HTTP client is responsible for JSON/CBOR decoding of the response body; `createVrpcClient` handles it when using a runtime transport.

## 5. Custom transport

A transport performs I/O only, and the response body must remain raw bytes:

```ts
const transport: VrpcTransport = {
  async request(request) {
    const response = await customRequest(request.url, request.init);
    return {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
      body: response.bytes.length ? response.bytes : null,
      url: response.url,
    };
  },
};
```

A transport does not parse JSON/CBOR, evaluate `vrpc-status`, handle `suppressGlobalToast`, or regenerate paths or headers.
