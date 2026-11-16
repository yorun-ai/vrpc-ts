# Taro integration

Use `Taro.request` for network I/O and `@yorun-ai/vrpc/protocol` for encoding, response validation and result handling. The protocol entry is available starting in 0.11.0. The existing browser clients and skelc-generated factories do not change.

The package does not export a Taro client factory or Taro-specific types. This guide provides a complete **application-owned** wrapper with data response hooks. Copy it into your application and maintain it there. See [Protocol helpers](./protocol.md) for the shared protocol boundary and [Upgrading to 0.11.0](./upgrading-0.11.md) for migration details.

## Copy the adapter

Copy both files into the same application directory, for example `src/lib/`:

| File                                                    | Responsibility                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [taro-client.ts](../examples/taro/taro-client.ts)       | Default/per-call options, protocol headers and body, decoded responses, hooks and protocol errors. |
| [taro-transport.ts](../examples/taro/taro-transport.ts) | `Taro.request`, raw response bytes, native timeout/cancellation and network errors.                |

Install the dependencies in your existing Taro application:

```sh
pnpm add --save-exact @yorun-ai/vrpc@0.11.0 fast-text-encoding@1.0.6
```

Taro remains an application dependency. `fast-text-encoding` supplies UTF-8 decoding where the runtime lacks it; it is independent of Fetch compatibility. The wrapper does not create or install `fetch`, `Headers` or `Response`, including in error handlers and response hooks.

The official `@tarojs/taro-h5@4.3.3` package itself depends on and imports `whatwg-fetch`. **Leave that official H5 dependency unchanged.** Removing the wrapper's direct dependency does not remove the H5 transitive dependency from the lockfile. Do not replace it with an empty package or modify the official Taro runtime to hide it.

## Create one application client

The application owns its API URL, authentication and instance-ID storage:

```ts
import Taro from "@tarojs/taro";
import { generateClientInstanceId } from "@yorun-ai/vrpc/protocol";
import { createTaroVrpcClient } from "./taro-client";

function clientInstanceId(): string {
  const key = "demo.vrpc.clientInstanceId";
  const existing = Taro.getStorageSync<string>(key);
  if (existing) return existing;
  const value = generateClientInstanceId();
  Taro.setStorageSync(key, value);
  return value;
}

export function createApiClient(prefixUrl: string, accessToken?: string) {
  return createTaroVrpcClient(Taro.request, {
    prefixUrl,
    clientInfo: {
      clientName: "demo.miniapp",
      clientVersion: "1.0.0",
      clientInstanceId: clientInstanceId(),
    },
    timeoutMs: 15_000,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}
```

Use a complete HTTP(S) invoke prefix without a query or fragment, such as `https://api.example.com/invoke`. The example wrapper defaults to 15 seconds; this is its application policy, not a new default in `createVrpcClient`. Create the client once per application/authentication lifecycle and reuse it. Never place a server secret in a client URL, environment variable or request header.

## Use the generated service factory unchanged

```ts
import { createItemService } from "./api/catalog/service";
import { createApiClient } from "./lib/api-client";

const client = createApiClient("https://api.example.com/invoke");
const items = createItemService(client);

const list = await items.listItems(null);
const detail = await items.getItem({ id: "example" });
```

Replace the illustrative service import and method names with your generated SDK. Generated methods still call `client.invoke()` with their service/method names, parameters, per-call options and wire schemas. Do not edit generated factories, cast the client, copy DTOs or hard-code business request envelopes.

The example's `TaroVrpcClient` and `TaroVrpcInterceptor` types are declared **in the copied file**, not exported by `@yorun-ai/vrpc`. The wrapper implements the unchanged invocation boundary and retains a working `use()` for request/error hooks. Its browser Response hooks are intentionally unsupported; use the local data API below.

## Register data hooks

