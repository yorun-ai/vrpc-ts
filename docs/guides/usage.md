# Usage

## 1. Generic HTTP client

```ts
import { createHttpClient, isHttpError } from "@yorun-ai/vrpc/http";

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
    if (isHttpError(error) && error.kind === "abort") {
      return;
    }
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
- Response parsing is intentionally lenient and independent of `content-type`: an empty body returns `null`, valid JSON is decoded, and any other body is returned as text.
- A timeout throws `HttpTimeoutError`; a non-2xx response throws `HttpInvokeError`.

## 2. vRPC client

```ts
import { createVrpcClient, getClientInstanceId, isVrpcError } from "@yorun-ai/vrpc/client";

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
    if (isVrpcError(error) && error.kind === "abort") {
      return;
    }
    if (context.options.suppressGlobalToast) {
      return;
    }

    if (isVrpcError(error) && error.kind === "invoke") {
      console.error(error.status, error.vrpcStatus, error.code, error.reason);
      return;
    }

    console.error(error);
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

## 3. Error handling

The vRPC entry point exposes one client-level guard, `isVrpcError`. After it succeeds, use only the discriminating `kind` field for error policy and server business fields:

```ts
import { isVrpcError } from "@yorun-ai/vrpc";

function handleVrpcError(error: unknown) {
  if (!isVrpcError(error)) {
    console.error("Unexpected error", error);
    return;
  }

  switch (error.kind) {
    case "abort":
      return;
    case "timeout":
      console.error(`Request timed out after ${error.timeoutMs}ms`);
      return;
    case "transport":
      console.error("Network request failed", error.cause);
      return;
    case "invoke":
      console.error(error.status, error.vrpcStatus, error.code, error.reason, error.message);
      return;
    case "protocol":
      console.error("Invalid vRPC response", error.cause);
      return;
  }
}
```

The generic HTTP entry point exposes the equivalent `isHttpError` guard. Both guards recognize only normalized errors produced by this package; compatibility handling for native Fetch and custom adapter errors stays inside the transport boundary. Error classes remain available for compatibility and specialized tests, but ordinary application code does not need a second `instanceof` check after the guard.

| `kind`      | Client        | Meaning                                                                                    |
| ----------- | ------------- | ------------------------------------------------------------------------------------------ |
| `abort`     | HTTP and vRPC | The caller canceled through an `AbortSignal`. Usually silent in the UI.                    |
| `timeout`   | HTTP and vRPC | The configured client timeout expired.                                                     |
| `transport` | HTTP and vRPC | No usable HTTP response was received. The original adapter error is available as `cause`.  |
| `invoke`    | HTTP and vRPC | The server rejected the invocation. vRPC errors expose `vrpcStatus`, `code`, and `reason`. |
| `protocol`  | vRPC only     | Required vRPC metadata is missing, or a successful response cannot be decoded.             |

`VrpcInvokeError` uses `vrpc-status` as the authoritative vRPC outcome. The body error is auxiliary: `code` identifies the business category, `reason` identifies a more specific case, and a non-empty `detail` remains appended to `message`. If a failed vRPC response has an undecodable body, the client still throws `VrpcInvokeError` and records the decoding failure in `cause`.

An interceptor `onError` observes the error but does not consume it; the request promise still rejects. Put the `abort` check before logging or global toast logic when caller cancellation should be quiet.

Recommended application policy:

- Handle `abort` once in the global `onError` interceptor and show no error UI.
- Handle `timeout`, `transport`, and `protocol` globally with a stable user-facing message; retain `cause` for logging or reporting rather than displaying it directly.
- Branch on expected `invoke` values such as `code` and `reason` near the feature that understands them. Use `suppressGlobalToast` when that feature owns the UI, preventing duplicate messages.
- Treat values that fail `isVrpcError` as configuration, interceptor, or other unexpected application errors; do not silently classify them as network failures.

### Global `onError` and local `try/catch`

Global and local handlers have different responsibilities. A global `onError` interceptor is suitable for shared logging, reporting, and fallback UI. A local `try/catch` is suitable for an expected business outcome that the current feature can explain or recover from.

```ts
client.use({
  onError(error, context) {
    if (isVrpcError(error) && error.kind === "abort") {
      return;
    }

    reportError(error);

    if (!context.options.suppressGlobalToast) {
      showToast("Request failed. Please try again.");
    }
  },
});

async function loadProfile() {
  try {
    return await client.invoke({
      serviceName: "user.UserService",
      methodName: "getProfile",
      params: { userId: 1 },
      options: {
        // This feature owns the error UI shown in the catch block below.
        suppressGlobalToast: true,
      },
    });
  } catch (error) {
    if (!isVrpcError(error)) {
      throw error;
    }

    if (error.kind === "abort") {
      return;
    }

    if (error.kind === "invoke" && error.code === "USER" && error.reason === "NOT_FOUND") {
      showToast(error.message);
      return;
    }

    // suppressGlobalToast also suppressed the global fallback, so keep a local fallback.
    showToast("Unable to load the profile. Please try again.");
  }
}
```

For transport and response failures, the lifecycle is:

```text
request fails -> onError runs -> the Promise rejects -> local catch runs
```

`onError` should perform side effects and complete normally. It does not turn a failed request into a successful result; after the interceptors complete, the request Promise still rejects.

`suppressGlobalToast` is policy metadata for application interceptors. The package does not display or suppress UI by itself. Setting it to `true` does not skip `onError`, logging, or Promise rejection; it only has an effect when an interceptor reads `context.options.suppressGlobalToast`. A per-request `true` or `false` overrides the client-level default. Set it to `true` only when the local caller owns a complete error experience, including a fallback for errors it does not specifically recognize.

Request-construction errors that occur before an interceptor context exists, such as invalid configuration, reject directly and may only reach the local `catch`. The same global/local pattern applies to the generic HTTP client with `isHttpError`.

## 4. Cancel requests

Both clients accept an `AbortSignal` through `requestInit.signal`:

```ts
import { isVrpcError } from "@yorun-ai/vrpc";

const controller = new AbortController();
const request = client.invoke({
  serviceName: "user.UserService",
  methodName: "getUser",
  params: { userId: 1 },
  options: {
    requestInit: { signal: controller.signal },
  },
});

// For example: the user closes a dialog or navigates away.
controller.abort();

try {
  await request;
} catch (error) {
  if (!(isVrpcError(error) && error.kind === "abort")) {
    throw error;
  }
}
```

Cancellation remains a rejected promise so frameworks and callers can finish loading-state cleanup. The normalized error preserves a custom `controller.abort(reason)` value as `reason` and the underlying runtime error as `cause`. A single controller may cancel multiple requests that share its signal. Aborting after a request has settled has no effect.

Timeouts may also use `AbortController` internally, but they remain `kind: "timeout"`; applications should not silently treat them as caller cancellation.

## 5. Automatic CBOR

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

## 6. Protocol helpers

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

## 7. Custom transport

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
