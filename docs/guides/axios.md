# Axios integration

Axios can send JSON vRPC directly or be wrapped as a runtime transport. When automatic CBOR, wire schemas, interceptors, and consistent error semantics are needed, wrap Axios as a transport and use it with `createVrpcClient`.

## Option A: send JSON vRPC directly

```ts
import axios from "axios";
import {
  buildVrpcHeaders,
  buildVrpcPath,
  buildVrpcRequestBody,
  generateVrpcId,
  unwrapVrpcResponse,
} from "@yorun-ai/vrpc";

const clientInfo = {
  clientName: "demo.browser",
  clientVersion: "1.0.0",
  clientInstanceId: crypto.randomUUID(),
};

async function invoke<T>(serviceName: string, methodName: string, params: Record<string, unknown>) {
  const timeoutMs = 3_000;
  const response = await axios.request({
    baseURL: "https://api.example.com/invoke",
    url: buildVrpcPath(serviceName, methodName),
    method: "POST",
    headers: Object.fromEntries(
      buildVrpcHeaders({
        clientInfo,
        trace: { id: generateVrpcId() },
        timeoutMs,
      }).entries(),
    ),
    data: buildVrpcRequestBody(params),
    timeout: timeoutMs,
    validateStatus: () => true,
  });

  return unwrapVrpcResponse<T>(
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url: response.config.url,
      method: "POST",
    },
    response.data,
  );
}
```

This path supports JSON only. The caller must send `vrpc-trace`, `vrpc-client`, and optional `vrpc-options` headers and decode the response payload. Axios defaults `timeout` to `0` (no timeout); when a timeout is required, use the same value for the local `timeout` and `vrpc-options`.

## Option B: Axios transport

A runtime transport returns the response body as raw bytes:

```ts
import axios from "axios";
import type { VrpcTransport } from "@yorun-ai/vrpc";

export const axiosTransport: VrpcTransport = {
  async request(request) {
    const response = await axios.request<ArrayBuffer>({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(new Headers(request.headers).entries()),
      data: request.body,
      signal: request.signal ?? undefined,
      timeout: request.timeoutMs,
      withCredentials: request.init.credentials === "include",
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    const body = response.data.byteLength ? new Uint8Array(response.data) : null;

    return {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers as Record<string, string>),
      body,
      url: request.url,
    };
  },
};
```

Connect it to the runtime:

```ts
const client = createVrpcClient({
  prefixUrl: "https://api.example.com/invoke",
  transport: axiosTransport,
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: crypto.randomUUID(),
  },
  cborCodec,
});
```

Constraints:

- Use the complete `request.url` already calculated by the core.
- A custom transport applies optional `request.timeoutMs` to local I/O; when omitted it is `undefined` and the runtime enables no timeout.
- Do not regenerate the path, headers, or envelope.
- Do not parse JSON/CBOR or call `parseVrpcResponse`.
- Do not read `wire` or `suppressGlobalToast`; these fields never enter the transport request.
- The request body may be a JSON string or a CBOR `ArrayBuffer`.
- The response must return `Uint8Array | null` so the runtime can decode it according to content-type.
- Cookies are controlled by `requestInit.credentials: "include"`.