```ts
import { isVrpcError } from "@yorun-ai/vrpc/client";
import { VrpcResponseError } from "@yorun-ai/vrpc/protocol";
import type { TaroVrpcClient } from "./taro-client";

export function installHooks(client: TaroVrpcClient) {
  client.useData({
    beforeRequest(context) {
      console.log(context.request.serviceName, context.request.methodName);
    },
    afterResponse(response) {
      console.log(response.status, response.headers["vrpc-status"]);
      // Already decoded: response.payload, response.result and response.error.
    },
    onError(error, context) {
      if (isVrpcError(error) && error.kind === "abort") return;
      if (error instanceof VrpcResponseError) {
        console.error(error.kind, error.vrpcStatus, error.code, error.message);
      } else {
        console.error(error);
      }
      if (!context.options.suppressGlobalToast) {
        // The application owns its error UI; the request still rejects.
      }
    },
  });
}
```

The wrapper's constructor `interceptors` option uses the same data-hook contract as `useData`. Registering `use({ beforeRequest, onError })` also works. Registering the old `use({ afterResponse })` throws immediately with a migration message, before registering any hook from that object. Nothing is silently ignored and no plain object is passed off as a Fetch `Response`.

Data response hooks read the parsed result directly. Use `response.headers["content-type"]`, not `headers.get()`; use `response.result` or `response.payload`, not `response.json()` or `clone()`. This behavior is the same on Taro H5 and native miniapps.

The lifecycle is:

```text
merge options -> encode with /protocol -> beforeRequest
  -> Taro.request -> decodeVrpcResponseData
  -> data afterResponse hooks -> result or VrpcResponseError
  -> onError on failure -> rejected promise
```

A decoded invocation failure reaches data response hooks before it is thrown. Malformed responses skip response hooks and go directly to error handling. Request-construction failures before a context exists reject directly. A normally completed `onError` hook does not recover the failed request or suppress its rejection.

## Errors, cancellation and CBOR

The protocol entry's `VrpcResponseError` carries `kind: "protocol" | "invoke"`, status, plain `responseHeaders`, `vrpcStatus`, payload and optional server error fields. Handle it with `instanceof VrpcResponseError`. It is intentionally separate from the browser client's `VrpcInvokeError` / `VrpcProtocolError` and is not recognized by `isVrpcError`.

Native cancellation, timeout and network failures are normalized to the existing `HttpAbortError`, `HttpTimeoutError` and `HttpTransportError`; `isVrpcError` continues to recognize these shared lifecycle errors. Old browser errors and their guard remain unchanged.

Supply a platform-supported `AbortSignal` through per-call `requestInit.signal`. The transport connects it to `RequestTask.abort()`, handles already-aborted signals and removes listeners after completion. Requests use the resolved timeout both locally and in `vrpc-options`. If the target runtime lacks `AbortController`, the application must supply a compatible implementation when it needs caller cancellation. See the official [request API](https://docs.taro.zone/docs/apis/network/request/) and [RequestTask API](https://docs.taro.zone/docs/apis/network/request/RequestTask).

For generated Binary methods, provide `cborCodec` to `createTaroVrpcClient`. The generated SDK supplies `options.wire`; the wrapper forwards its schemas to protocol encoding/decoding. Do not send wire metadata to the server or implement a second binary conversion layer. Requests preserve strings/ArrayBuffers and responses preserve bytes before UTF-8/CBOR decoding.

## Migrate an existing Taro wrapper

1. Upgrade to the published 0.11.0 package, copy both adapter files and run application type checks.
2. Move old Response hooks to `useData` or the wrapper's data `interceptors` option. Change response/header reads as described above.
3. Handle protocol/business errors with `VrpcResponseError`; retain the shared lifecycle-error handling.
4. Delete the application-owned Response conversion module, its `whatwg-fetch` import/type declarations and the **direct** dependency. Update the lockfile; preserve Taro H5's transitive dependency.
5. Keep generated SDK files unchanged. Test each target before delivering the updated application.

This wrapper is an opt-in Taro usage change, not a drop-in implementation of every browser Response callback. Existing browser applications can keep `createVrpcClient` and their existing hooks without any migration.

## Platform verification

Verify H5, WeChat and Lark separately: success, decoded failures, malformed responses, Chinese/emoji text, binary schemas, timeout, cancellation, hook order and generated-SDK type checking. H5 success does not establish native miniapp compatibility. For H5 cross-origin requests, allow request vRPC headers and expose response vRPC headers through CORS. Miniapp devices need a reachable API URL and configured request-domain permissions; a device's localhost is not the development computer.
