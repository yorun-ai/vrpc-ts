# Protocol helpers for non-browser runtimes

Use `@yorun-ai/vrpc/protocol` when the platform owns HTTP I/O and does not provide Fetch objects, for example a miniapp using a native request API. This entry needs no `fetch`, `Headers`, `Response`, `XMLHttpRequest`, or DOM type library and installs no globals. It is an additive entry in the same package, not a polyfill package.

The existing root, `/client`, and `/http` entries keep their published behavior. Their browser helpers still return `Headers` and use `Response`; existing applications need no migration.

For a native request example and generated-SDK compatibility, see [Taro integration](./taro.md).

## Build a request

```ts
import {
  buildVrpcHeaderRecord,
  buildVrpcPath,
  encodeVrpcRequestBody,
  generateVrpcId,
  mergeVrpcApplicationHeaders,
} from "@yorun-ai/vrpc/protocol";

const path = buildVrpcPath("user.UserService", "getProfile");
const headers = {
  ...mergeVrpcApplicationHeaders({ Authorization: "Bearer token" }),
  ...buildVrpcHeaderRecord({
    clientInfo: {
      clientName: "demo.miniapp",
      clientVersion: "1.0.0",
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
    },
    trace: { id: generateVrpcId() },
    timeoutMs: 15_000,
  }),
};
const body = await encodeVrpcRequestBody({ userId: 1 }, undefined, undefined);
// Send POST <invoke-prefix>/<path> using the platform API, headers and body.
```

The header builder validates client identity, traces and timeout values. Merge application headers before applying protocol headers; the merge helper rejects reserved names, including case variants. Use the generated method's wire schemas and a `cborCodec` when encoding or decoding Binary methods. Wire metadata is client-only and never enters the request envelope.

## Read a response

The adapter supplies response metadata and body readers. Readers can return values or Promises; cache bytes in the adapter if they must be read more than once. They must preserve the original bytes and decode text as UTF-8.

```ts
import { decodeVrpcResponse, VrpcResponseError } from "@yorun-ai/vrpc/protocol";

try {
  const profile = await decodeVrpcResponse<{ name: string }>({
    status: 200,
    headers: {
      "content-type": "application/vrpc+json",
      "vrpc-status": "OK",
      "vrpc-server":
        "name=demo.server,version=1.0.0,instanceId=22222222-2222-4222-8222-222222222222",
    },
    text: () => '{"result":{"name":"Ada"},"error":null}',
    arrayBuffer: () => new ArrayBuffer(0), // Actual binary bytes for CBOR responses.
  });
  // Use profile.name.
} catch (error) {
  if (error instanceof VrpcResponseError) {
    // error.kind is "invoke" or "protocol"; headers are a plain record.
    // Branch on error.vrpcStatus/code/reason, not human-readable messages.
  }
}
```

`decodeVrpcResponse` validates required server/status/content-type headers and the JSON/CBOR body. Successful HTTP status plus `vrpc-status: OK` returns the result. Failed status throws an invocation error; an unreadable failure body preserves that outcome and attaches its decoding cause. Malformed successful responses throw protocol errors. This matches the status precedence of the browser client.

`parseVrpcResponseData` and `unwrapVrpcResponseData` work on already decoded envelopes and do **not** replace full decoding/metadata validation. The new `VrpcResponseError` has plain header data and is intentionally separate from browser `VrpcInvokeError`/`VrpcProtocolError`. Use its own class and `kind`; the existing `isVrpcError` guard remains specific to the browser client's error contract.

## Adapter responsibilities

The platform adapter owns URL configuration, I/O, UTF-8 body reading, native cancellation, local timeout enforcement, storage, authentication and interception policy. Protocol helpers do not create timers, automatically send requests, store tokens, or access localStorage. A timeout header alone does not implement a local timeout.

Generated factories requiring `VrpcClient` still require `invoke()` and `use()`; the published interface and browser behavior are unchanged. A Taro application can define its own data hooks and errors using this entry. Its `use()` may register the supported legacy request/error hooks and explicitly reject browser Response hooks, directing callers to its local data-hook API. This is an opt-in Taro usage change, not full browser-hook compatibility. See [Taro integration](taro.md) for the application-local contract; no new client types or factories are added to the runtime. Do not cast an incomplete adapter to `VrpcClient` or silently discard hooks.

Use `decodeVrpcResponseData` when an adapter needs the fully validated, decoded outcome before deciding how to throw or run response hooks. Unlike `decodeVrpcResponse`, it returns a decoded invocation failure as `{ ok: false, ... }`. Undecodable responses still throw `VrpcResponseError` with the same status precedence. This allows an adapter to preserve its existing hook ordering and error classes without reimplementing decoding.
